const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const crypto = require('node:crypto');
const test = require('node:test');
const { createUpdates, newer, selectRelease, requestBytes } = require('../updates');

const DAY = 86400000;
const binary = Buffer.from('test VSIX content');
const digest = crypto.createHash('sha256').update(binary).digest('hex');
function release(version = '0.3.17') {
    return { tag_name: `v${version}`, draft: false, prerelease: false, assets: [
        { id: 21, name: `mcb-digital-twin-${version}.vsix`, size: binary.length, digest: `sha256:${digest}` },
        { id: 22, name: 'SHA256SUMS.txt' },
    ] };
}

function harness(options = {}) {
    const data = options.release || release();
    const calls = { requests: [], info: [], errors: [], commands: [], opened: [], logs: [] };
    const values = new Map();
    let now = 10 * DAY;
    const context = { globalState: { get: (key, fallback) => values.has(key) ? values.get(key) : fallback, update: async (key, value) => values.set(key, value) } };
    const vscode = {
        workspace: { getConfiguration: () => ({ get: () => !options.disabled }) },
        debug: { activeDebugSession: options.debug ? {} : undefined },
        ProgressLocation: { Notification: 15 },
        Uri: { file: fsPath => ({ fsPath }), parse: value => value },
        env: { openExternal: async uri => calls.opened.push(uri) },
        window: {
            showInformationMessage: async (message, ...choices) => {
                calls.info.push(message);
                if (choices.includes('Herunterladen und installieren')) return options.choice || 'Später';
                if (choices.includes('Fenster neu laden')) return options.reload ? 'Fenster neu laden' : 'Später';
            },
            showErrorMessage: message => calls.errors.push(message),
            withProgress: async (_, run) => run(),
        },
        commands: { executeCommand: async (command, uri) => {
            calls.commands.push({ command, uri });
            if (command === 'workbench.extensions.installExtension') {
                assert.deepEqual(fs.readFileSync(uri.fsPath), binary);
                if (options.installFailure) throw new Error('Installation fehlgeschlagen');
            }
        } },
    };
    const request = async (...args) => {
        calls.requests.push(args);
        if (options.networkFailure) throw new Error('Netzwerk nicht erreichbar');
        if (args[0].endsWith('/releases/latest')) return Buffer.from(JSON.stringify(data));
        if (args[0].endsWith('/21')) {
            if (options.debugDuringDownload) vscode.debug.activeDebugSession = {};
            return binary;
        }
        if (args[0].endsWith('/22')) return Buffer.from(`${digest}  ${data.assets[0].name}\n`);
        throw new Error('Unexpected request');
    };
    const runner = createUpdates(vscode, { appendLine: value => calls.logs.push(value) }, context, options.installed || '0.3.16', { request, now: () => now, timers: options.timers });
    return { runner, calls, values, advance: () => { now += DAY + 1; } };
}

test('numeric stable version comparison prevents downgrades and prerelease offers', () => {
    assert.equal(newer('v0.3.17', '0.3.16'), true);
    assert.equal(newer('0.10.0', '0.9.99'), true);
    for (const value of ['0.3.16', '0.3.15', '0.3.17-beta', 'invalid']) assert.equal(newer(value, '0.3.16'), false);
    assert.equal(selectRelease({ ...release(), draft: true }, '0.3.16'), null);
    assert.equal(selectRelease({ ...release(), prerelease: true }, '0.3.16'), null);
    assert.throws(() => selectRelease({ ...release(), assets: [] }, '0.3.16'), /VSIX/);
});

test('automatic check first notifies and does not download without a choice', async () => {
    const h = harness(); await h.runner.check();
    assert.equal(h.calls.requests.length, 1);
    assert.equal(h.calls.commands.length, 0);
    assert.match(h.calls.info[0], /0\.3\.17.*0\.3\.16/);
    await h.runner.check(); assert.equal(h.calls.requests.length, 1);
    h.advance(); await h.runner.check(); assert.equal(h.calls.requests.length, 2);
});

test('disabled automatic checks still allow the manual command', async () => {
    const h = harness({ disabled: true });
    await h.runner.check(); assert.equal(h.calls.requests.length, 0);
    await h.runner.check(true); assert.equal(h.calls.requests.length, 1);
});

test('startup checks a newly published release despite a recent successful check', async () => {
    let startup, interval;
    const timers = {
        setTimeout: (callback, delay) => { assert.equal(delay, 15000); startup = callback; return 1; },
        setInterval: (callback, delay) => { assert.equal(delay, DAY); interval = callback; return 2; },
        clearTimeout() {}, clearInterval() {},
    };
    const data = release('0.3.17');
    const h = harness({ release: data, installed: '0.3.17', timers });
    await h.runner.check();
    assert.equal(h.calls.info.length, 0);
    Object.assign(data, release('0.3.18'));
    h.runner.start();
    await startup();
    assert.equal(h.calls.requests.length, 2);
    assert.match(h.calls.info[0], /0\.3\.18.*0\.3\.17/);
    await interval();
    assert.equal(h.calls.requests.length, 2);
    h.runner.dispose();
});

test('failed checks do not suppress a later retry for a whole day', async () => {
    const options = { networkFailure: true };
    const h = harness(options);
    await h.runner.check();
    assert.equal(h.values.has('updates.lastCheck'), false);
    options.networkFailure = false;
    await h.runner.check();
    assert.equal(h.calls.requests.length, 2);
    assert.equal(h.calls.info.length, 1);
});

test('startup still respects disabled checks and disposal cancels its timers', async () => {
    let startup;
    const cleared = [];
    const timers = {
        setTimeout: callback => { startup = callback; return 1; },
        setInterval: () => 2,
        clearTimeout: id => cleared.push(id), clearInterval: id => cleared.push(id),
    };
    const h = harness({ disabled: true, timers });
    h.runner.start();
    await startup();
    assert.equal(h.calls.requests.length, 0);
    h.runner.dispose();
    assert.deepEqual(cleared, [1, 2]);
    await startup();
    assert.equal(h.calls.requests.length, 0);
});

test('current or newer local development version never triggers an install offer', async () => {
    for (const installed of ['0.3.17', '0.3.18']) {
        const h = harness({ installed });
        await h.runner.check(); assert.equal(h.calls.info.length, 0);
        await h.runner.check(true); assert.match(h.calls.info[0], /Keine neuere/);
    }
});

test('explicit install verifies SHA256, uses VS Code, cleans download and reloads only on request', async () => {
    const h = harness({ choice: 'Herunterladen und installieren', reload: true });
    await h.runner.check();
    assert.equal(h.calls.requests.length, 2);
    assert.equal(h.calls.commands[0].command, 'workbench.extensions.installExtension');
    assert.equal(fs.existsSync(h.calls.commands[0].uri.fsPath), false);
    assert.equal(h.calls.commands[1].command, 'workbench.action.reloadWindow');
    assert.equal(h.calls.errors.length, 0);
});

test('checksum file is used when GitHub asset digest is unavailable', async () => {
    const data = release(); delete data.assets[0].digest;
    const h = harness({ release: data, choice: 'Herunterladen und installieren' });
    await h.runner.check(true);
    assert.equal(h.calls.requests.length, 3);
    assert.equal(h.calls.commands.length, 1);
    assert.equal(h.calls.errors.length, 0);
});

test('mismatching or missing checksum never installs a package', async () => {
    for (const missing of [false, true]) {
        const data = release(); data.assets[0].digest = missing ? '' : `sha256:${'0'.repeat(64)}`;
        if (missing) data.assets.pop();
        const h = harness({ release: data, choice: 'Herunterladen und installieren' });
        await h.runner.check();
        assert.equal(h.calls.commands.length, 0);
        assert.match(h.calls.errors[0], /Prüfsumme/);
    }
});

test('truncated download and VS Code install failure never claim success', async () => {
    const data = release(); data.assets[0].size += 1;
    for (const options of [{ release: data }, { installFailure: true }]) {
        const h = harness({ ...options, choice: 'Herunterladen und installieren' });
        await h.runner.check();
        assert.equal(h.calls.errors.length, 1);
        assert.ok(!h.calls.info.some(value => / installiert\./.test(value)));
        if (h.calls.commands.length) assert.equal(fs.existsSync(h.calls.commands[0].uri.fsPath), false);
    }
});

test('active debugger blocks installation while release page choice only opens GitHub', async () => {
    const h = harness({ debug: true, choice: 'Herunterladen und installieren' });
    await h.runner.check(true);
    assert.equal(h.calls.requests.length, 1);
    assert.equal(h.calls.commands.length, 0);
    assert.ok(h.calls.info.some(value => /Debugsitzung/.test(value)));
    const page = harness({ choice: 'Release ansehen' }); await page.runner.check();
    assert.equal(page.calls.opened[0], 'https://github.com/alireza-553/MiniCtrlBoxDigitalTwin/releases/latest');
});

test('network failure is silent in background, visible manually, and releases busy guard', async () => {
    const h = harness({ networkFailure: true });
    await h.runner.check(); assert.equal(h.calls.errors.length, 0);
    await h.runner.check(true); assert.equal(h.calls.errors.length, 1);
});

test('debugger started during download prevents installation', async () => {
    const h = harness({ debugDuringDownload: true, choice: 'Herunterladen und installieren' });
    await h.runner.check();
    assert.equal(h.calls.commands.length, 0);
    assert.match(h.calls.errors[0], /Debugsitzung/);
});

test('concurrent checks are coalesced and disposed checker performs no requests', async () => {
    const h = harness(); await Promise.all([h.runner.check(true), h.runner.check(true)]);
    assert.equal(h.calls.requests.length, 1);
    h.runner.start(); h.runner.dispose(); await h.runner.check(true);
    assert.equal(h.calls.requests.length, 1);
});

function transport(responses) {
    const calls = [];
    const get = (url, options, callback) => {
        calls.push({ url: url.href, headers: options.headers });
        const request = new EventEmitter();
        request.setTimeout = () => {};
        request.destroy = () => {};
        queueMicrotask(() => {
            const data = responses.shift();
            const response = new EventEmitter(); response.resume = () => {};
            response.statusCode = data.status || 200; response.headers = data.headers || {};
            callback(response);
            if (data.body) response.emit('data', Buffer.from(data.body));
            response.emit('end');
        });
        return request;
    };
    return { get, calls };
}

test('public transport follows GitHub HTTPS redirects without Authorization', async () => {
    const h = transport([{ status: 302, headers: { location: 'https://release-assets.githubusercontent.com/test?signed=abc' } }, { body: 'VSIX' }]);
    const value = await requestBytes('https://api.github.com/repos/test/releases/assets/1', 'application/octet-stream', 100, 0, h.get);
    assert.equal(value.toString(), 'VSIX');
    assert.equal(h.calls.length, 2);
    assert.ok(h.calls.every(call => !call.headers.Authorization));
});

test('transport rejects HTTP, unexpected hosts, excessive data and HTTP errors', async () => {
    const h = transport([{ status: 302, headers: { location: 'https://untrusted.example/file' } }]);
    await assert.rejects(requestBytes('https://api.github.com/test', undefined, 100, 0, h.get), /Downloadadresse/);
    assert.equal(h.calls.length, 1);
    await assert.rejects(requestBytes('http://api.github.com/test'), /Downloadadresse/);
    const large = transport([{ body: 'too large' }]);
    await assert.rejects(requestBytes('https://api.github.com/test', undefined, 2, 0, large.get), /groß/);
    const denied = transport([{ status: 404 }]);
    await assert.rejects(requestBytes('https://api.github.com/test', undefined, 2, 0, denied.get), /HTTP 404/);
});
