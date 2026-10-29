const vscode = require('vscode');
const childProcess = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { createHardwareCommands } = require('./hardware');
const { createJtagDriverSetup } = require('./jtag-driver');
const { createVariableSearch, combineTrackers } = require('./variable-search');

let backendProcess;
let backendRoot;
let backendPort;
let output;
let status;
let extensionRoot;
let uploading = false;
let debugSession;
const debugReadiness = new Map();

function activate(context) {
    extensionRoot = context.extensionPath;
    output = vscode.window.createOutputChannel('MiniCtrlBox Digital Twin');
    status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    status.name = 'MiniCtrlBox: Digital Twin';
    setRunning(false);
    status.show();

    const treeProvider = new DigitalTwinTreeProvider();
    const ensureDriver = createJtagDriverSetup(vscode, output, context);
    const hardware = createHardwareCommands(vscode, output, getWorkspaceRoot, ensureDriver);
    const variableSearch = createVariableSearch(vscode, output);

    context.subscriptions.push(
        output,
        status,
        vscode.window.registerTreeDataProvider('mcbDigitalTwin.control', treeProvider),
        vscode.commands.registerCommand('mcbDigitalTwin.start', start),
        vscode.commands.registerCommand('mcbDigitalTwin.menu', showControls),
        vscode.commands.registerCommand('mcbDigitalTwin.stop', stop),
        vscode.commands.registerCommand('mcbDigitalTwin.restart', restart),
        vscode.commands.registerCommand('mcbDigitalTwin.open', open),
        vscode.commands.registerCommand('mcbDigitalTwin.test', test),
        vscode.commands.registerCommand('mcbDigitalTwin.upload', () => upload()),
        vscode.commands.registerCommand('mcbDigitalTwin.debug', () => upload(true)),
        vscode.commands.registerCommand('mcbDigitalTwin.hardwareUpload', hardware.upload),
        vscode.commands.registerCommand('mcbDigitalTwin.hardwareDebug', hardware.debug),
        vscode.commands.registerCommand('mcbDigitalTwin.searchVariables', variableSearch.search),
        vscode.commands.registerCommand('mcbDigitalTwin.hardwareDrivers', async () => {
            try { await ensureDriver(true); }
            catch (error) { output.appendLine(error.message); vscode.window.showErrorMessage(error.message); }
        }),
        vscode.debug.registerDebugAdapterTrackerFactory('*', {
            createDebugAdapterTracker(session) {
                const variableTracker = variableSearch.createDebugAdapterTracker(session);
                const hardwareTracker = hardware.createDebugAdapterTracker(session);
                if (hardwareTracker) return combineTrackers(variableTracker, hardwareTracker);
                const config = session.configuration;
                const ready = debugReadiness.get(`${config.mcbPort}:${config.mcbProcessId}`);
                if (!ready) return variableTracker;
                return combineTrackers(variableTracker, {
                    onDidSendMessage(message) {
                        if (message.type === 'response' && message.success === false) {
                            ready.error = message.message || 'Debugger-Anfrage fehlgeschlagen.';
                        }
                        if (message.type === 'response' && message.command === 'configurationDone' && message.success) ready.configured = true;
                        if ((config.type === 'cppvsdbg' && message.event === 'attachComplete')
                            || (config.type === 'cppdbg' && message.type === 'response' && message.command === 'attach' && message.success)) ready.attached = true;
                        if (message.event === 'terminated') ready.error = 'Debugger wurde vor dem Programmstart beendet.';
                    },
                    onError(error) { ready.error = error.message; },
                    onExit() { ready.error = 'Debugger wurde vor dem Programmstart beendet.'; },
                });
            },
        }),
        vscode.debug.onDidStartDebugSession(session => {
            hardware.sessionStarted(session);
            if (session.configuration.mcbProcessId) debugSession = session;
        }),
        vscode.debug.onDidTerminateDebugSession(async session => {
            hardware.sessionTerminated(session);
            const config = session.configuration;
            if (!config.mcbProcessId) return;
            if (debugSession?.id === session.id) debugSession = undefined;
            try {
                await postAction(config.mcbPort, { action: 'program_stop', processId: config.mcbProcessId });
            } catch (error) {
                output.appendLine(`Debug-Prozess aufräumen: ${error.message}`);
            }
        }),
    );
}

async function showControls() {
    const items = controlGroups().flatMap(group => [
        { label: group.label, kind: vscode.QuickPickItemKind.Separator },
        ...group.children.map(item => ({
            label: `$(${item.iconPath.id}) ${item.label}`,
            command: item.command.command,
        })),
    ]);
    const selected = await vscode.window.showQuickPick(items, {
        title: 'MCB Digital Twin',
        placeHolder: 'Aktion auswählen',
        matchOnDescription: true,
    });
    if (selected?.command) await vscode.commands.executeCommand(selected.command);
}

function controlGroups() {
    return new DigitalTwinTreeProvider().getChildren().filter(group => group.label !== 'Werkzeuge');
}

function controlTooltip(running) {
    const tooltip = new vscode.MarkdownString('', true);
    const commands = [];
    tooltip.appendMarkdown(`${running ? 'Digital Twin läuft' : 'Digital Twin gestoppt'}\n\n`);
    for (const group of controlGroups()) {
        tooltip.appendMarkdown(`**$(${group.iconPath.id}) ${group.label}**\n\n`);
        for (const item of group.children) {
            const command = item.command.command;
            commands.push(command);
            tooltip.appendMarkdown(`[$(${item.iconPath.id}) ${item.label}](command:${command})\n\n`);
        }
    }
    tooltip.isTrusted = { enabledCommands: commands };
    return tooltip;
}

class DigitalTwinTreeProvider {
    getTreeItem(item) {
        return item;
    }

    getChildren(element) {
        if (element) return element.children || [];
        return [
            this.createGroup('Digital Twin', 'Auf diesem PC simulieren', 'vm', [
                this.createItem('Projekt laden und starten', 'mcbDigitalTwin.upload', 'cloud-upload',
                    'Aktuelles C++-Projekt speichern, auf diesem PC bauen und im Digital Twin starten.'),
                this.createItem('Projekt debuggen', 'mcbDigitalTwin.debug', 'debug-alt',
                    'C++-Programm auf diesem PC mit Haltepunkten im Digital Twin debuggen.'),
                this.createItem('Oberfläche öffnen', 'mcbDigitalTwin.open', 'link-external',
                    'Digital Twin bei Bedarf starten und seine Browseroberfläche öffnen.'),
                this.createItem('Digital Twin beenden', 'mcbDigitalTwin.stop', 'debug-stop',
                    'Den von dieser Erweiterung gestarteten Simulator beenden.'),
                this.createItem('Digital Twin neu starten', 'mcbDigitalTwin.restart', 'debug-restart',
                    'Twin und zuletzt geladenes Programm neu starten. Der EEPROM-Inhalt bleibt erhalten.'),
            ]),
            this.createGroup('Echte Hardware', 'MiniCtrlBox über USB', 'circuit-board', [
                this.createItem('Programm übertragen', 'mcbDigitalTwin.hardwareUpload', 'arrow-up',
                    'Firmware auf die über USB angeschlossene echte MiniCtrlBox übertragen.'),
                this.createItem('Hardware debuggen', 'mcbDigitalTwin.hardwareDebug', 'debug-alt',
                    'Debug-Firmware auf die echte MiniCtrlBox übertragen und USB-JTAG-Debugging starten.'),
            ]),
            this.createGroup('Werkzeuge', 'Tests und Einrichtung', 'tools', [
                this.createItem('Variable suchen und überwachen', 'mcbDigitalTwin.searchVariables', 'search',
                    'Am Haltepunkt Variablen suchen und direkt zu Watch hinzufügen.'),
                this.createItem('Simulator testen', 'mcbDigitalTwin.test', 'beaker',
                    'Automatisierte Tests des Python-Simulators ausführen.'),
                this.createItem('USB-JTAG-Treiber einrichten', 'mcbDigitalTwin.hardwareDrivers', 'plug',
                    'Windows-Treiber für das Debuggen der echten MiniCtrlBox prüfen und bei Bedarf einrichten.'),
            ], false),
        ];
    }

    createGroup(label, tooltip, icon, children, expanded = true) {
        const item = new vscode.TreeItem(label, expanded
            ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed);
        item.id = `mcbDigitalTwin.group.${label}`;
        item.tooltip = tooltip;
        item.iconPath = new vscode.ThemeIcon(icon);
        item.children = children;
        return item;
    }

    createItem(label, command, icon, tooltip) {
        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
        item.command = { command, title: label };
        item.iconPath = new vscode.ThemeIcon(icon);
        item.tooltip = tooltip;
        return item;
    }
}

function getWorkspaceRoot() {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
        if (folder) return folder.uri.fsPath;
    }
    const folders = vscode.workspace.workspaceFolders;
    return folders && folders.length ? folders[0].uri.fsPath : undefined;
}

function loadProject() {
    const root = getWorkspaceRoot();
    if (!root) throw new Error('Kein Projektordner geöffnet.');
    const configPath = path.join(root, 'mcb-digital-twin.json');
    const bundledPythonRoot = path.join(extensionRoot, 'python');
    const bundledSimulation = path.join(bundledPythonRoot, 'mcb_digital_twin');
    const defaults = {
        name: path.basename(root),
        backend: path.join(bundledSimulation, 'web_app.py'),
        testDirectory: bundledSimulation,
        port: 8765,
        autoOpen: true,
    };
    if (!fs.existsSync(configPath)) return { root, ...defaults };
    const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return { root, ...defaults, ...fileConfig };
}

async function ensureStarted(project) {
    const backend = path.isAbsolute(project.backend)
        ? project.backend
        : path.resolve(project.root, project.backend);
    if (!fs.existsSync(backend)) {
        throw new Error(`Backend nicht gefunden: ${backend}`);
    }

    backendRoot = project.root;
    backendPort = project.port;
    if (await isHealthy(backendPort)) {
        setRunning(true);
        return;
    }

    const python = vscode.workspace.getConfiguration('mcbDigitalTwin')
        .get('pythonPath', 'python3');
    output.clear();
    output.appendLine(`Starte ${project.name}`);
    output.appendLine(`${python} ${backend} --port ${backendPort}`);
    const child = childProcess.spawn(
        python,
        [backend, '--port', String(backendPort), '--project-root', project.root],
        {
            cwd: project.root,
            env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
        },
    );
    backendProcess = child;
    child.stdout.on('data', data => output.append(data.toString()));
    child.stderr.on('data', data => output.append(data.toString()));
    child.on('error', error => {
        output.appendLine(`Startfehler: ${error.message}`);
        setRunning(false);
    });
    child.on('exit', code => {
        output.appendLine(`Backend beendet (Code ${code}).`);
        if (backendProcess === child) {
            backendProcess = undefined;
            setRunning(false);
        }
    });

    await waitUntilHealthy(backendPort);
    setRunning(true);
}

async function start() {
    try {
        const project = loadProject();
        await ensureStarted(project);
        vscode.window.showInformationMessage('MiniCtrlBox Digital Twin läuft.');
        if (project.autoOpen) await openAtPort(project.port);
    } catch (error) {
        output.show(true);
        vscode.window.showErrorMessage(error.message);
    }
}

async function restart() {
    if (uploading) return;
    uploading = true;
    try {
        if (debugSession) throw new Error('Bitte zuerst die laufende MiniCtrlBox-Debugsitzung beenden.');
        const project = loadProject();
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'MiniCtrlBox: Digital Twin neu starten',
            cancellable: false,
        }, async () => {
            await ensureStarted(project);
            await postAction(project.port, { action: 'twin_restart' });
            await openAtPort(project.port);
        });
        vscode.window.showInformationMessage('Digital Twin neu gestartet. EEPROM bleibt erhalten.');
    } catch (error) {
        output.appendLine(error.message);
        output.show(true);
        vscode.window.showErrorMessage(error.message);
    } finally {
        uploading = false;
    }
}

async function upload(debug = false) {
    if (uploading) return;
    uploading = true;
    let debugTarget;
    try {
        if (debugSession) throw new Error('Bitte zuerst die laufende MiniCtrlBox-Debugsitzung beenden.');
        if (debug && !vscode.workspace.isTrusted) {
            throw new Error('C++-Debugging benötigt einen vertrauenswürdigen Projektordner in VS Code.');
        }
        if (debug && !vscode.extensions.getExtension('ms-vscode.cpptools')) {
            throw new Error('Zum C++-Debuggen bitte die Microsoft-Erweiterung „C/C++“ (ms-vscode.cpptools) installieren.');
        }
        const project = loadProject();
        const documents = vscode.workspace.textDocuments.filter(document => document.isDirty
            && vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath === project.root);
        if ((await Promise.all(documents.map(document => document.save()))).some(saved => !saved)) {
            throw new Error('Projektdateien konnten nicht gespeichert werden. Hochladen abgebrochen.');
        }
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: debug ? 'MiniCtrlBox: C++-Projekt debuggen' : 'MiniCtrlBox: Geöffnetes Projekt hochladen',
            cancellable: false,
        }, async progress => {
            progress.report({ message: 'Digital Twin wird gestartet …' });
            await ensureStarted(project);
            progress.report({ message: 'C++-Projekt wird gebaut und in den Twin geladen …' });
            output.show(true);
            output.appendLine(`Lade Anwenderprogramm aus ${project.root}`);
            const action = { action: 'program_start', path: project.root };
            if (debug) action.debug = true;
            const result = await postAction(project.port, action);
            if (!result.program_running) {
                throw new Error(result.program_error || 'Das Anwenderprogramm wurde nicht gestartet.');
            }
            output.appendLine(`Anwenderprogramm läuft: ${result.program_path || project.root}`);
            if (debug) {
                const target = result.program_debug;
                if (!target?.processId || !target.program || !['cppvsdbg', 'cppdbg'].includes(target.type)) {
                    await postAction(project.port, { action: 'program_stop' });
                    throw new Error('Dieses Backend unterstützt kein C++-Debugging. Bitte den alten Twin stoppen und mit der aktuellen Erweiterung neu starten.');
                }
                debugTarget = { port: project.port, processId: target.processId };
                const ready = { configured: false, attached: false };
                debugReadiness.set(`${project.port}:${target.processId}`, ready);
                const config = {
                    name: 'MiniCtrlBox: C++ im Digital Twin',
                    type: target.type, request: 'attach', program: target.program,
                    processId: target.processId,
                    mcbPort: project.port, mcbProcessId: target.processId,
                };
                if (target.type === 'cppdbg') {
                    config.MIMode = 'gdb';
                    config.miDebuggerPath = target.miDebuggerPath;
                }
                const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(project.root));
                if (!await vscode.debug.startDebugging(folder, config)) {
                    throw new Error('C++-Debugger wurde nicht gestartet. Details stehen in der Debugkonsole.');
                }
                // startDebugging can resolve before symbols and breakpoints
                // are installed. Keep setup gated until attachment is complete.
                for (let attempt = 0; !(ready.configured && ready.attached); attempt++) {
                    if (ready.error) throw new Error(ready.error);
                    if (attempt >= 300) throw new Error('Zeitüberschreitung beim Verbinden des C++-Debuggers.');
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                if (ready.error) throw new Error(ready.error);
                await postAction(project.port, { action: 'program_debug_continue', processId: target.processId });
            }
            await openAtPort(project.port);
        });
        vscode.window.showInformationMessage(debug
            ? 'C++-Debugger verbunden. Haltepunkte, Einzelschritte und Variablen stehen in VS Code bereit.'
            : `Projekt „${project.name}“ wurde in den Digital Twin geladen.`);
    } catch (error) {
        if (debugTarget) {
            if (debugSession?.configuration.mcbProcessId === debugTarget.processId) {
                try { await vscode.debug.stopDebugging(debugSession); } catch { /* Still stop the process below. */ }
            }
            try { await postAction(debugTarget.port, { action: 'program_stop', processId: debugTarget.processId }); }
            catch (cleanupError) { output.appendLine(`Debug-Prozess aufräumen: ${cleanupError.message}`); }
        }
        output.appendLine(`Hochladen fehlgeschlagen: ${error.message}`);
        output.show(true);
        vscode.window.showErrorMessage(error.message);
    } finally {
        if (debugTarget) debugReadiness.delete(`${debugTarget.port}:${debugTarget.processId}`);
        uploading = false;
    }
}

function postAction(port, action) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(action);
        const request = http.request({
            host: '127.0.0.1', port, path: '/api/action', method: 'POST', timeout: 90000,
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        }, response => {
            let data = '';
            response.setEncoding('utf8');
            response.on('data', chunk => { data += chunk; });
            response.on('error', reject);
            response.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (response.statusCode < 200 || response.statusCode >= 300) {
                        throw new Error(result.error || `Digital Twin meldet HTTP ${response.statusCode}.`);
                    }
                    resolve(result);
                } catch (error) { reject(error); }
            });
        });
        request.on('error', reject);
        request.on('timeout', () => { request.destroy(new Error('Zeitüberschreitung beim Laden des Anwenderprogramms.')); });
        request.end(body);
    });
}

async function stop() {
    if (debugSession) {
        const session = debugSession;
        await postAction(session.configuration.mcbPort, {
            action: 'program_stop', processId: session.configuration.mcbProcessId,
        });
        await vscode.debug.stopDebugging(session);
    }
    if (backendProcess && !backendProcess.killed) {
        backendProcess.kill('SIGTERM');
        backendProcess = undefined;
        setRunning(false);
        vscode.window.showInformationMessage('MiniCtrlBox Digital Twin wurde gestoppt.');
    } else {
        vscode.window.showInformationMessage('Kein von VS Code gestarteter Digital Twin läuft.');
    }
}

async function open() {
    try {
        const project = loadProject();
        await ensureStarted(project);
        await openAtPort(project.port);
    } catch (error) {
        vscode.window.showErrorMessage(error.message);
    }
}

async function openAtPort(port) {
    const localUri = vscode.Uri.parse(`http://127.0.0.1:${port}`);
    const uri = await vscode.env.asExternalUri(localUri);
    const inside = vscode.workspace.getConfiguration('mcbDigitalTwin')
        .get('openInsideVSCode', true);
    if (inside) {
        await vscode.commands.executeCommand('simpleBrowser.show', uri.toString(true));
    } else {
        await vscode.env.openExternal(uri);
    }
}

async function test() {
    try {
        const project = loadProject();
        const python = vscode.workspace.getConfiguration('mcbDigitalTwin')
            .get('pythonPath', 'python3');
        output.clear();
        output.show(true);
        const testDirectory = path.isAbsolute(project.testDirectory)
            ? project.testDirectory
            : path.resolve(project.root, project.testDirectory);
        const args = ['-m', 'unittest', 'discover', '-s', testDirectory,
            '-p', 'test_*.py', '-v'];
        const pythonPath = path.dirname(testDirectory);
        const result = childProcess.spawn(python, args, {
            cwd: project.root,
            env: {
                ...process.env,
                PYTHONPATH: process.env.PYTHONPATH
                    ? `${pythonPath}${path.delimiter}${process.env.PYTHONPATH}`
                    : pythonPath,
            },
        });
        result.stdout.on('data', data => output.append(data.toString()));
        result.stderr.on('data', data => output.append(data.toString()));
        result.on('exit', code => {
            const message = code === 0 ? 'Alle Digital-Twin-Tests bestanden.' : 'Digital-Twin-Tests fehlgeschlagen.';
            (code === 0 ? vscode.window.showInformationMessage : vscode.window.showErrorMessage)(message);
        });
    } catch (error) {
        vscode.window.showErrorMessage(error.message);
    }
}

function isHealthy(port) {
    return new Promise(resolve => {
        const request = http.get({ host: '127.0.0.1', port, path: '/api/state', timeout: 300 }, response => {
            response.resume();
            resolve(response.statusCode === 200);
        });
        request.on('error', () => resolve(false));
        request.on('timeout', () => { request.destroy(); resolve(false); });
    });
}

async function waitUntilHealthy(port) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
        if (await isHealthy(port)) return;
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new Error('Backend antwortet nicht auf /api/state. Details stehen in der Ausgabe.');
}

function setRunning(running) {
    status.text = `${running ? '$(vm)' : '$(debug-start)'} MCB Digital Twin $(chevron-down)`;
    status.tooltip = controlTooltip(running);
    status.accessibilityInformation = { label: `${running ? 'Digital Twin läuft' : 'Digital Twin gestoppt'} – Aktionen beim Darüberfahren; klicken öffnet die Seitenleiste` };
    status.command = 'mcbDigitalTwin.control.focus';
}

function deactivate() {
    if (backendProcess && !backendProcess.killed) backendProcess.kill('SIGTERM');
}

module.exports = { activate, deactivate };
