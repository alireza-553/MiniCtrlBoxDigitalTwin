const fs = require('fs');
const path = require('path');

const RULE = 'SUBSYSTEM=="usb", ATTR{idVendor}=="303a", ATTR{idProduct}=="1001", TAG+="uaccess", ENV{ID_MM_DEVICE_IGNORE}="1", ENV{ID_MM_PORT_IGNORE}="1"';
// Keep the privileged commands and destination fixed. No project data or
// downloaded scripts are executed with sudo; the password stays in the terminal.
const INSTALL_COMMAND = [
    'set -eu',
    "printf '%s\\n' 'MiniCtrlBox: USB-JTAG-Zugriff einrichten. sudo fragt nach deinem Passwort.'",
    'test ! -L /etc/udev/rules.d/70-minictrlbox-esp32c3.rules',
    `printf '%s\\n' '${RULE}' | sudo /usr/bin/tee /etc/udev/rules.d/70-minictrlbox-esp32c3.rules >/dev/null`,
    'sudo /usr/bin/udevadm control --reload-rules',
    "printf '%s\\n' 'Regel installiert. MiniCtrlBox jetzt abziehen und wieder anschliessen.'",
].join('\n');

function inspectUsbAccess() {
    const devices = [];
    for (const name of fs.readdirSync('/sys/bus/usb/devices')) {
        const root = path.join('/sys/bus/usb/devices', name);
        try {
            if (fs.readFileSync(path.join(root, 'idVendor'), 'utf8').trim() !== '303a'
                || fs.readFileSync(path.join(root, 'idProduct'), 'utf8').trim() !== '1001') continue;
            const bus = fs.readFileSync(path.join(root, 'busnum'), 'utf8').trim();
            const dev = fs.readFileSync(path.join(root, 'devnum'), 'utf8').trim();
            if (!/^\d+$/.test(bus) || !/^\d+$/.test(dev)) continue;
            const file = `/dev/bus/usb/${bus.padStart(3, '0')}/${dev.padStart(3, '0')}`;
            let ready = false;
            try { fs.accessSync(file, fs.constants.R_OK | fs.constants.W_OK); ready = true; } catch { /* Needs uaccess. */ }
            devices.push({ file, ready });
        } catch { /* Interfaces have no vendor ID; devices may disappear on unplug. */ }
    }
    return devices;
}

function createLinuxJtagSetup(vscode, output) {
    return async function setup(manual) {
        const devices = inspectUsbAccess();
        if (devices.length !== 1) throw new Error('Bitte genau eine MiniCtrlBox über USB anschließen und erneut versuchen.');
        if (devices[0].ready) {
            output.appendLine('Linux-USB-JTAG-Zugriff ist bereits eingerichtet.');
            return;
        }
        if (!manual && !vscode.workspace.getConfiguration('mcbDigitalTwin').get('autoInstallJtagDriver', true)) {
            throw new Error('Linux-USB-JTAG-Zugriff fehlt. Bitte „USB-JTAG-Treiber einrichten“ ausführen.');
        }
        output.appendLine('Linux-USB-JTAG-Regel wird eingerichtet. Bitte sudo im geöffneten Terminal bestätigen und danach die MiniCtrlBox neu verbinden.');
        await new Promise((resolve, reject) => {
            let terminal;
            const subscription = vscode.window.onDidCloseTerminal(closed => {
                if (closed !== terminal) return;
                subscription.dispose();
                if (closed.exitStatus?.code === 0) resolve();
                else reject(new Error('Linux-USB-JTAG-Einrichtung abgebrochen oder sudo fehlgeschlagen. Bitte erneut starten und die Terminalausgabe prüfen.'));
            });
            try {
                terminal = vscode.window.createTerminal({ name: 'MiniCtrlBox: USB-JTAG (sudo)',
                    shellPath: '/bin/bash', shellArgs: ['--noprofile', '--norc', '-c', INSTALL_COMMAND] });
                terminal.show();
            } catch (error) { subscription.dispose(); reject(error); }
        });
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification,
            title: 'MiniCtrlBox abziehen und wieder anschließen – USB-JTAG-Zugriff prüfen', cancellable: true },
        async (_, token) => {
            for (let attempt = 0; attempt < 120; attempt++) {
                if (token.isCancellationRequested) throw new Error('Warten auf USB-JTAG-Zugriff abgebrochen.');
                const current = inspectUsbAccess();
                if (current.length === 1 && current[0].ready) {
                    output.appendLine('Linux-USB-JTAG-Zugriff erfolgreich geprüft.');
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            throw new Error('Noch kein USB-JTAG-Zugriff. MiniCtrlBox neu verbinden und Hardware-Debugging erneut starten.');
        });
    };
}

module.exports = { createLinuxJtagSetup, inspectUsbAccess };
