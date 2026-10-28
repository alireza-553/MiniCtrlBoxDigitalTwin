function combineTrackers(...trackers) {
    const result = {};
    for (const event of ['onWillStartSession', 'onWillReceiveMessage', 'onDidSendMessage', 'onWillStopSession', 'onError', 'onExit']) {
        result[event] = (...args) => {
            for (const tracker of trackers) tracker?.[event]?.(...args);
        };
    }
    return result;
}

function sourceVariables(symbols, prefix = '') {
    const items = [];
    for (const symbol of symbols || []) {
        // SymbolKind.Variable = 12, Constant = 13, Namespace = 2.
        // Do not suggest locals from another function or non-static class fields.
        if ([12, 13].includes(symbol.kind) && !symbol.containerName) {
            const name = `${prefix}${symbol.name}`;
            if (/^[A-Za-z_]\w*(::[A-Za-z_]\w*)*$/.test(name)) {
                items.push({ label: name, description: 'Global · Quelldatei', expression: `::${name}` });
            }
        } else if (symbol.kind === 2 && symbol.children) {
            items.push(...sourceVariables(symbol.children, `${prefix}${symbol.name}::`));
        }
    }
    return items;
}

function createVariableSearch(vscode, output) {
    const states = new Map();
    function stateFor(session) {
        if (!states.has(session.id)) states.set(session.id, { revision: 0 });
        return states.get(session.id);
    }
    function createDebugAdapterTracker(session) {
        const state = stateFor(session);
        return {
            onDidSendMessage(message) {
                if (message.type !== 'event') return;
                if (message.event === 'stopped') {
                    state.revision++;
                    state.running = false;
                    state.threadId = message.body?.threadId;
                } else if (['continued', 'terminated', 'exited'].includes(message.event)) {
                    state.revision++;
                    state.running = true;
                }
            },
            onExit() { state.revision++; state.running = true; states.delete(session.id); },
        };
    }

    async function search() {
        const session = vscode.debug.activeDebugSession;
        if (!session) {
            vscode.window.showInformationMessage('Bitte zuerst eine Debugsitzung starten und an einem Haltepunkt anhalten.');
            return;
        }
        if (!['platformio-debug', 'cppdbg', 'cppvsdbg'].includes(session.type || session.configuration?.type)) {
            vscode.window.showInformationMessage('Die Variablensuche unterstützt PlatformIO- und C++-Debugsitzungen.');
            return;
        }
        const state = stateFor(session);
        const revision = state.revision;
        const selected = vscode.debug.activeStackItem;
        const selectedFrameId = selected?.session?.id === session.id ? selected.frameId : undefined;
        const valid = () => vscode.debug.activeDebugSession?.id === session.id
            && state.revision === revision && !state.running
            && (selectedFrameId === undefined || vscode.debug.activeStackItem?.frameId === selectedFrameId);
        const assertValid = () => {
            if (!valid()) throw new Error('Die Debugposition hat sich geändert. Bitte erneut anhalten und die Variablensuche öffnen.');
        };
        async function request(command, args) {
            assertValid();
            const result = await session.customRequest(command, args);
            assertValid();
            return result;
        }
        try {
            if (state.running) throw new Error('Bitte das Programm zuerst anhalten (Pause oder Haltepunkt).');
            let threadId = selected?.session?.id === session.id ? selected.threadId : state.threadId;
            if (threadId === undefined) threadId = (await request('threads', {})).threads?.[0]?.id;
            if (threadId === undefined) throw new Error('Der Debugger liefert keinen Thread. Bitte an einem Haltepunkt anhalten.');
            const frames = (await request('stackTrace', { threadId, startFrame: 0, levels: 50 })).stackFrames || [];
            const frame = selectedFrameId === undefined ? frames[0] : frames.find(item => item.id === selectedFrameId);
            if (!frame) throw new Error('Kein angehaltener Stack Frame verfügbar. Bitte einen Eintrag in der Aufrufliste auswählen.');

            const scopes = (await request('scopes', { frameId: frame.id })).scopes || [];
            const globalScope = scope => /global/i.test(scope.name) || scope.presentationHint === 'globals';
            let globalsLoaded = false;
            const candidates = [];
            if (frame.source?.path) {
                try {
                    const symbols = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', vscode.Uri.file(frame.source.path));
                    assertValid();
                    candidates.push(...sourceVariables(symbols));
                } catch (error) {
                    output.appendLine(`Variablensuche: Quellcodesymbole nicht verfügbar: ${error.message}`);
                }
            }
            for (const scope of scopes.filter(scope => !globalScope(scope))) {
                try {
                    const response = await request('variables', { variablesReference: scope.variablesReference });
                    for (const variable of response.variables || []) {
                        candidates.push({ label: variable.name, description: scope.name,
                            detail: variable.type || '', expression: variable.evaluateName || variable.name });
                    }
                } catch (error) {
                    assertValid();
                    output.appendLine(`Variablensuche: ${scope.name}: ${error.message}`);
                }
            }
            while (valid()) {
                const unique = [...new Map(candidates.map(item => [item.expression, item])).values()];
                unique.sort((a, b) => a.label.localeCompare(b.label));
                if (!globalsLoaded && scopes.some(globalScope)) unique.push({ label: '$(database) Weitere globale Variablen laden',
                    description: 'Auch Bibliotheken und Framework · kann länger dauern', loadGlobals: true });
                if (!unique.length) throw new Error('Keine Variablen verfügbar. Einen anderen Stack Frame wählen oder den Namen direkt unter Watch eintragen.');
                const choice = await vscode.window.showQuickPick(unique, {
                    title: 'Variable suchen und überwachen', placeHolder: 'Variablenname eingeben, z. B. afTemperaturen',
                    matchOnDescription: true, matchOnDetail: false,
                });
                if (!choice) return;
                assertValid();
                if (choice.loadGlobals) {
                    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification,
                        title: 'Globale Debugvariablen laden', cancellable: false }, async () => {
                        for (const scope of scopes.filter(globalScope)) {
                            const response = await request('variables', { variablesReference: scope.variablesReference });
                            for (const variable of response.variables || []) {
                                const expression = variable.evaluateName || variable.name;
                                candidates.push({ label: variable.name, description: scope.name, detail: variable.type || '',
                                    expression: /^[A-Za-z_]\w*$/.test(expression) ? `::${expression}` : expression });
                            }
                        }
                    });
                    globalsLoaded = true;
                    continue;
                }
                // Check availability in this frame before adding a persistent Watch expression.
                await request('evaluate', { expression: choice.expression, frameId: frame.id, context: 'watch' });
                await vscode.commands.executeCommand('debug.addToWatchExpressions', { variable: { evaluateName: choice.expression } });
                await vscode.commands.executeCommand('workbench.view.debug');
                return;
            }
            assertValid();
        } catch (error) {
            output.appendLine(`Variablensuche: ${error.message}`);
            vscode.window.showErrorMessage(`Variablensuche: ${error.message}`);
        }
    }

    return { search, createDebugAdapterTracker };
}

module.exports = { createVariableSearch, sourceVariables, combineTrackers };
