const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function harness(options = {}) {
    const calls = [], messages = [], errors = [], logs = [];
    const root = path.resolve('installed extension with spaces');
    const childProcess = { spawn(executable, args, settings) {
        const index = calls.length;
        calls.push({ executable, args, settings });
        const child = new EventEmitter();
        child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
        queueMicrotask(() => {
            if (options.missingPython && index === 1) {
                child.emit('error', new Error('ENOENT')); child.emit('close', -1); return;
            }
            child.stdout.emit('data', index === 0 ? 'ℹ pass 80\nℹ skipped 1\n' : '');
            child.stderr.emit('data', index === 1 ? 'OK (skipped=2)\n' : '');
            child.emit('close', options.nodeFailure && index === 0 ? 1 : 0);
        });
        return child;
    } };
    const fakeFS = { readdirSync: () => options.noFiles ? [] : ['z.test.js', 'README.md', 'a.test.js'] };
    const sandbox = { module: { exports: {} }, process: { execPath: '/vscode/Code.exe', platform: 'win32', env: {
        MCB_NATIVE_TEST_PROJECT: '/unrelated/exercise', MCB_UPLOAD_INTEGRATION_ROOT: '/unrelated/live', ELECTRON_RUN_AS_NODE: '1',
    } }, require: name => ({ fs: fakeFS, child_process: childProcess }[name] || require(name)) };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../local-tests.js'), 'utf8'), sandbox);
    const runner = sandbox.module.exports.createLocalTests({
        workspace: { getConfiguration: () => ({ get: () => 'configured python' }) },
        window: { showInformationMessage: value => messages.push(value), showErrorMessage: value => errors.push(value) },
    }, { clear() {}, show() {}, append: value => logs.push(value), appendLine: value => logs.push(value) }, root);
    return { runner, calls, messages, errors, logs, root };
}

test('runs packaged suites locally with the VS Code runtime and reports skipped tests', async () => {
    const h = harness(); await h.runner.run();
    assert.equal(h.calls.length, 2);
    assert.equal(h.calls[0].executable, '/vscode/Code.exe');
    assert.equal(h.calls[0].settings.env.ELECTRON_RUN_AS_NODE, '1');
    assert.equal(h.calls[0].settings.env.MCB_WINDOWS_DRIVER_TEST, '1');
    assert.equal(h.calls[0].settings.shell, false);
    assert.equal(h.calls[0].settings.windowsHide, true);
    assert.ok(h.calls[0].args.includes(path.join(h.root, 'test/a.test.js')));
    assert.equal(h.calls[1].executable, 'configured python');
    assert.equal(h.calls[1].settings.cwd, path.join(h.root, 'python'));
    assert.equal(h.calls[1].settings.env.PYTHONPATH, path.join(h.root, 'python'));
    assert.equal(h.calls[1].settings.env.ELECTRON_RUN_AS_NODE, undefined);
    for (const call of h.calls) {
        assert.equal(call.settings.env.MCB_NATIVE_TEST_PROJECT, undefined);
        assert.equal(call.settings.env.MCB_UPLOAD_INTEGRATION_ROOT, undefined);
    }
    assert.equal(h.errors.length, 0);
    assert.match(h.messages[0], /Übersprungen: 3/);
});

test('failed JS suite still runs Python and reports failure', async () => {
    const h = harness({ nodeFailure: true }); await h.runner.run();
    assert.equal(h.calls.length, 2);
    assert.equal(h.messages.length, 0);
    assert.match(h.errors[0], /JavaScript-Unit-Tests/);
});

test('missing Python is reported once without claiming success', async () => {
    const h = harness({ missingPython: true }); await h.runner.run();
    assert.equal(h.errors.length, 1);
    assert.equal(h.messages.length, 0);
    assert.match(h.logs.join('\n'), /ENOENT/);
});

test('duplicate invocation does not spawn duplicate suites', async () => {
    const h = harness(); await Promise.all([h.runner.run(), h.runner.run()]);
    assert.equal(h.calls.length, 2);
    assert.ok(h.messages.some(message => /laufen bereits/.test(message)));
});

test('missing bundled JS tests produces an actionable error', async () => {
    const h = harness({ noFiles: true }); await h.runner.run();
    assert.equal(h.calls.length, 0);
    assert.match(h.errors[0], /VSIX neu installieren/);
});
