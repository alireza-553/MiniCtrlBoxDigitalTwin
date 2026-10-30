const assert = require('node:assert/strict');
const test = require('node:test');
const { createArduinoStepTracker } = require('../arduino-stepping');

const tick = () => new Promise(resolve => setImmediate(resolve));
const wrapper = { name: 'loopTask(void*)', source: { path: 'C:\\.platformio\\packages\\framework-arduinoespressif32\\cores\\esp32\\main.cpp' } };
function harness(frame = wrapper, stackRequest) {
    const calls = [], logs = [];
    const session = { configuration: { mcbHardwareDebug: true }, customRequest: async (command, args) => {
        calls.push({ command, args });
        if (command === 'stackTrace') return stackRequest ? stackRequest() : { stackFrames: [frame] };
        return {};
    } };
    const tracker = createArduinoStepTracker(session, { appendLine: value => logs.push(value) }, true);
    function request(command = 'next', args = {}) {
        tracker.onWillReceiveMessage({ type: 'request', seq: 7, command, arguments: { threadId: 3, ...args } });
    }
    function stop(reason = 'step', extra = {}) {
        tracker.onDidSendMessage({ type: 'event', event: 'stopped', body: { reason, threadId: 3, ...extra } });
    }
    return { calls, logs, session, tracker, request, stop };
}

for (const command of ['next', 'stepIn']) {
    test(`${command} returning to Arduino wrapper advances once to loop on the same thread`, async () => {
        const h = harness(); h.request(command);
        h.tracker.onDidSendMessage({ type: 'event', event: 'continued' });
        h.stop(); await tick();
        assert.deepEqual(h.calls, [
            { command: 'stackTrace', args: { threadId: 3, startFrame: 0, levels: 1 } },
            { command: 'evaluate', args: { context: 'repl', expression: '-interpreter-exec --thread 3 --frame 0 console "advance loop"' } },
        ]);
        h.stop(); await tick();
        assert.equal(h.calls.length, 2, 'no repeated automatic resume');
    });
}

test('breakpoints, exceptions and manual pause remain stopped even inside loopTask', async () => {
    for (const reason of ['breakpoint', 'exception', 'pause', 'entry', 'data breakpoint', 'function breakpoint']) {
        const h = harness(); h.request(); h.stop(reason); await tick();
        assert.equal(h.calls.length, 0, reason);
    }
    const h = harness(); h.request(); h.stop('step', { hitBreakpointIds: [2] }); await tick();
    assert.equal(h.calls.length, 0);
});

test('user functions named loopTask and other framework functions are not skipped', async () => {
    for (const frame of [
        { name: 'loopTask(void*)', source: { path: '/project/src/main.cpp' } },
        { name: 'setup()', source: wrapper.source },
        { name: 'loopTask(void*)' },
    ]) {
        const h = harness(frame); h.request(); h.stop(); await tick();
        assert.equal(h.calls.length, 1);
    }
});

test('explicit step-out, instruction stepping, targeted steps and unrelated threads remain unchanged', async () => {
    for (const [command, args, extra] of [
        ['stepOut', {}, {}], ['next', { granularity: 'instruction' }, {}],
        ['stepIn', { targetId: 4 }, {}], ['next', {}, { threadId: 9 }],
    ]) {
        const h = harness(); h.request(command, args); h.stop('step', extra); await tick();
        assert.equal(h.calls.length, 0);
    }
});

test('new user actions, new stops or session exit cancel pending stack inspection', async () => {
    for (const action of ['continue', 'pause', 'next', 'stepIn', 'disconnect', 'stop', 'exit']) {
        let resolveStack;
        const h = harness(wrapper, () => new Promise(resolve => { resolveStack = resolve; }));
        h.request(); h.stop();
        if (action === 'stop') h.stop('breakpoint');
        else if (action === 'exit') h.tracker.onExit();
        else h.request(action);
        resolveStack({ stackFrames: [wrapper] }); await tick();
        assert.equal(h.calls.length, 1, action);
    }
});

test('failed step and unsolicited stop do not resume the target', async () => {
    const h = harness(); h.request();
    h.tracker.onDidSendMessage({ type: 'response', request_seq: 7, success: false });
    h.stop(); await tick(); assert.equal(h.calls.length, 0);
    const unsolicited = harness(); unsolicited.stop(); await tick();
    assert.equal(unsolicited.calls.length, 0);
});

test('DAP failures are logged without retrying or resuming', async () => {
    const h = harness(wrapper, () => { throw new Error('stack unavailable'); });
    h.request(); h.stop(); await tick();
    assert.equal(h.calls.length, 1);
    assert.match(h.logs[0], /stack unavailable/);
});

test('setting disabled and non-MiniCtrlBox sessions do not create a stepping tracker', () => {
    assert.equal(createArduinoStepTracker({ configuration: {} }, {}, true), undefined);
    assert.equal(createArduinoStepTracker(harness().session, {}, false), undefined);
});
