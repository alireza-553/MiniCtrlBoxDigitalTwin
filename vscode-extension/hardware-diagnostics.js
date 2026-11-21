const os = require('node:os');
const path = require('node:path');
const { stripVTControlCharacters } = require('node:util');

const LOG_LIMIT = 64000;

function redactLog(text, folders) {
    const locations = [
        ...folders.map(folder => [folder.uri.fsPath, '<PROJEKT>']),
        [os.homedir(), '<BENUTZERORDNER>'],
    ].filter(([directory]) => directory && directory !== path.parse(directory).root);
    for (const [directory, label] of locations.sort(([a], [b]) => b.length - a.length)) {
        const pattern = directory.split(/[\\/]/).map(part => part.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&')).join('[\\\\/]');
        text = text.replace(new RegExp(pattern + '(?=$|[\\\\/\\s"\'`:),;])', process.platform === 'win32' ? 'gi' : 'g'), label);
    }
    return text.replace(/(https?:\/\/)[^/\s@]+@/gi, '$1<ZUGANGSDATEN>@')
        .replace(/(\b(?:password|passwd|token|api[_-]?key|secret|serial number|serialno)\s*[=:]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/gi, '$1<ENTFERNT>');
}

function createHardwareDiagnostics(vscode, output, extensionVersion) {
    let log = '';
    let truncated = false;

    function capture(text) {
        log += text;
        if (log.length > LOG_LIMIT) {
            log = log.slice(-LOG_LIMIT);
            truncated = true;
        }
    }

    function append(text) {
        capture(text);
        output.append(text);
    }

    function appendLine(text) {
        capture(text + '\n');
        output.appendLine(text);
    }

    async function save() {
        if (!log.trim()) {
            vscode.window.showInformationMessage('Für den Diagnosebericht zuerst das Übertragen oder Debuggen versuchen.');
            return;
        }
        const now = new Date().toISOString();
        const platformio = vscode.extensions.getExtension('platformio.platformio-ide');
        const report = [
            'MiniCtrlBox – Hardware-Diagnosebericht',
            'Erstellt (UTC): ' + now,
            'MiniCtrlBox-Erweiterung: ' + extensionVersion,
            'VS Code: ' + vscode.version,
            'PlatformIO IDE: ' + (platformio?.packageJSON?.version || 'unbekannt'),
            'Betriebssystem: ' + [process.platform, process.arch, os.release()].join(' '),
            '',
            truncated ? 'Hardware-Protokoll (ältere Einträge gekürzt)' : 'Hardware-Protokoll',
            redactLog(stripVTControlCharacters(log), vscode.workspace.workspaceFolders || []),
        ].join('\n');
        try {
            const uri = await vscode.window.showSaveDialog({
                title: 'Hardware-Diagnosebericht speichern',
                saveLabel: 'Diagnosebericht speichern',
                defaultUri: vscode.Uri.file(path.join(os.homedir(), 'minictrlbox-diagnose-' + now.replace(/[:.]/g, '-') + '.txt')),
                filters: { Textdateien: ['txt'] },
            });
            if (!uri) return;
            await vscode.workspace.fs.writeFile(uri, Buffer.from(report, 'utf8'));
            const open = 'Bericht öffnen';
            if (await vscode.window.showInformationMessage('Diagnosebericht gespeichert. Bitte vor dem Teilen prüfen.', open) === open) {
                await vscode.window.showTextDocument(uri);
            }
        } catch (error) {
            vscode.window.showErrorMessage('Diagnosebericht konnte nicht verarbeitet werden. ' + error.message);
        }
    }

    return { append, appendLine, show: preserveFocus => output.show(preserveFocus), save };
}

module.exports = { createHardwareDiagnostics };
