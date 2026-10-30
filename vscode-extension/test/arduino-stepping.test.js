const assert = require('node:assert/strict');
const test = require('node:test');
const { createArduinoStepTracker } = require('../arduino-stepping');

const tick = () => new Promise(resolve => setImmediate(resolve));
// Actual PlatformIO stackTraceRequest format: function name + '@' + address.
const wrapper = { name: 'loopTask(void*)@0x42001b9c', source: { path: 'C:\\.platformio\\packages\\framework-arduinoespressif32\\cores\\esp32\\main.cpp' } };
function harness(frame = wrapper, stackRequest) {
    const calls = [], logs = [];
    const session = { configuration: { mcbHardwareDebug: true }, customRequest: async (command, args) => {
        calls.push({ command, args });
        if (command === 'stackTrace') return stackRequest ? stackRequest() : { stackFrames: [frame] };
        if (command === 'execute-command' && args.command.startsWith('-break-insert')) return { results: [['bkpt', [['number', '5']]]] };
        if (command === 'execute-command' && args.command === '-break-list') return { results: [['BreakpointTable', [['body', []]]]] };
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
            { command: 'execute-command', args: { command: '-break-insert -h -t -p 3 loop' } },
            { command: 'continue', args: { threadId: 3 } },
        ]);
        h.stop('breakpoint'); await tick();
        assert.equal(h.calls.filter(call => call.command === 'continue').length, 1, 'no repeated automatic resume');
    });
}

test('plain and address-suffixed loopTask names on Linux and Windows are recognized', async () => {
    for (const name of ['loopTask', 'loopTask(void*)', 'loopTask@0x42001b9c', 'loopTask(void*)@0x42001b9c']) {
        const h = harness({ name, source: { path: '/home/student/.platformio/packages/framework-arduinoespressif32/cores/esp32/main.cpp' } });
        h.request(); h.stop(); await tick();
        assert.equal(h.calls.length, 3, name);
    }
});

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
        { name: 'loopTaskHelper@0x42001b9c', source: wrapper.source },
        { name: 'loopTask(void*)@invalid', source: wrapper.source },
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

test('failure to insert a temporary breakpoint never continues the target', async () => {
    const h = harness();
    const original = h.session.customRequest;
    h.session.customRequest = async (command, args) => {
        if (command === 'execute-command') throw new Error('No hardware breakpoint available');
        return original(command, args);
    };
    h.request(); h.stop(); await tick();
    assert.equal(h.calls.some(call => call.command === 'continue'), false);
    assert.match(h.logs.at(-1), /No hardware breakpoint available/);
});

test('pause during breakpoint insertion removes only the new breakpoint and does not continue', async () => {
    const h = harness();
    const original = h.session.customRequest;
    const commands = [];
    let inserted;
    h.session.customRequest = async (command, args) => {
        if (command !== 'execute-command') return original(command, args);
        commands.push(args.command);
        if (args.command.startsWith('-break-insert')) return new Promise(resolve => { inserted = resolve; });
        if (args.command === '-break-list') return { results: [['BreakpointTable', [['body', [
            ['bkpt', [['number', '2']]], ['bkpt', [['number', '5']]],
        ]]]]] };
        return {};
    };
    h.request(); h.stop(); await tick();
    h.request('pause');
    inserted({ results: [['bkpt', [['number', '5']]]] }); await tick();
    assert.deepEqual(commands, ['-break-insert -h -t -p 3 loop', '-break-list', '-break-delete 5']);
    assert.equal(h.calls.some(call => call.command === 'continue'), false);
});

test('another breakpoint before loop removes only our temporary breakpoint and preserves the halt', async () => {
    const h = harness();
    const original = h.session.customRequest;
    const deleted = [];
    h.session.customRequest = async (command, args) => {
        if (command === 'execute-command' && args.command === '-break-list')
            return { results: [['BreakpointTable', [['body', [['bkpt', [['number', '5']]]]]]]] };
        if (command === 'execute-command' && args.command.startsWith('-break-delete')) deleted.push(args.command);
        return original(command, args);
    };
    h.request(); h.stop(); await tick();
    h.stop('breakpoint'); await tick();
    assert.deepEqual(deleted, ['-break-delete 5']);
    assert.equal(h.calls.filter(call => call.command === 'continue').length, 1);
});
