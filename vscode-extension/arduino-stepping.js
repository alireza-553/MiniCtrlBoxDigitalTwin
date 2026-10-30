// GDB's `skip` handles calls into a function, not returns to its caller.
// Continue only a user-requested source step that returned to Arduino's wrapper.
function createArduinoStepTracker(session, output, enabled) {
    if (!enabled || !session.configuration?.mcbHardwareDebug || typeof session.customRequest !== 'function') return undefined;
    let pendingStep;
    let revision = 0;
    let ended = false;
    const controls = new Set(['next', 'stepIn', 'stepOut', 'continue', 'pause', 'restart', 'restartFrame', 'goto', 'disconnect', 'terminate']);

    async function returnToLoop(threadId, stoppedRevision) {
        const current = () => !ended && revision === stoppedRevision;
        try {
            const stack = await session.customRequest('stackTrace', { threadId, startFrame: 0, levels: 1 });
            if (!current()) return;
            const frame = stack.stackFrames?.[0];
            const source = frame?.source?.path?.replace(/\\/g, '/');
            if (!/^loopTask\s*(?:\(.*\))?$/.test(frame?.name || '') || !/\/cores\/esp32\/main\.cpp$/i.test(source || '')) return;
            output.appendLine('[Hardware-Debugger] Einzelschritt aus Arduino loopTask zurück zum nächsten loop()-Eintritt.');
            // Select the stopped thread and its innermost frame explicitly. PlatformIO's
            // REPL does not use DAP frameId and wraps plain text in unescaped quotes.
            await session.customRequest('evaluate', {
                expression: `-interpreter-exec --thread ${threadId} --frame 0 console "advance loop"`,
                context: 'repl',
            });
        } catch (error) {
            if (current()) output.appendLine(`[Hardware-Debugger] Automatischer Wechsel zu loop() nicht möglich: ${error.message}. Debugkonsole prüfen; keine Wiederholung.`);
        }
    }

    return {
        onWillReceiveMessage(message) {
            if (message.type !== 'request' || !controls.has(message.command)) return;
            revision++;
            const { threadId, granularity, targetId } = message.arguments || {};
            pendingStep = ['next', 'stepIn'].includes(message.command) && granularity !== 'instruction' && targetId === undefined
                ? { threadId, seq: message.seq } : undefined;
        },
        onDidSendMessage(message) {
            if (message.type === 'response' && message.success === false && message.request_seq === pendingStep?.seq) pendingStep = undefined;
            if (message.type !== 'event') return;
            if (['terminated', 'exited'].includes(message.event)) { ended = true; revision++; pendingStep = undefined; }
            if (message.event === 'continued') revision++;
            if (message.event !== 'stopped') return;
            const step = pendingStep;
            pendingStep = undefined;
            const stoppedRevision = ++revision;
            const body = message.body || {};
            if (!step || body.reason !== 'step' || body.hitBreakpointIds?.length || body.threadId !== step.threadId
                || !Number.isSafeInteger(body.threadId) || body.threadId <= 0 || ended) return;
            void returnToLoop(body.threadId, stoppedRevision);
        },
        onExit() { ended = true; revision++; pendingStep = undefined; },
    };
}

module.exports = { createArduinoStepTracker };
