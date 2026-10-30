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
    const pairs = [['board', 'esp32-c3-devkitm-1'], ['framework', ['arduino']], ['debug_extra_cmds', options.extraCommands || []]];
    const vscode = {
        ProgressLocation: { Notification: 15 },
        workspace: { isTrusted: !options.untrusted, textDocuments: [{ uri: { fsPath: root }, isDirty: true,
            save: async () => { calls.saves++; return !options.saveFailure; } }],
        getWorkspaceFolder: () => ({ uri: { fsPath: root } }), getConfiguration: () => ({ get: () => '/tools/platformio.exe' }) },
        extensions: { getExtension: () => options.noPlatformIO ? undefined : { activate: async () => extensionsActivated++ } },
        Uri: { file: fsPath => ({ fsPath }) },
        window: { showErrorMessage: message => calls.errors.push(message), showInformationMessage() {},
            withProgress: async (_, task) => task(), showQuickPick: async () => undefined },
        debug: { startDebugging: async (folder, config) => {
            calls.debug.push({ folder, config });
            if (options.jtagBusy || options.adapterOutput) {
                const tracker = hardware.createDebugAdapterTracker({ configuration: config });
                tracker.onDidSendMessage({ type: 'event', event: 'output', body: { output: options.adapterOutput
                    || "Error: Abstract command ended in error 'busy' (abstractcs=0x10001102)" } });
                tracker.onDidSendMessage({ type: 'response', command: 'launch', success: false, message: 'Failed to launch GDB' });
                return false;
            }
            return !options.debugRejected;
        } },
    };
    const fakeFS = { existsSync: () => true, readFileSync: file => {
        assert.equal(file, iniPath); return ini;
    }, writeFileSync: (file, text) => { assert.equal(file, iniPath); ini = text; } };
    const childProcess = { execFile: (exe, args, opts, callback) => {
        if (args.includes('--version')) {
            calls.gdbChecks = (calls.gdbChecks || 0) + 1;
            callback(options.brokenGdb ? new Error('exit 127') : null, '', options.brokenGdb
                ? 'riscv32-esp-elf-gdb: error while loading shared libraries: libpython2.7.so.1.0: cannot open shared object file' : '');
            return;
        }
        calls.lockChecks = (calls.lockChecks || 0) + 1;
        assert.equal(opts.windowsHide, true);
        assert.ok(opts.env.MCB_FIRMWARE_PATH.endsWith('firmware.elf'));
        callback(options.lockedFirmware ? new Error('File in use') : null);
    }, spawn: (exe, args, spawnOptions) => {
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
    const sandbox = { module: { exports: {} }, process: { ...process, platform: options.platform || process.platform },
        require: name => ({ fs: fakeFS, child_process: childProcess,
            './arduino-stepping': require('../arduino-stepping') }[name] || require(name)) };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../hardware.js'), 'utf8'), sandbox);
    const output = { show() {}, append() {}, appendLine() {} };
    const hardware = sandbox.module.exports.createHardwareCommands(vscode, output, () => root, async () => {
        calls.driverChecked = true;
        if (options.driverFailure) throw new Error('JTAG driver failed');
    });
    return { hardware, calls, root, original, ini: () => ini, activated: () => extensionsActivated };
}

test('hardware debug preserves project settings, builds before launch and uses native USB-JTAG', async () => {
    const h = harness();
    await h.hardware.debug();
    assert.deepEqual(h.calls.errors, []);
    assert.equal(h.activated(), 1);
    assert.equal(h.calls.saves, 1);
    assert.equal(h.calls.driverChecked, true);
    assert.ok(h.ini().startsWith(h.original));
    assert.match(h.ini(), /skip function loopTask/);
    assert.match(h.ini(), /monitor riscv set_maskisr steponly/);
    assert.doesNotMatch(h.ini(), /monitor riscv set_maskisr off/);
    assert.match(h.ini(), /debug_build_flags =\r\n    -O0\r\n    -g3\r\n    -ggdb3/);
    assert.match(h.ini(), /monitor esp32c3 configure -event halted \{ esp32c3_wdt_disable; mww 0x6002007c 2; mww 0x6001f07c 2 \}/);
    assert.match(h.ini(), /extends = env:lesson\r\nbuild_type = debug\r\nbuild_flags =\r\n    \$\{env:lesson\.build_flags\}\r\n    -fno-inline\r\n    -fno-inline-small-functions\r\n    -fno-default-inline\r\ndebug_tool = esp-builtin/);
    assert.equal(h.ini().match(/-fno-inline$/gm).length, 1);
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
    assert.equal(h.ini().match(/skip function loopTask/g).length, 1);
});

test('legacy interrupt masking is upgraded without losing other debug commands', async () => {
    const h = harness({ extraCommands: ['monitor echo keep', 'monitor riscv set_maskisr off'] });
    await h.hardware.debug();
    await h.hardware.debug();
    assert.deepEqual(h.calls.errors, []);
    assert.match(h.ini(), /monitor echo keep/);
    assert.doesNotMatch(h.ini(), /monitor riscv set_maskisr off/);
    assert.equal(h.ini().match(/monitor riscv set_maskisr steponly/g).length, 1);
});

test('hardware tracker handles wrapper returns without launch diagnostics and keeps diagnostic output working', async () => {
    const h = harness();
    const requests = [];
    const tracker = h.hardware.createDebugAdapterTracker({ configuration: { mcbHardwareDebug: true },
        customRequest: async (command, args) => {
            requests.push({ command, args });
            if (command === 'execute-command') return { results: [['bkpt', [['number', '5']]]] };
            return { stackFrames: [{ name: 'loopTask(void*)@0x42001b9c', source: { path: '/framework/cores/esp32/main.cpp' } }] };
        } });
    tracker.onWillReceiveMessage({ type: 'request', command: 'next', seq: 9, arguments: { threadId: 3 } });
    tracker.onDidSendMessage({ type: 'event', event: 'stopped', body: { reason: 'step', threadId: 3 } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requests[1].command, 'execute-command');
    assert.match(requests[1].args.command, /-break-insert -h -t -p 3 loop/);
    assert.equal(requests[2].command, 'continue');
    tracker.onDidSendMessage({ type: 'event', event: 'output', body: { output: 'hardware output' } });
    tracker.onExit(0);
});

test('hardware upload explicitly targets the detected serial device and keeps configuration unchanged', async () => {
    const h = harness();
    await h.hardware.upload();
    const upload = h.calls.processes.find(p => p.args.includes('upload'));
    assert.equal(upload.args.at(-1), 'COM5');
    assert.ok(upload.args.includes('lesson'));
    assert.equal(h.ini(), h.original);
    assert.equal(h.calls.debug.length, 0);
    assert.equal(h.calls.driverChecked, undefined);
});

test('a non-selected hardware debug session blocks rebuilding until terminated', async () => {
    const h = harness();
    const session = { id: 'hardware-session', type: 'cppdbg', configuration: { projectEnvName: 'lesson' } };
    h.hardware.sessionStarted(session);
    await h.hardware.debug();
    assert.equal(h.calls.processes.length, 0);
    assert.match(h.calls.errors[0], /Debugsitzung beenden/);
    h.hardware.sessionTerminated(session);
    await h.hardware.debug();
    assert.equal(h.calls.debug.length, 1);
});

test('failed hardware launch reports actual adapter output and USB-JTAG recovery steps', async () => {
    const h = harness({ jtagBusy: true });
    await h.hardware.debug();
    assert.equal(h.calls.errors.length, 1);
    assert.match(h.calls.errors[0], /abstractcs=0x10001102/);
    assert.match(h.calls.errors[0], /Failed to launch GDB/);
    assert.match(h.calls.errors[0], /USB kurz trennen/);
    assert.equal(h.hardware.createDebugAdapterTracker({ configuration: { mcbProcessId: 42 } }), undefined);
});

test('Linux USB access failures receive a scoped uaccess hint and no undefined path prefix', async () => {
    const h = harness({ adapterOutput: 'undefined/home/user/openocd: LIBUSB_ERROR_ACCESS: could not find or open device' });
    await h.hardware.debug();
    assert.equal(h.calls.errors.length, 1);
    assert.doesNotMatch(h.calls.errors[0], /undefined\/home/);
    assert.match(h.calls.errors[0], /303a:1001/);
    assert.match(h.calls.errors[0], /uaccess/);
    assert.match(h.calls.errors[0], /keine pauschalen MODE="0666"/);
});

test('an obsolete Python-2.7 GDB is rejected before starting the debug adapter', async () => {
    const h = harness({ brokenGdb: true, platform: 'linux' });
    await h.hardware.debug();
    assert.equal(h.calls.gdbChecks, 1);
    assert.equal(h.calls.debug.length, 0);
    assert.match(h.calls.errors[0], /libpython2\.7/);
    assert.match(h.calls.errors[0], /Python 2\.7 nicht nachinstallieren/);
});

test('a locked firmware aborts before build and before changing project configuration', { skip: process.platform !== 'win32' }, async () => {
    const h = harness({ lockedFirmware: true });
    await h.hardware.debug();
    assert.equal(h.calls.lockChecks, 1);
    assert.ok(!h.calls.processes.some(p => p.args[0] === 'run'));
    assert.equal(h.calls.debug.length, 0);
    assert.equal(h.ini(), h.original);
    assert.match(h.calls.errors[0], /anderen VS-Code-Fenstern/);
});

for (const [name, options] of [
    ['untrusted workspace', { untrusted: true }], ['missing PlatformIO IDE', { noPlatformIO: true }],
    ['failed document save', { saveFailure: true }], ['unsupported board', { unsupported: true }],
    ['disconnected hardware', { noDevice: true }], ['ambiguous USB hardware', { twoDevices: true }],
    ['build failure', { buildFailure: true }], ['missing CLI', { spawnError: true }],
    ['conflicting existing debug environment', { conflictingEnv: true }],
    ['driver setup failure', { driverFailure: true }],
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

test('legacy generated environment is upgraded without changing other environments or custom commands', () => {
    const { updateDebugSection } = require('../hardware');
    const before = '[env:lesson]\r\nboard = esp32-c3-devkitm-1\r\n\r\n';
    const after = '[env:other]\r\nboard = esp32dev\r\n';
    const old = '[env:mcb-usb-debug-lesson]\r\nextends = env:lesson\r\ndebug_init_break = tbreak setup\r\ndebug_extra_cmds =\r\n    monitor echo keep\r\n\r\n';
    const commands = ['monitor echo keep', 'monitor riscv set_maskisr off', 'monitor esp32c3_wdt_disable',
        'monitor mww 0x6002007c 2', 'monitor mww 0x6001f07c 2'];
    const updated = updateDebugSection(before + old + after, 'mcb-usb-debug-lesson', commands, 'lesson');
    assert.ok(updated.startsWith(before));
    assert.ok(updated.endsWith(after));
    assert.match(updated, /debug_init_break = thbreak setup/);
    assert.match(updated, /monitor echo keep/);
    assert.match(updated, /\$\{env:lesson\.build_flags\}/);
    assert.match(updated, /-fno-default-inline/);
    assert.equal(updated.match(/debug_extra_cmds =/g).length, 1);
    assert.equal(updateDebugSection(updated, 'mcb-usb-debug-lesson', commands, 'lesson'), updated);
});

test('source debug mode overrides optimization last while preserving custom debug flags', () => {
    const { updateDebugSection } = require('../hardware');
    const original = '[env:base]\nboard = esp32-c3-devkitm-1\n\n[env:twin]\nextends = env:base\ndebug_build_flags = -Og -DDEBUG_CHECK=1\n';
    const updated = updateDebugSection(original, 'twin', [], 'base');
    assert.match(updated, /-Og -DDEBUG_CHECK=1\n    -O0\n    -g3\n    -ggdb3/);
    assert.equal(updateDebugSection(updated, 'twin', [], 'base'), updated);
    const inherited = updateDebugSection('[env:twin]\n', 'twin', [], 'base', ['-DLESSON_DEBUG=1']);
    assert.match(inherited, /debug_build_flags =\n    -DLESSON_DEBUG=1\n    -O0/);
});
