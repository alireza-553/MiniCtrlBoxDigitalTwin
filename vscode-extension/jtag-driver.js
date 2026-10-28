const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

function createJtagDriverSetup(vscode, output, context) {
    let pending;

    function invoke(install) {
        const cache = path.join(context.globalStorageUri.fsPath, 'usb-jtag-driver');
        const script = fs.readFileSync(path.join(context.extensionPath, 'windows-jtag.ps1'), 'utf8');
        const quoted = cache.replace(/'/g, "''");
        const command = `& {\n${script}\n} -CacheDirectory '${quoted}' ${install ? '-Install' : ''}`;
        const encoded = Buffer.from(command, 'utf16le').toString('base64');
        const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
        return new Promise((resolve, reject) => {
            const child = childProcess.spawn(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
                shell: false, windowsHide: true,
            });
            let data = '';
            let errors = '';
            child.stdout.on('data', chunk => { data += chunk; });
            child.stderr.on('data', chunk => { errors += chunk; });
            child.on('error', reject);
            child.on('close', code => {
                try {
                    const result = JSON.parse(data.replace(/^\uFEFF/, '').trim());
                    if (code !== 0 || !result.ok) throw new Error(result.error || 'USB-JTAG-Treibereinrichtung fehlgeschlagen.');
                    resolve(result);
                } catch (error) {
                    output.appendLine(errors);
                    reject(new Error(`USB-JTAG: ${error.message}`));
                }
            });
        });
    }

    async function setup(manual) {
        if (!vscode.workspace.isTrusted) throw new Error('Treibereinrichtung benötigt einen vertrauenswürdigen Projektordner.');
        if (process.platform !== 'win32') {
            if (manual) throw new Error('Die automatische USB-JTAG-Treibereinrichtung ist nur für Windows verfügbar.');
            return;
        }
        const current = await invoke(false);
        if (current.ready) {
            output.appendLine('USB-JTAG-Treiber ist bereits korrekt eingerichtet.');
            if (manual) vscode.window.showInformationMessage('USB-JTAG-Treiber ist bereits korrekt eingerichtet.');
            return;
        }
        const automatic = vscode.workspace.getConfiguration('mcbDigitalTwin').get('autoInstallJtagDriver', true);
        if (!manual && !automatic) throw new Error('USB-JTAG-Treiber fehlt. Bitte „USB-JTAG-Treiber einrichten“ ausführen.');
        output.appendLine('USB-JTAG-Treiber wird eingerichtet. Bitte die Windows-Administratorabfrage für Microsoft PnP Utility bestätigen.');
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification,
            title: 'MiniCtrlBox: Espressif-USB-JTAG-Treiber einrichten – Windows-Bestätigung erforderlich',
            cancellable: false }, () => invoke(true));
        vscode.window.showInformationMessage('Espressif-USB-JTAG-Treiber wurde erfolgreich eingerichtet.');
    }

    return function ensureDriver(manual = false) {
        if (pending) return pending;
        pending = setup(manual).finally(() => { pending = undefined; });
        return pending;
    };
}

module.exports = { createJtagDriverSetup };
