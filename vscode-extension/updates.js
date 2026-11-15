const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const API = 'https://api.github.com/repos/alireza-553/MiniCtrlBoxDigitalTwin';
const RELEASES = 'https://github.com/alireza-553/MiniCtrlBoxDigitalTwin/releases/latest';
const DAY = 24 * 60 * 60 * 1000;
const DOWNLOAD_HOSTS = new Set(['api.github.com', 'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com']);

function versionParts(value) {
    const match = /^v?(\d{1,9})\.(\d{1,9})\.(\d{1,9})$/.exec(value || '');
    return match ? match.slice(1).map(Number) : null;
}

function newer(candidate, installed) {
    const a = versionParts(candidate), b = versionParts(installed);
    if (!a || !b) return false;
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
    return false;
}

// Updates use the public repository without credentials. Follow only GitHub's
// HTTPS download hosts, including signed release-asset redirects.
function requestBytes(address, accept = 'application/vnd.github+json', maxBytes = 2 * 1024 * 1024, redirects = 0, get = https.get) {
    return new Promise((resolve, reject) => {
        const url = new URL(address);
        if (url.protocol !== 'https:' || !DOWNLOAD_HOSTS.has(url.hostname) || url.username || url.password || url.port) {
            reject(new Error('Unerwartete Update-Downloadadresse.')); return;
        }
        const headers = { Accept: accept, 'User-Agent': 'MiniCtrlBoxDigitalTwin-Update', 'X-GitHub-Api-Version': '2022-11-28' };
        const request = get(url, { headers }, response => {
            response.on('error', () => reject(new Error('Update-Verbindung unterbrochen.')));
            if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
                response.resume();
                if (!response.headers.location || redirects >= 5) { reject(new Error('Zu viele Update-Weiterleitungen.')); return; }
                let next;
                try { next = new URL(response.headers.location, url).href; }
                catch { reject(new Error('Ungültige Update-Weiterleitung.')); return; }
                resolve(requestBytes(next, accept, maxBytes, redirects + 1, get)); return;
            }
            if (response.statusCode !== 200) {
                response.resume();
                const error = new Error(`GitHub-Updateprüfung: HTTP ${response.statusCode}.`);
                error.status = response.statusCode; reject(error); return;
            }
            let size = 0;
            const chunks = [];
            response.on('data', chunk => {
                size += chunk.length;
                if (size > maxBytes) { reject(new Error('Update-Download ist zu groß.')); request.destroy(); return; }
                chunks.push(chunk);
            });
            response.on('end', () => resolve(Buffer.concat(chunks)));
        });
        request.setTimeout(60000, () => request.destroy(new Error('Zeitüberschreitung bei der Updateprüfung.')));
        // Avoid exposing signed URLs or credentials through low-level errors.
        request.on('error', () => reject(new Error('Update-Download fehlgeschlagen. Netzwerkverbindung prüfen.')));
    });
}

function selectRelease(release, installed) {
    if (release.draft || release.prerelease || !newer(release.tag_name, installed)) return null;
    const version = versionParts(release.tag_name).join('.');
    const asset = release.assets?.find(item => item.name === `mcb-digital-twin-${version}.vsix`);
    const checksum = release.assets?.find(item => item.name === 'SHA256SUMS.txt');
    if (!asset || !Number.isSafeInteger(asset.id) || asset.id <= 0) throw new Error('Das neue Release enthält kein passendes VSIX-Paket.');
    return { version, asset, checksum };
}

function createUpdates(vscode, output, context, installed, services = {}) {
    const request = services.request || requestBytes;
    const clock = services.now || Date.now;
    let busy = false, disposed = false, startupTimer, intervalTimer;

    async function install(release) {
        if (vscode.debug.activeDebugSession) {
            vscode.window.showInformationMessage('Bitte zuerst die Debugsitzung beenden und danach erneut nach Updates suchen.');
            return;
        }
        let directory;
        try {
            await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `MiniCtrlBox ${release.version} herunterladen und installieren` }, async () => {
                const binary = await request(`${API}/releases/assets/${release.asset.id}`, 'application/octet-stream', 64 * 1024 * 1024);
                if (binary.length !== release.asset.size) throw new Error('Die Größe des Update-Pakets stimmt nicht mit dem Release überein.');
                let expected = /^sha256:([a-f0-9]{64})$/i.exec(release.asset.digest || '')?.[1];
                if (!expected && Number.isSafeInteger(release.checksum?.id) && release.checksum.id > 0) {
                    const sums = (await request(`${API}/releases/assets/${release.checksum.id}`, 'application/octet-stream', 65536)).toString('utf8');
                    for (const line of sums.split(/\r?\n/)) {
                        const entry = /^([a-f0-9]{64})\s+\*?(.+)$/.exec(line.trim());
                        if (entry && entry[2] === release.asset.name) expected = entry[1];
                    }
                }
                if (!expected) throw new Error('Für das Update-Paket fehlt eine SHA256-Prüfsumme. Bitte die Release-Seite verwenden.');
                if (crypto.createHash('sha256').update(binary).digest('hex') !== expected.toLowerCase()) throw new Error('Die SHA256-Prüfsumme des Update-Pakets stimmt nicht.');
                if (disposed) return;
                directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mcb-update-'));
                const file = path.join(directory, release.asset.name);
                await fs.promises.writeFile(file, binary);
                if (vscode.debug.activeDebugSession) throw new Error('Inzwischen wurde eine Debugsitzung gestartet. Bitte beenden und danach erneut nach Updates suchen.');
                await vscode.commands.executeCommand('workbench.extensions.installExtension', vscode.Uri.file(file));
            });
            if (disposed) return;
            const choice = await vscode.window.showInformationMessage(`MiniCtrlBox ${release.version} installiert. Zum Anwenden das Fenster neu laden; ein von dieser Erweiterung gestarteter Twin wird dabei beendet.`, 'Fenster neu laden', 'Später');
            if (choice === 'Fenster neu laden') await vscode.commands.executeCommand('workbench.action.reloadWindow');
        } finally {
            if (directory) {
                await fs.promises.unlink(path.join(directory, release.asset.name)).catch(() => {});
                await fs.promises.rmdir(directory).catch(() => {});
            }
        }
    }

    async function check(manual = false) {
        if (busy || disposed) return;
        const configuration = vscode.workspace.getConfiguration('mcbDigitalTwin');
        if (!manual && !configuration.get('checkForUpdates', true)) return;
        if (!manual && clock() - (context.globalState.get('updates.lastCheck', 0)) < DAY) return;
        busy = true;
        let installing = false;
        try {
            await context.globalState.update('updates.lastCheck', clock());
            const data = await request(`${API}/releases/latest`);
            if (disposed) return;
            const release = selectRelease(JSON.parse(data.toString('utf8')), installed);
            if (!release) {
                if (manual) vscode.window.showInformationMessage(`Keine neuere veröffentlichte MiniCtrlBox-Version gefunden. Installiert: ${installed}.`);
                return;
            }
            output.appendLine(`Update verfügbar: ${installed} → ${release.version}.`);
            const choice = await vscode.window.showInformationMessage(`MiniCtrlBox Digital Twin ${release.version} ist verfügbar. Installiert: ${installed}.`, 'Herunterladen und installieren', 'Release ansehen', 'Später');
            if (disposed) return;
            if (choice === 'Release ansehen') await vscode.env.openExternal(vscode.Uri.parse(RELEASES));
            else if (choice === 'Herunterladen und installieren') {
                installing = true;
                await install(release);
            }
        } catch (error) {
            output.appendLine(`Updateprüfung: ${error.message}`);
            if (manual || installing) vscode.window.showErrorMessage(`MiniCtrlBox-Update: ${error.message}`);
        } finally { busy = false; }
    }

    function start() {
        startupTimer = setTimeout(() => void check(), 15000);
        intervalTimer = setInterval(() => void check(), DAY);
        startupTimer.unref?.(); intervalTimer.unref?.();
    }
    function dispose() { disposed = true; clearTimeout(startupTimer); clearInterval(intervalTimer); }
    return { check, start, dispose };
}

module.exports = { createUpdates, newer, selectRelease, requestBytes };
