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
    const calls = { saved: [], requests: [], spawned: [], opened: [], errors: [], info: [] };
    const commands = new Map();
    let tree;
    let healthy = !options.cold;
    const document = root => ({
        uri: { fsPath: path.join(root, 'src', 'main.cpp') }, isDirty: true,
        save: async () => { calls.saved.push(root); return !options.saveFailure; },
    });
    const docs = [document(first), document(selected)];
    const vscode = {
        StatusBarAlignment: { Left: 1 }, ProgressLocation: { Notification: 15 },
        TreeItemCollapsibleState: { None: 0 },
        TreeItem: class { constructor(label) { this.label = label; } },
        ThemeIcon: class { constructor(id) { this.id = id; } },
        window: {
            activeTextEditor: { document: docs[1] },
            createOutputChannel: () => ({ clear() {}, append() {}, appendLine() {}, show() {} }),
            createStatusBarItem: () => ({ show() {} }),
            registerTreeDataProvider: (_, provider) => { tree = provider; return {}; },
            showErrorMessage: message => { calls.errors.push(message); },
            showInformationMessage: message => { calls.info.push(message); },
            withProgress: async (_, run) => run({ report() {} }),
        },
        workspace: {
            textDocuments: docs,
            workspaceFolders: [{ uri: { fsPath: first } }, { uri: { fsPath: selected } }],
            getWorkspaceFolder: uri => ({ uri: { fsPath: uri.fsPath.startsWith(selected) ? selected : first } }),
            getConfiguration: () => ({ get: (key, fallback) => key === 'pythonPath' ? 'python' : fallback }),
        },
        commands: {
            registerCommand: (name, run) => { commands.set(name, run); return {}; },
            executeCommand: async (...args) => { calls.opened.push(args); },
        },
        Uri: { parse: value => ({ toString: () => value }) },
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
                calls.requests.push({ args, body: JSON.parse(body) });
                queueMicrotask(() => {
                    const response = new EventEmitter();
                    response.statusCode = options.buildFailure ? 400 : 200;
                    response.setEncoding = () => {};
                    callback(response);
                    response.emit('data', JSON.stringify(options.buildFailure
                        ? { error: 'Compiler: missing header' }
                        : { program_running: true, program_path: selected }));
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
        require: name => ({ vscode, fs: fakeFS, http: options.live ? require('node:http') : http, child_process: childProcess }[name] || require(name)),
    };
    vm.runInNewContext(fs.readFileSync(path.join(extensionRoot, 'extension.js'), 'utf8'), sandbox);
    sandbox.module.exports.activate({ extensionPath: extensionRoot, subscriptions: [] });
    return { calls, selected, commands, tree };
}

test('upload is discoverable in the tree and view toolbar', () => {
    const h = harness();
    const item = h.tree.getChildren().find(item => item.command.command === 'mcbDigitalTwin.upload');
    assert.equal(item.iconPath.id, 'cloud-upload');
    const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8'));
    assert.ok(manifest.contributes.commands.some(command => command.command === 'mcbDigitalTwin.upload'));
    assert.ok(manifest.contributes.menus['view/title'].some(item => item.command === 'mcbDigitalTwin.upload'));
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
