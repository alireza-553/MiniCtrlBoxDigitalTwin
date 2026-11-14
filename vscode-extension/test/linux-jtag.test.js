const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function harness(options = {}) {
    let ready = Boolean(options.ready);
    let listener;
    const calls = { terminals: [], disposed: 0, checks: [] };
    const fakeFS = {
        constants: fs.constants,
        readdirSync: () => options.missing ? [] : options.multiple ? ['1-1', '1-2'] : ['1-1'],
        readFileSync: file => ({ idVendor: '303a', idProduct: '1001', busnum: '1', devnum: '7' }[path.basename(file)]),
        accessSync(file, mode) {
            calls.checks.push({ file, mode });
            if (!ready) throw new Error('EACCES');
        },
    };
    const vscode = {
        ProgressLocation: { Notification: 15 },
        workspace: { getConfiguration: () => ({ get: () => !options.disabled }) },
        window: {
            onDidCloseTerminal: fn => { listener = fn; return { dispose() { calls.disposed++; } }; },
            createTerminal(config) {
                calls.terminals.push(config);
                const terminal = { exitStatus: { code: options.failure ? 1 : 0 }, show() {
                    queueMicrotask(() => {
                        if (!options.noAccess) ready = true;
                        listener(terminal);
                    });
                } };
                return terminal;
            },
            withProgress: async (_, task) => task({}, { isCancellationRequested: Boolean(options.cancelled) }),
        },
    };
    const sandbox = { module: { exports: {} }, setTimeout: resolve => queueMicrotask(resolve),
        require: name => name === 'fs' ? fakeFS : require(name) };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../linux-jtag.js'), 'utf8'), sandbox);
    return { setup: sandbox.module.exports.createLinuxJtagSetup(vscode, { appendLine() {} }), calls };
}

test('existing USB read/write access needs no terminal or sudo', async () => {
    const h = harness({ ready: true });
    await h.setup(false);
    assert.equal(h.calls.terminals.length, 0);
    assert.equal(h.calls.checks[0].file, '/dev/bus/usb/001/007');
    assert.equal(h.calls.checks[0].mode, fs.constants.R_OK | fs.constants.W_OK);
});

test('missing access opens a fixed sudo command and verifies device access afterwards', async () => {
    const h = harness();
    await h.setup(false);
    const terminal = h.calls.terminals[0];
    assert.equal(terminal.shellPath, '/bin/bash');
    const command = terminal.shellArgs.at(-1);
    assert.match(command, /sudo \/usr\/bin\/tee \/etc\/udev\/rules.d\/70-minictrlbox-esp32c3.rules/);
    assert.match(command, /ATTR\{idVendor\}=="303a", ATTR\{idProduct\}=="1001", TAG\+="uaccess"/);
    assert.match(command, /udevadm control --reload-rules/);
    assert.doesNotMatch(command, /chmod|0666|sudo.*bash|sudo -S/);
    assert.equal(h.calls.disposed, 1);
    assert.equal(h.calls.checks.length, 2);
});

test('automatic setup disabled permits only explicit setup', async () => {
    const h = harness({ disabled: true });
    await assert.rejects(h.setup(false), /USB-JTAG-Zugriff fehlt/);
    assert.equal(h.calls.terminals.length, 0);
    await h.setup(true);
    assert.equal(h.calls.terminals.length, 1);
});

for (const [name, options, error] of [
    ['sudo rejected', { failure: true }, /sudo fehlgeschlagen/],
    ['device disconnected', { missing: true }, /genau eine/],
    ['multiple devices', { multiple: true }, /genau eine/],
    ['access still denied', { noAccess: true }, /Noch kein USB-JTAG-Zugriff/],
    ['waiting cancelled', { noAccess: true, cancelled: true }, /abgebrochen/],
]) test(`${name} does not report setup success`, async () => {
    await assert.rejects(harness(options).setup(false), error);
});
