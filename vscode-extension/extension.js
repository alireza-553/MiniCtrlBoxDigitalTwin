const vscode = require('vscode');
const childProcess = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

let backendProcess;
let backendRoot;
let backendPort;
let output;
let status;
let extensionRoot;
let uploading = false;

function activate(context) {
    extensionRoot = context.extensionPath;
    output = vscode.window.createOutputChannel('MiniCtrlBox Digital Twin');
    status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    status.text = '$(debug-start) MCB Digital Twin';
    status.tooltip = 'MiniCtrlBox Digital Twin starten';
    status.command = 'mcbDigitalTwin.start';
    status.show();

    const treeProvider = new DigitalTwinTreeProvider();

    context.subscriptions.push(
        output,
        status,
        vscode.window.registerTreeDataProvider('mcbDigitalTwin.control', treeProvider),
        vscode.commands.registerCommand('mcbDigitalTwin.start', start),
        vscode.commands.registerCommand('mcbDigitalTwin.stop', stop),
        vscode.commands.registerCommand('mcbDigitalTwin.open', open),
        vscode.commands.registerCommand('mcbDigitalTwin.test', test),
        vscode.commands.registerCommand('mcbDigitalTwin.upload', upload),
    );
}

class DigitalTwinTreeProvider {
    getTreeItem(item) {
        return item;
    }

    getChildren() {
        return [
            this.createItem('Digital Twin starten', 'mcbDigitalTwin.start', 'play'),
            this.createItem('Geöffnetes Projekt hochladen', 'mcbDigitalTwin.upload', 'cloud-upload'),
            this.createItem('Digital Twin öffnen', 'mcbDigitalTwin.open', 'link-external'),
            this.createItem('Digital Twin testen', 'mcbDigitalTwin.test', 'beaker'),
            this.createItem('Digital Twin stoppen', 'mcbDigitalTwin.stop', 'debug-stop'),
        ];
    }

    createItem(label, command, icon) {
        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
        item.command = { command, title: label };
        item.iconPath = new vscode.ThemeIcon(icon);
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

async function upload() {
    if (uploading) return;
    uploading = true;
    try {
        const project = loadProject();
        const documents = vscode.workspace.textDocuments.filter(document => document.isDirty
            && vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath === project.root);
        if ((await Promise.all(documents.map(document => document.save()))).some(saved => !saved)) {
            throw new Error('Projektdateien konnten nicht gespeichert werden. Hochladen abgebrochen.');
        }
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'MiniCtrlBox: Geöffnetes Projekt hochladen',
            cancellable: false,
        }, async progress => {
            progress.report({ message: 'Digital Twin wird gestartet …' });
            await ensureStarted(project);
            progress.report({ message: 'C++-Projekt wird gebaut und in den Twin geladen …' });
            output.show(true);
            output.appendLine(`Lade Anwenderprogramm aus ${project.root}`);
            const result = await postAction(project.port, { action: 'program_start', path: project.root });
            if (!result.program_running) {
                throw new Error(result.program_error || 'Das Anwenderprogramm wurde nicht gestartet.');
            }
            output.appendLine(`Anwenderprogramm läuft: ${result.program_path || project.root}`);
            await openAtPort(project.port);
        });
        vscode.window.showInformationMessage(`Projekt „${project.name}“ wurde in den Digital Twin geladen.`);
    } catch (error) {
        output.appendLine(`Hochladen fehlgeschlagen: ${error.message}`);
        output.show(true);
        vscode.window.showErrorMessage(error.message);
    } finally {
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
    status.text = running ? '$(debug-stop) MCB Digital Twin' : '$(debug-start) MCB Digital Twin';
    status.tooltip = running ? 'Digital Twin läuft – klicken zum Öffnen' : 'Digital Twin starten';
    status.command = running ? 'mcbDigitalTwin.open' : 'mcbDigitalTwin.start';
}

function deactivate() {
    if (backendProcess && !backendProcess.killed) backendProcess.kill('SIGTERM');
}

module.exports = { activate, deactivate };
