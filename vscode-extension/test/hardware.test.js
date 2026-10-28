const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function harness(options = {}) {
    const root = path.resolve('hardware-test-project');
    const iniPath = path.join(root, 'platformio.ini');
    const original = '[env:lesson]\r\nboard = esp32-c3-devkitm-1\r\n; user settings\r\n';
    let ini = original + (options.conflictingEnv ? '\r\n[env:mcb-usb-debug-lesson]\r\ndebug_tool = esp-prog\r\n' : '');
    const calls = { processes: [], debug: [], errors: [], saves: 0 };
    let extensionsActivated = 0;
    const pairs = [['board', 'esp32-c3-devkitm-1'], ['framework', ['arduino']]];
    const vscode = {
        ProgressLocation: { Notification: 15 },
        workspace: { isTrusted: !options.untrusted, textDocuments: [{ uri: { fsPath: root }, isDirty: true,
            save: async () => { calls.saves++; return !options.saveFailure; } }],
        getWorkspaceFolder: () => ({ uri: { fsPath: root } }), getConfiguration: () => ({ get: () => '/tools/platformio.exe' }) },
        extensions: { getExtension: () => options.noPlatformIO ? undefined : { activate: async () => extensionsActivated++ } },
        Uri: { file: fsPath => ({ fsPath }) },
        window: { showErrorMessage: message => calls.errors.push(message), showInformationMessage() {},
            withProgress: async (_, task) => task(), showQuickPick: async () => undefined },
        debug: { startDebugging: async (folder, config) => { calls.debug.push({ folder, config }); return !options.debugRejected; } },
    };
    const fakeFS = { existsSync: () => true, readFileSync: file => {
        assert.equal(file, iniPath); return ini;
    }, appendFileSync: (file, text) => { assert.equal(file, iniPath); ini += text; } };
    const childProcess = { spawn: (exe, args, spawnOptions) => {
        calls.processes.push({ exe, args, options: spawnOptions });
        const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
        queueMicrotask(() => {
            if (options.spawnError) return child.emit('error', new Error('ENOENT'));
            let data = '';
            if (args.includes('config')) {
                const selected = options.unsupported ? [['board', 'esp32dev'], ['framework', ['arduino']]] : pairs;
                data = JSON.stringify([['env:lesson', selected], ...(options.multiEnv ? [['env:other', pairs]] : []), ...(ini.includes('[env:mcb-usb-debug-lesson]')
                    ? [['env:mcb-usb-debug-lesson', [...pairs, ['debug_tool', options.conflictingEnv ? 'esp-prog' : 'esp-builtin'], ['build_type', 'debug'],
                        ['upload_protocol', 'esp-builtin'], ['debug_init_break', 'tbreak setup']]]] : [])]);
            } else if (args.includes('device')) {
                data = JSON.stringify(Array.from({ length: options.noDevice ? 0 : options.twoDevices ? 2 : 1 },
                    (_, i) => ({ port: `COM${i + 5}`, hwid: 'USB VID:PID=303A:1001' })));
            } else if (args.includes('metadata')) {
                data = JSON.stringify({ 'mcb-usb-debug-lesson': { prog_path: '/build/firmware.elf', cc_path: '/compiler/bin/gcc' } });
            }
            child.stdout.emit('data', data);
            child.emit('exit', options.buildFailure && args[0] === 'run' ? 1 : 0);
        });
        return child;
    } };
    const sandbox = { module: { exports: {} }, process,
        require: name => ({ fs: fakeFS, child_process: childProcess }[name] || require(name)) };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../hardware.js'), 'utf8'), sandbox);
    const output = { show() {}, append() {}, appendLine() {} };
    const hardware = sandbox.module.exports.createHardwareCommands(vscode, output, () => root);
    return { hardware, calls, root, original, ini: () => ini, activated: () => extensionsActivated };
}

test('hardware debug preserves project settings, builds before launch and uses native USB-JTAG', async () => {
    const h = harness();
    await h.hardware.debug();
    assert.deepEqual(h.calls.errors, []);
    assert.equal(h.activated(), 1);
    assert.equal(h.calls.saves, 1);
    assert.ok(h.ini().startsWith(h.original));
    assert.match(h.ini(), /extends = env:lesson\r\nbuild_type = debug\r\ndebug_tool = esp-builtin/);
    const config = h.calls.debug[0].config;
    assert.equal(config.type, 'platformio-debug');
    assert.equal(config.projectEnvName, 'mcb-usb-debug-lesson');
    assert.equal(config.loadMode, 'always');
    assert.equal(config.executable, '/build/firmware.elf');
    assert.ok(h.calls.processes.some(p => p.args[0] === 'run'));
    assert.ok(!h.calls.processes.some(p => p.args.includes('upload')));
    assert.ok(h.calls.processes.every(p => p.options.shell === false && p.options.cwd === h.root));
    await h.hardware.debug();
    assert.equal(h.ini().split('[env:mcb-usb-debug-lesson]').length, 2);
});

test('hardware upload explicitly targets the detected serial device and keeps configuration unchanged', async () => {
    const h = harness();
    await h.hardware.upload();
    const upload = h.calls.processes.find(p => p.args.includes('upload'));
    assert.equal(upload.args.at(-1), 'COM5');
    assert.ok(upload.args.includes('lesson'));
    assert.equal(h.ini(), h.original);
    assert.equal(h.calls.debug.length, 0);
});

for (const [name, options] of [
    ['untrusted workspace', { untrusted: true }], ['missing PlatformIO IDE', { noPlatformIO: true }],
    ['failed document save', { saveFailure: true }], ['unsupported board', { unsupported: true }],
    ['disconnected hardware', { noDevice: true }], ['ambiguous USB hardware', { twoDevices: true }],
    ['build failure', { buildFailure: true }], ['missing CLI', { spawnError: true }],
    ['conflicting existing debug environment', { conflictingEnv: true }],
]) {
    test(`${name} never starts a hardware debugger or flashes firmware`, async () => {
        const h = harness(options);
        await h.hardware.debug();
        assert.equal(h.calls.errors.length, 1);
        assert.equal(h.calls.debug.length, 0);
        assert.ok(!h.calls.processes.some(p => p.args.includes('upload')));
    });
}

test('cancelled environment selection does not modify or program anything', async () => {
    const h = harness({ multiEnv: true });
    await h.hardware.debug();
    assert.equal(h.ini(), h.original);
    assert.equal(h.calls.errors.length, 0);
    assert.equal(h.calls.processes.length, 1);
    assert.equal(h.calls.debug.length, 0);
});

test('double invocation does not start concurrent hardware operations', async () => {
    const h = harness();
    await Promise.all([h.hardware.upload(), h.hardware.upload()]);
    assert.equal(h.calls.processes.filter(p => p.args.includes('upload')).length, 1);
});
