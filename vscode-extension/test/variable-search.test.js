const assert = require('node:assert/strict');
const test = require('node:test');
const { createVariableSearch, sourceVariables, combineTrackers } = require('../variable-search');

function harness(options = {}) {
    const calls = { requests: [], watches: [], errors: [], info: [], picks: [] };
    let search;
    let tracker;
    const session = { id: 'hardware', type: 'platformio-debug', customRequest: async (command, args) => {
        calls.requests.push({ command, args });
        if (options.resumeDuringRequest === command) tracker.onDidSendMessage({ type: 'event', event: 'continued' });
        if (command === 'threads') return { threads: [{ id: 7 }] };
        if (command === 'stackTrace') return { stackFrames: [{ id: 42, source: { path: '/project/src/main.cpp' } }] };
        if (command === 'scopes') return { scopes: [
            { name: 'Local', variablesReference: 1 }, { name: 'Global', variablesReference: 2 }, { name: 'Static', variablesReference: 3 },
        ] };
        if (command === 'variables') {
            if (options.localFailure && args.variablesReference === 1) throw new Error('Local unavailable');
            return { variables: args.variablesReference === 1 ? [{ name: 'i', value: '0', type: 'int' }]
                : args.variablesReference === 2 ? [{ name: 'afTemperaturen', type: 'float[5]' }, { name: 'frameworkGlobal' }] : [] };
        }
        if (command === 'evaluate') {
            if (options.evaluateFailure) throw new Error('Variable nicht verfügbar');
            return { result: '{...}', variablesReference: 99 };
        }
        throw new Error(`Unexpected request: ${command}`);
    } };
    const vscode = {
        debug: { activeDebugSession: options.noSession ? undefined : session },
        Uri: { file: fsPath => ({ fsPath }) }, ProgressLocation: { Notification: 15 },
        window: {
            showInformationMessage: value => calls.info.push(value), showErrorMessage: value => calls.errors.push(value),
            withProgress: async (_, task) => task(),
            showQuickPick: async items => {
                calls.picks.push(items);
                if (options.resumeInPicker) tracker.onDidSendMessage({ type: 'event', event: 'continued' });
                if (options.cancel) return undefined;
                if (options.allGlobals && calls.picks.length === 1) return items.find(item => item.loadGlobals);
                return items.find(item => item.label === (options.select || 'afTemperaturen'));
            },
        },
        commands: { executeCommand: async (command, args) => {
            if (command === 'vscode.executeDocumentSymbolProvider') {
                if (options.noSymbols) throw new Error('No symbol provider');
                return [{ name: 'afTemperaturen', kind: 12 }];
            }
            if (command === 'debug.addToWatchExpressions') calls.watches.push(args.variable.evaluateName);
        } },
    };
    if (!options.noFocusedFrame) vscode.debug.activeStackItem = { session, frameId: 42, threadId: 7 };
    search = createVariableSearch(vscode, { appendLine() {} });
    tracker = search.createDebugAdapterTracker(session);
    tracker.onDidSendMessage({ type: 'event', event: 'stopped', body: { threadId: 7 } });
    return { search, tracker, calls, vscode };
}

test('project global is suggested and added to Watch without enumerating all framework globals', async () => {
    const h = harness();
    await h.search.search();
    assert.deepEqual(h.calls.errors, []);
    assert.deepEqual(h.calls.watches, ['::afTemperaturen']);
    assert.ok(!h.calls.requests.some(call => call.command === 'variables' && call.args.variablesReference === 2));
    assert.deepEqual(h.calls.requests.find(call => call.command === 'evaluate').args,
        { expression: '::afTemperaturen', frameId: 42, context: 'watch' });
});

test('locals use their evaluation name and selected frame', async () => {
    const h = harness({ select: 'i' });
    await h.search.search();
    assert.deepEqual(h.calls.watches, ['i']);
    assert.equal(h.calls.requests.find(call => call.command === 'scopes').args.frameId, 42);
});

test('all globals are loaded explicitly when the source provider is unavailable', async () => {
    const h = harness({ noSymbols: true, allGlobals: true, select: 'frameworkGlobal' });
    await h.search.search();
    assert.deepEqual(h.calls.watches, ['::frameworkGlobal']);
    assert.equal(h.calls.picks.length, 2);
    assert.equal(h.calls.requests.filter(call => call.command === 'variables' && call.args.variablesReference === 2).length, 1);
});

test('cancel leaves Watch unchanged and does not evaluate expressions', async () => {
    const h = harness({ cancel: true });
    await h.search.search();
    assert.deepEqual(h.calls.watches, []);
    assert.ok(!h.calls.requests.some(call => call.command === 'evaluate'));
});

for (const option of ['resumeInPicker', 'evaluateFailure']) {
    test(`${option} prevents adding a stale or invalid Watch expression`, async () => {
        const h = harness({ [option]: true });
        await h.search.search();
        assert.deepEqual(h.calls.watches, []);
        assert.equal(h.calls.errors.length, 1);
    });
}

test('resuming during a DAP request discards its outdated response', async () => {
    const h = harness({ resumeDuringRequest: 'scopes' });
    await h.search.search();
    assert.deepEqual(h.calls.watches, []);
    assert.equal(h.calls.picks.length, 0);
    assert.match(h.calls.errors[0], /Debugposition/);
});

test('absence of a session and a running session show useful instructions', async () => {
    const absent = harness({ noSession: true });
    await absent.search.search();
    assert.equal(absent.calls.info.length, 1);
    const running = harness();
    running.tracker.onDidSendMessage({ type: 'event', event: 'continued' });
    await running.search.search();
    assert.equal(running.calls.requests.length, 0);
    assert.match(running.calls.errors[0], /zuerst anhalten/);
});

test('older VS Code uses the stopped thread when activeStackItem is unavailable', async () => {
    const h = harness({ noFocusedFrame: true });
    await h.search.search();
    assert.deepEqual(h.calls.watches, ['::afTemperaturen']);
    assert.equal(h.calls.requests.find(call => call.command === 'stackTrace').args.threadId, 7);
});

test('unavailable locals do not hide usable project globals', async () => {
    const h = harness({ localFailure: true });
    await h.search.search();
    assert.deepEqual(h.calls.watches, ['::afTemperaturen']);
});

test('source suggestions include namespaces but exclude other function locals and object fields', () => {
    assert.deepEqual(sourceVariables([
        { name: 'loop', kind: 11, children: [{ name: 'localElsewhere', kind: 12 }] },
        { name: 'Sensor', kind: 4, children: [{ name: 'value', kind: 7 }] },
        { name: 'nsp', kind: 2, children: [{ name: 'temperature', kind: 12 }] },
        { name: 'notGlobal', kind: 12, containerName: 'otherFunction' },
    ]).map(item => item.expression), ['::nsp::temperature']);
});

test('tracker composition preserves existing hardware and twin lifecycle notifications', () => {
    const seen = [];
    const tracker = combineTrackers(undefined, { onDidSendMessage: () => seen.push('variables') },
        { onDidSendMessage: () => seen.push('hardware'), onExit: () => seen.push('cleanup') });
    tracker.onDidSendMessage({});
    tracker.onExit(0);
    assert.deepEqual(seen, ['variables', 'hardware', 'cleanup']);
});
