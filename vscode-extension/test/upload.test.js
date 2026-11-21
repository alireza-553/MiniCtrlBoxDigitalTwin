const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const extensionRoot = path.resolve(__dirname, '..');

class TabInputText {
    constructor(uri) { this.uri = uri; }
}

class TabInputWebview {
    constructor(viewType) { this.viewType = viewType; }
}

function harness(options = {}) {
    const first = path.resolve('workspace-first');
    const selected = path.resolve(options.root || 'workspace-selected');
    const calls = { saved: [], requests: [], spawned: [], opened: [], errors: [], info: [], debug: [], statusItems: [], picks: [],
        saveDialogs: [], reports: [], settings: [], closedTabs: [], panels: [] };
    let terminated;
    let started;
    let trackerFactory;
    const commands = new Map();
    let tree;
    let healthy = !options.cold;
    const document = root => ({
        uri: { fsPath: path.join(root, 'src', 'main.cpp') }, isDirty: true,
        save: async () => { calls.saved.push(root); return !options.saveFailure; },
    });
    const docs = [document(first), document(selected)];
    const vscode = {
        version: '1.100.0',
        extensions: { getExtension: () => options.noDebugger ? undefined : {} },
        debug: {
            registerDebugAdapterTrackerFactory: (_, factory) => { trackerFactory = factory; return {}; },
            onDidStartDebugSession: callback => { started = callback; return {}; },
            onDidTerminateDebugSession: callback => { terminated = callback; return {}; },
            startDebugging: async (folder, configuration) => {
                calls.debug.push({ folder, configuration });
                if (options.debugRejected) return false;
                const session = { id: 'twin-debug', configuration };
                started(session);
                const tracker = trackerFactory.createDebugAdapterTracker(session);
                if (options.adapterFailure) {
                    tracker.onError(new Error('Debugger attach failed'));
                    return true;
                }
                // Adapter reports these after startDebugging has resolved.
                setTimeout(() => {
                    tracker.onDidSendMessage({ type: 'response', command: 'configurationDone', success: true });
                    tracker.onDidSendMessage(configuration.type === 'cppvsdbg'
                        ? { type: 'event', event: 'attachComplete' }
                        : { type: 'response', command: 'attach', success: true });
                    calls.debugReady = true;
                }, 10);
                return true;
            },
            stopDebugging: async session => terminated(session),
        },
        StatusBarAlignment: { Left: 1 }, ProgressLocation: { Notification: 15 },
        ViewColumn: { Active: -1 },
        ConfigurationTarget: { Workspace: 2 },
        TabInputText, TabInputWebview,
        QuickPickItemKind: { Separator: -1 },
        MarkdownString: class {
            constructor(value = '', supportThemeIcons = false) { this.value = value; this.supportThemeIcons = supportThemeIcons; }
            appendMarkdown(value) { this.value += value; return this; }
        },
        TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
        TreeItem: class { constructor(label) { this.label = label; } },
        ThemeIcon: class { constructor(id) { this.id = id; } },
        window: {
            tabGroups: {
                all: options.tabGroups || [],
                close: async (tabs, preserveFocus) => { calls.closedTabs.push({ tabs, preserveFocus }); return true; },
            },
            activeTextEditor: { document: docs[1] },
            createOutputChannel: () => ({ clear() {}, append() {}, appendLine() {}, show() {} }),
            createWebviewPanel: (viewType, title, column, panelOptions) => {
                let onDispose;
                const panel = {
                    viewType, title, column, panelOptions, reveals: 0,
                    webview: { set html(value) {
                        panel.html = value;
                        const src = value.match(/ src="([^"]+)"/)?.[1];
                        calls.opened.push([viewType, src]);
                    } },
                    reveal() { this.reveals++; },
                    onDidDispose(callback) { onDispose = callback; },
                    dispose() { onDispose(); },
                };
                calls.panels.push(panel);
                return panel;
            },
            createStatusBarItem: (alignment, priority) => {
                const item = { alignment, priority, show() {} };
                calls.statusItems.push(item);
                return item;
            },
            registerTreeDataProvider: (_, provider) => { tree = provider; return {}; },
            showErrorMessage: message => { calls.errors.push(message); },
            showInformationMessage: message => { calls.info.push(message); },
            showSaveDialog: async dialog => {
                calls.saveDialogs.push(dialog);
                return options.reportDestination;
            },
            showQuickPick: async (items, pickerOptions) => {
                calls.picks.push({ items: Array.from(items), options: pickerOptions });
                return items.find(item => item.command === options.pickCommand);
            },
            withProgress: async (_, run) => run({ report() {} }),
        },
        workspace: {
            fs: { writeFile: async (uri, bytes) => calls.reports.push({ uri, text: Buffer.from(bytes).toString('utf8') }) },
            isTrusted: true,
            textDocuments: docs,
            workspaceFolders: options.noWorkspace ? undefined : [{ uri: { fsPath: first } }, { uri: { fsPath: selected } }],
            getWorkspaceFolder: uri => {
                const root = [selected, first].find(folder => uri.fsPath === folder || uri.fsPath.startsWith(folder + path.sep));
                return root ? { uri: { fsPath: root } } : undefined;
            },
            getConfiguration: section => ({
                get: (key, fallback) => {
                    if (key === 'pythonPath') return 'python';
                    if (key === 'openInsideVSCode' && options.externalBrowser) return false;
                    return fallback;
                },
                update: async (key, value, target) => calls.settings.push({ section, key, value, target }),
            }),
        },
        commands: {
            registerCommand: (name, run) => { commands.set(name, run); return {}; },
            executeCommand: async (...args) => {
                if (commands.has(args[0])) return commands.get(args[0])(...args.slice(1));
                calls.opened.push(args);
            },
        },
        Uri: { parse: value => ({ toString: () => value }), file: fsPath => ({ fsPath }) },
        env: {
            asExternalUri: async uri => options.forwardedUri ? vscode.Uri.parse(options.forwardedUri) : uri,
            openExternal: async uri => { calls.opened.push(['external', uri.toString()]); },
        },
    };
    const fakeFS = {
        existsSync: file => file.endsWith('web_app.py') || (!options.noConfig && file === path.join(selected, 'mcb-digital-twin.json')),
        readFileSync: () => JSON.stringify({ port: options.port || 18769, autoOpen: false }),
    };
    const http = {
        get: (args, callback) => {
            const request = new EventEmitter();
            queueMicrotask(() => callback({ statusCode: healthy ? 200 : 503, resume() {} }));
            return request;
        },
        request: (args, callback) => {
            const request = new EventEmitter();
            request.end = body => {
                if (JSON.parse(body).action === 'program_debug_continue') assert.equal(calls.debugReady, true);
                calls.requests.push({ args, body: JSON.parse(body) });
                queueMicrotask(() => {
                    const response = new EventEmitter();
                    response.statusCode = options.buildFailure ? 400 : 200;
                    response.setEncoding = () => {};
                    callback(response);
                    response.emit('data', JSON.stringify(options.buildFailure
                        ? { error: 'Compiler: missing header' }
                        : { program_running: true, program_path: selected,
                            program_debug: options.oldBackend ? undefined : {
                                type: options.gdb ? 'cppdbg' : 'cppvsdbg', processId: '1234',
                                program: path.join(selected, 'program.exe'), miDebuggerPath: '/usr/bin/gdb',
                            } }));
                    response.emit('end');
                });
            };
            return request;
        },
    };
    const childProcess = {
        spawn: (...args) => {
            calls.spawned.push(args);
            if (options.live) return require('node:child_process').spawn(...args);
            healthy = true;
            const child = new EventEmitter();
            child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
            child.kill = () => { child.killed = true; child.emit('exit', 0); };
            queueMicrotask(() => {
                if (options.startFailure) { child.emit('error', new Error('Python fehlt')); return; }
                const port = options.assignedPorts?.[calls.spawned.length - 1] || options.assignedPort || options.port || 18769;
                const ready = 'MCB_READY ' + JSON.stringify({ port }) + '\n';
                child.stdout.emit('data', Buffer.from('Start\n' + ready.slice(0, 14)));
                child.stdout.emit('data', Buffer.from(ready.slice(14)));
            });
            return child;
        },
    };
    const sandbox = {
        module: { exports: {} }, process, Buffer, URL, setTimeout, clearTimeout,
        require: name => ({ vscode, fs: fakeFS, http: options.live ? require('node:http') : http, child_process: childProcess,
            './hardware': require(path.join(extensionRoot, 'hardware')),
            './hardware-diagnostics': require(path.join(extensionRoot, 'hardware-diagnostics')),
            './variable-search': require(path.join(extensionRoot, 'variable-search')),
            './local-tests': require(path.join(extensionRoot, 'local-tests')),
            './updates': { createUpdates: () => ({ start() {}, dispose() {}, check: async () => {} }) },
            './jtag-driver': require(path.join(extensionRoot, 'jtag-driver')) }[name] || require(name)),
    };
    vm.runInNewContext(fs.readFileSync(path.join(extensionRoot, 'extension.js'), 'utf8'), sandbox);
    sandbox.module.exports.activate({ extensionPath: extensionRoot, extension: { packageJSON: { version: '0.3.16' } }, subscriptions: [] });
    return { calls, selected, commands, tree, terminate: terminated, trackerFactory };
}

test('local unit tests are discoverable under Werkzeuge', () => {
    const h = harness();
    const tools = h.tree.getChildren().find(group => group.label === 'Werkzeuge');
    assert.ok(tools.children.some(item => item.label === 'Unit-Tests ausführen' && item.command.command === 'mcbDigitalTwin.unitTests'));
    assert.equal(typeof h.commands.get('mcbDigitalTwin.unitTests'), 'function');
});

test('update check is discoverable under Werkzeuge and registered', () => {
    const h = harness();
    const tools = h.tree.getChildren().find(group => group.label === 'Werkzeuge');
    assert.ok(tools.children.some(item => item.label === 'Nach Updates suchen' && item.command.command === 'mcbDigitalTwin.checkForUpdates'));
    assert.equal(typeof h.commands.get('mcbDigitalTwin.checkForUpdates'), 'function');
});

test('the PlatformIO startup command updates only workspace settings and closes matching clean tabs', async () => {
    const name = 'mcbDigitalTwin.disablePlatformIOStartupTabs';
    const tab = (file, root = 'workspace-selected', extra = {}) => ({
        input: new TabInputText({ path: `/${root}/${file}`, fsPath: path.resolve(root, file) }),
        ...extra,
    });
    const home = { input: new TabInputWebview('mainThreadWebview-pioHome') };
    const ini = tab('platformio.ini');
    const h = harness({ tabGroups: [
        { tabs: [home, tab('platformio.ini', 'workspace-first', { isDirty: true }), tab('main.cpp')] },
        { tabs: [ini, tab('platformio.ini', 'outside'), tab('platformio.ini', 'workspace-first', { isPinned: true }),
            { input: new TabInputWebview('mainThreadWebview-other'), label: 'PIO Home' }] },
    ] });
    const tools = h.tree.getChildren().find(group => group.label === 'Werkzeuge');
    assert.ok(tools.children.some(item => item.label === 'PlatformIO-Starttabs deaktivieren' && item.command.command === name));
    const manifest = require('../package.json');
    assert.ok(manifest.activationEvents.includes('onCommand:' + name));
    assert.ok(manifest.contributes.commands.some(command => command.command === name));
    await h.commands.get(name)();
    assert.deepEqual(h.calls.settings, [
        { section: 'platformio-ide', key: 'disablePIOHomeStartup', value: true, target: 2 },
        { section: 'platformio-ide', key: 'autoOpenPlatformIOIniFile', value: false, target: 2 },
    ]);
    assert.deepEqual(Array.from(h.calls.closedTabs[0].tabs), [home, ini]);
    assert.equal(h.calls.closedTabs[0].preserveFocus, true);
    assert.equal(h.calls.errors.length, 0);

    const noWorkspace = harness({ noWorkspace: true });
    await noWorkspace.commands.get(name)();
    assert.equal(noWorkspace.calls.settings.length, 0);
    assert.match(noWorkspace.calls.info[0], /Projektordner/);
});

test('status bar contains one compact menu instead of separate controls', () => {
    const h = harness();
    const items = h.calls.statusItems;
    assert.equal(items.length, 1);
    assert.equal(items[0].command, 'mcbDigitalTwin.control.focus');
    assert.ok(items[0].text.includes('MCB Digital Twin'));
    assert.ok(items[0].text.includes('$(chevron-down)'));
    const tooltip = items[0].tooltip;
    assert.ok(tooltip.value.includes('**$(vm) Digital Twin**'));
    assert.ok(tooltip.value.includes('**$(circuit-board) Echte Hardware**'));
    assert.equal(tooltip.supportThemeIcons, true);
    const links = Array.from(tooltip.value.matchAll(/\]\(command:([^)]+)\)/g), match => match[1]);
    const groups = Array.from(h.tree.getChildren()).filter(group => group.label !== 'Werkzeuge');
    const commands = groups.flatMap(group => Array.from(group.children, item => item.command.command));
    assert.deepEqual(links, commands);
    assert.deepEqual(Array.from(tooltip.isTrusted.enabledCommands), commands);
    assert.ok(commands.every(command => h.commands.has(command)));
});

test('running status retains access to the menu', async () => {
    const h = harness();
    await h.commands.get('mcbDigitalTwin.start')();
    assert.equal(h.calls.statusItems[0].command, 'mcbDigitalTwin.control.focus');
    assert.ok(h.calls.statusItems[0].text.startsWith('$(vm)'));
    assert.equal(h.calls.statusItems.length, 1);
    assert.ok(h.calls.statusItems[0].tooltip.value.startsWith('Digital Twin läuft'));
});

test('menu groups program and twin actions and cancellation has no side effects', async () => {
    const h = harness();
    await h.commands.get('mcbDigitalTwin.menu')();
    const menu = h.calls.picks[0].items;
    assert.deepEqual(menu.filter(item => item.kind === -1).map(item => item.label), ['Digital Twin', 'Echte Hardware']);
    assert.deepEqual(menu.filter(item => item.command).map(item => item.command), [
        'mcbDigitalTwin.upload', 'mcbDigitalTwin.debug', 'mcbDigitalTwin.open',
        'mcbDigitalTwin.stop', 'mcbDigitalTwin.restart',
        'mcbDigitalTwin.hardwareUpload', 'mcbDigitalTwin.hardwareDebug', 'mcbDigitalTwin.hardwareDiagnostics',
    ]);
    assert.equal(h.calls.requests.length, 0);
    assert.equal(h.calls.spawned.length, 0);
    assert.equal(h.calls.opened.length, 0);
});

test('hardware diagnostics exports adapter events only after a destination is chosen', async () => {
    const destination = { fsPath: path.join('reports', 'hardware.txt') };
    const h = harness({ reportDestination: destination });
    const save = h.commands.get('mcbDigitalTwin.hardwareDiagnostics');
    const hardware = h.tree.getChildren().find(group => group.label === 'Echte Hardware');
    assert.equal(hardware.children[1].label, 'Übertragen und debuggen');
    assert.equal(hardware.children[2].command.command, 'mcbDigitalTwin.hardwareDiagnostics');
    await save();
    assert.equal(h.calls.saveDialogs.length, 0);
    const session = { configuration: { mcbHardwareDebug: true } };
    const tracker = h.trackerFactory.createDebugAdapterTracker(session);
    tracker.onWillReceiveMessage({ type: 'request', command: 'next', arguments: { secret: 'private' } });
    tracker.onDidSendMessage({ type: 'event', event: 'output', body: {
        output: `\x1b[31m${h.selected}/firmware.elf\x1b[0m\nReset cause (3) - (Software core reset)\ntoken=private\n`,
    } });
    tracker.onDidSendMessage({ type: 'event', event: 'stopped', body: { reason: 'exception' } });
    await save();
    const [{ uri, text }] = h.calls.reports;
    assert.equal(uri, destination);
    assert.match(text, /VS Code: 1\.100\.0/);
    assert.match(text, /Debug-Aktion: next/);
    assert.match(text, /<PROJEKT>\/firmware\.elf/);
    assert.match(text, /Reset cause \(3\)/);
    assert.match(text, /Debugger angehalten: exception/);
    assert.ok(!text.includes(h.selected) && !text.includes('private') && !text.includes('\x1b'));

    const canceled = harness();
    canceled.trackerFactory.createDebugAdapterTracker(session).onError(new Error('OpenOCD failed'));
    await canceled.commands.get('mcbDigitalTwin.hardwareDiagnostics')();
    assert.equal(canceled.calls.saveDialogs.length, 1);
    assert.equal(canceled.calls.reports.length, 0);
});

test('menu selection invokes the real restart command', async () => {
    const h = harness({ pickCommand: 'mcbDigitalTwin.restart' });
    await h.commands.get('mcbDigitalTwin.menu')();
    assert.deepEqual(h.calls.requests.map(request => request.body), [{ action: 'twin_restart' }]);
    assert.equal(h.calls.info.length, 1);
    assert.equal(h.calls.errors.length, 0);
});

test('upload is discoverable in the tree and view toolbar', () => {
    const h = harness();
    const twin = h.tree.getChildren().find(item => item.label === 'Digital Twin');
    const item = h.tree.getChildren(twin).find(item => item.command.command === 'mcbDigitalTwin.upload');
    assert.equal(item.iconPath.id, 'cloud-upload');
    const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8'));
    assert.ok(manifest.contributes.commands.some(command => command.command === 'mcbDigitalTwin.upload'));
    assert.ok(manifest.contributes.menus['view/title'].some(item => item.command === 'mcbDigitalTwin.upload'));
});

test('restart is discoverable in the Digital Twin group and command palette', () => {
    const h = harness();
    const twin = h.tree.getChildren().find(item => item.label === 'Digital Twin');
    const item = h.tree.getChildren(twin).find(item => item.command.command === 'mcbDigitalTwin.restart');
    assert.equal(item.label, 'Digital Twin neu starten');
    assert.equal(item.iconPath.id, 'debug-restart');
    const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8'));
    assert.ok(manifest.contributes.commands.some(command => command.command === 'mcbDigitalTwin.restart'));
    assert.ok(manifest.activationEvents.includes('onCommand:mcbDigitalTwin.restart'));
});

test('restart uses the existing backend and opens the surface', async () => {
    const h = harness();
    await h.commands.get('mcbDigitalTwin.start')();
    h.calls.info.length = 0;
    await h.commands.get('mcbDigitalTwin.restart')();
    assert.deepEqual(h.calls.requests.map(request => request.body), [{ action: 'twin_restart' }]);
    assert.equal(h.calls.spawned.length, 1);
    assert.equal(h.calls.opened[0][1], 'http://127.0.0.1:18769/');
    assert.equal(h.calls.info.length, 1);
    assert.deepEqual(h.calls.errors, []);
});

test('restart starts a stopped backend and ignores duplicate clicks', async () => {
    const h = harness({ cold: true });
    await Promise.all([h.commands.get('mcbDigitalTwin.restart')(), h.commands.get('mcbDigitalTwin.restart')()]);
    assert.equal(h.calls.spawned.length, 1);
    assert.equal(h.calls.requests.length, 1);
    assert.deepEqual(h.calls.errors, []);
});

test('restart failures are shown without a success notification', async () => {
    const h = harness({ buildFailure: true });
    await h.commands.get('mcbDigitalTwin.restart')();
    assert.deepEqual(h.calls.errors, ['Compiler: missing header']);
    assert.equal(h.calls.info.length, 0);
    assert.equal(h.calls.opened.length, 0);
});

test('restart leaves an attached debug session untouched', async () => {
    const h = harness();
    await h.commands.get('mcbDigitalTwin.debug')();
    const requests = h.calls.requests.length;
    await h.commands.get('mcbDigitalTwin.restart')();
    assert.equal(h.calls.requests.length, requests);
    assert.match(h.calls.errors[0], /Debugsitzung/);
});

test('uploads the active project, saves only its documents, and opens its configured port', async () => {
    const h = harness();
    await h.commands.get('mcbDigitalTwin.upload')();
    assert.deepEqual(h.calls.saved, [h.selected]);
    assert.deepEqual(h.calls.requests[0].body, { action: 'program_start', path: h.selected });
    assert.equal(h.calls.requests[0].args.port, 18769);
    assert.equal(h.calls.spawned.length, 1);
    assert.equal(h.calls.panels[0].viewType, 'mcbDigitalTwin.surface');
    assert.equal(h.calls.opened[0][1], 'http://127.0.0.1:18769/');
    assert.equal(h.calls.errors.length, 0);
    assert.equal(h.calls.info.length, 1);
});

test('automatically starts the backend before uploading when it is not running', async () => {
    const h = harness({ cold: true });
    await h.commands.get('mcbDigitalTwin.upload')();
    assert.equal(h.calls.spawned.length, 1);
    assert.equal(h.calls.spawned[0][2].cwd, h.selected);
    assert.ok(h.calls.spawned[0][1].includes(h.selected));
    assert.equal(h.calls.requests.length, 1);
    assert.equal(h.calls.errors.length, 0);
});

test('automatic port is used consistently for upload, open, restart and debug', async () => {
    const h = harness({ noConfig: true, assignedPort: 23456 });
    await h.commands.get('mcbDigitalTwin.upload')();
    await h.commands.get('mcbDigitalTwin.open')();
    await h.commands.get('mcbDigitalTwin.restart')();
    await h.commands.get('mcbDigitalTwin.debug')();
    assert.equal(h.calls.spawned.length, 1);
    const args = h.calls.spawned[0][1];
    assert.equal(args[args.indexOf('--port') + 1], '0');
    assert.ok(args.includes('--auto-port'));
    assert.ok(h.calls.requests.every(request => request.args.port === 23456));
    assert.deepEqual(h.calls.opened, [['mcbDigitalTwin.surface', 'http://127.0.0.1:23456/']]);
    assert.equal(h.calls.panels.length, 1);
    assert.equal(h.calls.panels[0].reveals, 3);
    assert.equal(h.calls.debug[0].configuration.mcbPort, 23456);
    assert.deepEqual(h.calls.errors, []);
});

test('occupied configured port never attaches to a foreign healthy backend', async () => {
    const h = harness({ port: 18769, assignedPort: 23457 });
    await h.commands.get('mcbDigitalTwin.upload')();
    assert.equal(h.calls.spawned.length, 1);
    assert.equal(h.calls.requests[0].args.port, 23457);
    assert.equal(h.calls.opened[0][1], 'http://127.0.0.1:23457/');
    assert.deepEqual(h.calls.errors, []);
});

test('concurrent start and open share one owned process', async () => {
    const h = harness({ noConfig: true });
    await Promise.all([h.commands.get('mcbDigitalTwin.start')(), h.commands.get('mcbDigitalTwin.open')()]);
    assert.equal(h.calls.spawned.length, 1);
    assert.equal(h.calls.panels.length, 1);
    assert.deepEqual(h.calls.errors, []);
});

test('a new backend port replaces the address in the same panel and closing it releases the panel', async () => {
    const h = harness({ noConfig: true, assignedPorts: [23460, 23461] });
    await h.commands.get('mcbDigitalTwin.open')();
    await h.commands.get('mcbDigitalTwin.stop')();
    await h.commands.get('mcbDigitalTwin.open')();
    assert.equal(h.calls.panels.length, 1);
    assert.match(h.calls.panels[0].html, /src="http:\/\/127\.0\.0\.1:23461\/"/);
    h.calls.panels[0].dispose();
    await h.commands.get('mcbDigitalTwin.open')();
    assert.equal(h.calls.panels.length, 2);
    assert.match(h.calls.panels[1].html, /src="http:\/\/127\.0\.0\.1:23461\/"/);
});

test('opening externally uses the forwarded address in the default browser', async () => {
    const h = harness({ externalBrowser: true, forwardedUri: 'https://forwarded.example/twin' });
    await h.commands.get('mcbDigitalTwin.open')();
    assert.deepEqual(h.calls.opened, [['external', 'https://forwarded.example/twin']]);
    assert.equal(h.calls.panels.length, 0);
});

test('two windows keep separate ports and stopping one leaves the other usable', async () => {
    const first = harness({ noConfig: true, assignedPort: 23458 });
    const second = harness({ noConfig: true, assignedPort: 23459 });
    await Promise.all([first.commands.get('mcbDigitalTwin.upload')(), second.commands.get('mcbDigitalTwin.upload')()]);
    await first.commands.get('mcbDigitalTwin.stop')();
    await second.commands.get('mcbDigitalTwin.restart')();
    assert.equal(first.calls.requests[0].args.port, 23458);
    assert.ok(second.calls.requests.every(request => request.args.port === 23459));
    assert.equal(second.calls.spawned.length, 1);
    assert.deepEqual(second.calls.errors, []);
});

test('startup error never opens or sends actions to another backend', async () => {
    const h = harness({ startFailure: true });
    await h.commands.get('mcbDigitalTwin.upload')();
    assert.deepEqual(h.calls.errors, ['Python fehlt']);
    assert.equal(h.calls.requests.length, 0);
    assert.equal(h.calls.opened.length, 0);
});

test('compiler errors are shown and no successful upload or browser opening is reported', async () => {
    const h = harness({ buildFailure: true });
    await h.commands.get('mcbDigitalTwin.upload')();
    assert.deepEqual(h.calls.errors, ['Compiler: missing header']);
    assert.equal(h.calls.info.length, 0);
    assert.equal(h.calls.opened.length, 0);
});

test('an unsuccessful save aborts before building or starting the backend', async () => {
    const h = harness({ saveFailure: true });
    await h.commands.get('mcbDigitalTwin.upload')();
    assert.equal(h.calls.requests.length, 0);
    assert.equal(h.calls.spawned.length, 0);
    assert.equal(h.calls.errors.length, 1);
});

test('a double click does not start two concurrent uploads', async () => {
    const h = harness();
    const upload = h.commands.get('mcbDigitalTwin.upload');
    await Promise.all([upload(), upload()]);
    assert.equal(h.calls.requests.length, 1);
    assert.deepEqual(h.calls.saved, [h.selected]);
});

test('debug attaches to the built process before releasing setup and stops only its own process', async () => {
    const h = harness();
    await h.commands.get('mcbDigitalTwin.debug')();
    assert.equal(h.calls.errors.length, 0);
    assert.deepEqual(h.calls.saved, [h.selected]);
    assert.equal(h.calls.requests[0].body.debug, true);
    assert.equal(h.calls.debug.length, 1);
    const config = h.calls.debug[0].configuration;
    assert.equal(config.type, 'cppvsdbg');
    assert.equal(config.request, 'attach');
    assert.equal(config.processId, '1234');
    assert.equal(h.calls.requests[1].body.action, 'program_debug_continue');
    await h.terminate({ id: 'unrelated', configuration: {} });
    assert.equal(h.calls.requests.length, 2);
    await h.terminate({ id: 'twin-debug', configuration: config });
    assert.deepEqual(h.calls.requests[2].body, { action: 'program_stop', processId: '1234' });
});

test('debug config uses GDB when built with a GNU-compatible compiler', async () => {
    const h = harness({ gdb: true });
    await h.commands.get('mcbDigitalTwin.debug')();
    const config = h.calls.debug[0].configuration;
    assert.equal(config.type, 'cppdbg');
    assert.equal(config.MIMode, 'gdb');
    assert.equal(config.miDebuggerPath, '/usr/bin/gdb');
});

test('cancelled debugger attachment cleans up without releasing setup', async () => {
    const h = harness({ debugRejected: true });
    await h.commands.get('mcbDigitalTwin.debug')();
    assert.deepEqual(h.calls.requests.map(r => r.body.action), ['program_start', 'program_stop']);
    assert.equal(h.calls.errors.length, 1);
    assert.equal(h.calls.opened.length, 0);
});

test('missing debugger extension aborts before starting a native process', async () => {
    const h = harness({ noDebugger: true });
    await h.commands.get('mcbDigitalTwin.debug')();
    assert.equal(h.calls.requests.length, 0);
    assert.match(h.calls.errors[0], /ms-vscode.cpptools/);
});

test('adapter failure cleans up the gated process instead of executing setup', async () => {
    const h = harness({ adapterFailure: true });
    await h.commands.get('mcbDigitalTwin.debug')();
    assert.ok(h.calls.requests.some(r => r.body.action === 'program_stop'));
    assert.ok(!h.calls.requests.some(r => r.body.action === 'program_debug_continue'));
    assert.deepEqual(h.calls.errors, ['Debugger attach failed']);
});

test('old backend is rejected rather than silently running without a debugger', async () => {
    const h = harness({ oldBackend: true });
    await h.commands.get('mcbDigitalTwin.debug')();
    assert.equal(h.calls.debug.length, 0);
    assert.equal(h.calls.requests[1].body.action, 'program_stop');
    assert.equal(h.calls.errors.length, 1);
});

test('the extension loads the original C++ project into a running twin', {
    skip: !process.env.MCB_UPLOAD_INTEGRATION_ROOT,
}, async () => {
    const port = Number(process.env.MCB_UPLOAD_INTEGRATION_PORT || 18765);
    const h = harness({ live: true, root: process.env.MCB_UPLOAD_INTEGRATION_ROOT, port });
    try {
        await h.commands.get('mcbDigitalTwin.upload')();
        assert.deepEqual(h.calls.errors, []);
        assert.equal(h.calls.info.length, 1);
        const address = h.calls.opened[0][1];
        const state = await (await fetch(new URL('/api/state', address))).json();
        assert.equal(state.program_running, true);
        assert.ok(state.oled[1].includes('Ueb_2.7.3.4'));
    } finally {
        await h.commands.get('mcbDigitalTwin.stop')();
    }
});
