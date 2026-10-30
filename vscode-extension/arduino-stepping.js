// GDB's `skip` handles calls into a function, not returns to its caller.
// Continue only a user-requested source step that returned to Arduino's wrapper.
function createArduinoStepTracker(session, output, enabled) {
    if (!enabled || !session.configuration?.mcbHardwareDebug || typeof session.customRequest !== 'function') return undefined;
    let pendingStep;
    let revision = 0;
    let ended = false;
    let temporaryBreakpoint;
    const controls = new Set(['next', 'stepIn', 'stepOut', 'continue', 'pause', 'restart', 'restartFrame', 'goto', 'disconnect', 'terminate']);

    async function deleteTemporary(number) {
        if (ended) return;
        try {
            const listing = await session.customRequest('execute-command', { command: '-break-list' });
            const table = listing?.results?.find(pair => pair[0] === 'BreakpointTable')?.[1];
            const body = table?.find(pair => pair[0] === 'body')?.[1];
            if (!Array.isArray(body)) throw new Error('GDB-Haltepunktliste konnte nicht gelesen werden.');
            if (body.some(pair => pair[0] === 'bkpt' && pair[1]?.some(field => field[0] === 'number' && field[1] === number)))
                await session.customRequest('execute-command', { command: `-break-delete ${number}` });
        }
        catch (error) {
            // A hit temporary breakpoint has already been deleted by GDB.
            if (!/no breakpoint|not found|does not exist/i.test(error.message || ''))
                output.appendLine(`[Hardware-Debugger] Temporären Haltepunkt ${number} prüfen: ${error.message}`);
        }
    }

    async function returnToLoop(threadId, stoppedRevision) {
        const current = () => !ended && revision === stoppedRevision;
        let inserted;
        let resuming = false;
        try {
            const stack = await session.customRequest('stackTrace', { threadId, startFrame: 0, levels: 1 });
            if (!current()) return;
            const frame = stack.stackFrames?.[0];
            const source = frame?.source?.path?.replace(/\\/g, '/');
            // PlatformIO's stackTraceRequest appends `@${address}` to every frame name.
            const functionName = (frame?.name || '').replace(/@0x[0-9a-f]+$/i, '');
            if (!/^loopTask\s*(?:\(.*\))?$/.test(functionName) || !/\/cores\/esp32\/main\.cpp$/i.test(source || '')) return;
            output.appendLine('[Hardware-Debugger] Einzelschritt aus Arduino loopTask zurück zum nächsten loop()-Eintritt.');
            // `advance` reports location-reached, which PlatformIO maps to exception.
            // Its execute-command request returns MI resultRecords directly. Use a
            // thread-specific temporary hardware breakpoint and standard DAP continue.
            const result = await session.customRequest('execute-command', { command: `-break-insert -h -t -p ${threadId} loop` });
            const breakpoint = result?.results?.find(pair => pair[0] === 'bkpt')?.[1];
            inserted = breakpoint?.find(pair => pair[0] === 'number')?.[1];
            if (!/^\d+$/.test(inserted || '')) throw new Error('GDB hat keine eindeutige Nummer für den temporären Haltepunkt geliefert. Nicht automatisch fortgesetzt.');
            if (!current()) { await deleteTemporary(inserted); return; }
            temporaryBreakpoint = inserted;
            resuming = true;
            await session.customRequest('continue', { threadId });
        } catch (error) {
            if (inserted && temporaryBreakpoint === inserted) {
                temporaryBreakpoint = undefined;
                await deleteTemporary(inserted);
            }
            if (!ended && (current() || resuming)) output.appendLine(`[Hardware-Debugger] Automatischer Wechsel zu loop() nicht möglich: ${error.message}. Debugkonsole prüfen; keine Wiederholung.`);
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
            if (temporaryBreakpoint) {
                const number = temporaryBreakpoint;
                temporaryBreakpoint = undefined;
                void deleteTemporary(number);
            }
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
