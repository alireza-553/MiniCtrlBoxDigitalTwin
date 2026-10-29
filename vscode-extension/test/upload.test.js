const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const extensionRoot = path.resolve(__dirname, '..');

function harness(options = {}) {
    const first = path.resolve('workspace-first');
    const selected = path.resolve(options.root || 'workspace-selected');
    const calls = { saved: [], requests: [], spawned: [], opened: [], errors: [], info: [], debug: [], statusItems: [], picks: [] };
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
        QuickPickItemKind: { Separator: -1 },
        MarkdownString: class {
            constructor(value = '', supportThemeIcons = false) { this.value = value; this.supportThemeIcons = supportThemeIcons; }
            appendMarkdown(value) { this.value += value; return this; }
        },
        TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
        TreeItem: class { constructor(label) { this.label = label; } },
        ThemeIcon: class { constructor(id) { this.id = id; } },
        window: {
            activeTextEditor: { document: docs[1] },
            createOutputChannel: () => ({ clear() {}, append() {}, appendLine() {}, show() {} }),
            createStatusBarItem: (alignment, priority) => {
                const item = { alignment, priority, show() {} };
                calls.statusItems.push(item);
                return item;
            },
            registerTreeDataProvider: (_, provider) => { tree = provider; return {}; },
            showErrorMessage: message => { calls.errors.push(message); },
            showInformationMessage: message => { calls.info.push(message); },
            showQuickPick: async (items, pickerOptions) => {
                calls.picks.push({ items: Array.from(items), options: pickerOptions });
                return items.find(item => item.command === options.pickCommand);
            },
            withProgress: async (_, run) => run({ report() {} }),
        },
        workspace: {
            isTrusted: true,
            textDocuments: docs,
            workspaceFolders: [{ uri: { fsPath: first } }, { uri: { fsPath: selected } }],
            getWorkspaceFolder: uri => ({ uri: { fsPath: uri.fsPath.startsWith(selected) ? selected : first } }),
            getConfiguration: () => ({ get: (key, fallback) => key === 'pythonPath' ? 'python' : fallback }),
        },
        commands: {
            registerCommand: (name, run) => { commands.set(name, run); return {}; },
            executeCommand: async (...args) => {
                if (commands.has(args[0])) return commands.get(args[0])(...args.slice(1));
                calls.opened.push(args);
            },
        },
        Uri: { parse: value => ({ toString: () => value }), file: fsPath => ({ fsPath }) },
        env: { asExternalUri: async uri => uri },
    };
    const fakeFS = {
        existsSync: file => file.endsWith('web_app.py') || file === path.join(selected, 'mcb-digital-twin.json'),
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
            healthy = true;
            const child = new EventEmitter();
            child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
            return child;
        },
    };
    const sandbox = {
        module: { exports: {} }, process, Buffer, setTimeout,
        require: name => ({ vscode, fs: fakeFS, http: options.live ? require('node:http') : http, child_process: childProcess,
            './hardware': require(path.join(extensionRoot, 'hardware')),
            './variable-search': require(path.join(extensionRoot, 'variable-search')),
            './jtag-driver': require(path.join(extensionRoot, 'jtag-driver')) }[name] || require(name)),
    };
    vm.runInNewContext(fs.readFileSync(path.join(extensionRoot, 'extension.js'), 'utf8'), sandbox);
    sandbox.module.exports.activate({ extensionPath: extensionRoot, subscriptions: [] });
    return { calls, selected, commands, tree, terminate: terminated };
}

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
        'mcbDigitalTwin.hardwareUpload', 'mcbDigitalTwin.hardwareDebug',
    ]);
    assert.equal(h.calls.requests.length, 0);
    assert.equal(h.calls.spawned.length, 0);
    assert.equal(h.calls.opened.length, 0);
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
    await h.commands.get('mcbDigitalTwin.restart')();
    assert.deepEqual(h.calls.requests.map(request => request.body), [{ action: 'twin_restart' }]);
    assert.equal(h.calls.spawned.length, 0);
    assert.equal(h.calls.opened[0][1], 'http://127.0.0.1:18769');
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
    assert.equal(h.calls.spawned.length, 0);
    assert.equal(h.calls.opened[0][0], 'simpleBrowser.show');
    assert.equal(h.calls.opened[0][1], 'http://127.0.0.1:18769');
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
        const state = await (await fetch(`http://127.0.0.1:${port}/api/state`)).json();
        assert.equal(state.program_running, true);
        assert.ok(state.oled[1].includes('Ueb_2.7.3.4'));
        assert.equal(h.calls.opened[0][1], `http://127.0.0.1:${port}`);
    } finally {
        await fetch(`http://127.0.0.1:${port}/api/action`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'program_stop' }),
        });
    }
});
