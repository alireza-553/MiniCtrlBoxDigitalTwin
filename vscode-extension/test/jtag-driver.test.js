const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function harness(options = {}) {
    const calls = [];
    let ready = !!options.ready;
    const vscode = {
        ProgressLocation: { Notification: 15 },
        workspace: { isTrusted: !options.untrusted,
            getConfiguration: () => ({ get: () => !options.disabled }) },
        window: { withProgress: async (_, task) => task(), showInformationMessage() {} },
    };
    const script = fs.readFileSync(path.join(__dirname, '../windows-jtag.ps1'), 'utf8');
    const childProcess = { spawn(executable, args, spawnOptions) {
        const command = Buffer.from(args.at(-1), 'base64').toString('utf16le');
        calls.push({ executable, args, command, options: spawnOptions });
        const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
        queueMicrotask(() => {
            const install = command.endsWith('-Install');
            if (install && options.failure) {
                child.stdout.emit('data', JSON.stringify({ ok: false, error: 'UAC abgebrochen' }));
                child.emit('close', 1);
                return;
            }
            if (install) ready = true;
            child.stdout.emit('data', JSON.stringify({ ok: true, ready, changed: install }));
            child.emit('close', 0);
        });
        return child;
    } };
    const sandbox = { module: { exports: {} }, Buffer,
        process: { platform: options.linux ? 'linux' : 'win32', env: { SystemRoot: 'C:\\Windows' } },
        require: name => ({ fs: { readFileSync: () => script }, child_process: childProcess }[name] || require(name)) };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../jtag-driver.js'), 'utf8'), sandbox);
    const setup = sandbox.module.exports.createJtagDriverSetup(vscode, { appendLine() {} },
        { extensionPath: '/extension', globalStorageUri: { fsPath: "C:/user's profile/driver" } });
    return { setup, calls };
}

test('correctly installed driver is checked without installing or elevating', async () => {
    const h = harness({ ready: true });
    await h.setup();
    assert.equal(h.calls.length, 1);
    assert.ok(!h.calls[0].command.endsWith('-Install'));
});

test('missing driver is installed once after inspection without shell or execution-policy changes', async () => {
    const h = harness();
    await Promise.all([h.setup(), h.setup()]);
    assert.equal(h.calls.length, 2);
    assert.ok(h.calls[1].command.endsWith('-Install'));
    assert.ok(h.calls.every(c => c.options.shell === false && !c.args.includes('-ExecutionPolicy')));
    assert.match(h.calls[0].command, /user''s profile/);
});

test('disabled automatic setup never installs, explicit setup still works', async () => {
    const h = harness({ disabled: true });
    await assert.rejects(h.setup(), /Treiber fehlt/);
    assert.equal(h.calls.length, 1);
    await h.setup(true);
    assert.equal(h.calls.length, 3);
});

test('cancelled or failed elevation is reported rather than claiming success', async () => {
    const h = harness({ failure: true });
    await assert.rejects(h.setup(), /UAC abgebrochen/);
});

test('untrusted workspace cannot start the driver helper', async () => {
    const h = harness({ untrusted: true });
    await assert.rejects(h.setup(), /vertrauensw/);
    assert.equal(h.calls.length, 0);
});

test('non-Windows debugging does not execute Windows driver commands', async () => {
    const h = harness({ linux: true });
    await h.setup();
    assert.equal(h.calls.length, 0);
    await assert.rejects(h.setup(true), /nur für Windows/);
});
