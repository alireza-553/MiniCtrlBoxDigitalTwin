const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');

function createHardwareCommands(vscode, output, getRoot) {
    let busy = false;

    function platformioPath() {
        const configured = vscode.workspace.getConfiguration('mcbDigitalTwin').get('platformioPath', '');
        if (configured) return configured;
        const core = process.env.PLATFORMIO_CORE_DIR || path.join(os.homedir(), '.platformio');
        const bundled = path.join(core, 'penv', process.platform === 'win32' ? 'Scripts' : 'bin',
            process.platform === 'win32' ? 'platformio.exe' : 'platformio');
        return fs.existsSync(bundled) ? bundled : 'platformio';
    }

    function run(root, args, json = false) {
        return new Promise((resolve, reject) => {
            const child = childProcess.spawn(platformioPath(), args, { cwd: root, shell: false });
            let data = '';
            let errors = '';
            child.stdout.on('data', chunk => { data += chunk; if (!json) output.append(chunk.toString()); });
            child.stderr.on('data', chunk => { errors += chunk; output.append(chunk.toString()); });
            child.on('error', error => reject(new Error(`PlatformIO konnte nicht gestartet werden: ${error.message}`)));
            child.on('exit', code => {
                if (code !== 0) return reject(new Error(`PlatformIO fehlgeschlagen (${code}). ${errors.slice(-2000)} Details stehen in der Ausgabe.`));
                try { resolve(json ? JSON.parse(data) : data); } catch {
                    reject(new Error('PlatformIO liefert keine gültigen JSON-Daten. Details stehen in der Ausgabe.'));
                }
            });
        });
    }

    async function execute(debug) {
        if (busy) return;
        busy = true;
        try {
            if (!vscode.workspace.isTrusted) throw new Error('Hardwarezugriff benötigt einen vertrauenswürdigen Projektordner.');
            if (vscode.debug.activeDebugSession?.type === 'platformio-debug') {
                throw new Error('Bitte zuerst die laufende Hardware-Debugsitzung beenden.');
            }
            const root = getRoot();
            if (!root || !fs.existsSync(path.join(root, 'platformio.ini'))) {
                throw new Error('Bitte den PlatformIO-Projektordner mit platformio.ini öffnen.');
            }
            const extension = vscode.extensions.getExtension('platformio.platformio-ide');
            if (!extension) throw new Error('Bitte zuerst die Erweiterung „PlatformIO IDE“ installieren.');
            await extension.activate();
            const documents = vscode.workspace.textDocuments.filter(document => document.isDirty
                && vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath === root);
            if ((await Promise.all(documents.map(document => document.save()))).some(saved => !saved)) {
                throw new Error('Projektdateien konnten nicht gespeichert werden. Hardwareaktion abgebrochen.');
            }
            output.show(true);
            const config = await run(root, ['project', 'config', '--project-dir', root, '--json-output'], true);
            const environments = config.filter(([name]) => name.startsWith('env:') && !name.startsWith('env:mcb-usb-debug-'))
                .map(([name, pairs]) => ({ label: name.slice(4), options: Object.fromEntries(pairs) }))
                .filter(env => env.options.board === 'esp32-c3-devkitm-1');
            if (!environments.length) throw new Error('Diese Hardwareanbindung unterstützt derzeit ESP32-C3-Projekte mit board = esp32-c3-devkitm-1.');
            const selected = environments.length === 1 ? environments[0]
                : await vscode.window.showQuickPick(environments, { placeHolder: 'MiniCtrlBox-Projektumgebung auswählen' });
            if (!selected) return;
            if (![].concat(selected.options.framework || []).includes('arduino')) {
                throw new Error('Diese MiniCtrlBox-Anbindung benötigt das Arduino-Framework.');
            }
            if (!/^[\w.-]+$/.test(selected.label)) throw new Error('Der Name der PlatformIO-Umgebung wird nicht unterstützt.');
            const devices = (await run(root, ['device', 'list', '--json-output'], true))
                .filter(device => /303A:1001/i.test(device.hwid || ''));
            if (devices.length !== 1) throw new Error('Bitte genau eine MiniCtrlBox über den nativen ESP32-C3-USB-Anschluss verbinden.');
            output.appendLine(`Echte MiniCtrlBox: ${devices[0].port} · ${selected.label}`);

            if (!debug) {
                await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification,
                    title: 'MiniCtrlBox: Echte Hardware programmieren', cancellable: false },
                () => run(root, ['run', '--project-dir', root, '--environment', selected.label,
                    '--target', 'upload', '--upload-port', devices[0].port]));
                vscode.window.showInformationMessage('Anwenderprogramm wurde auf die echte MiniCtrlBox übertragen.');
                return;
            }

            const debugEnv = `mcb-usb-debug-${selected.label}`;
            const iniPath = path.join(root, 'platformio.ini');
            const original = fs.readFileSync(iniPath, 'utf8');
            const section = `[env:${debugEnv}]`;
            if (original.split(/\r?\n/).some(line => line.trim() === section)) {
                const current = config.find(([name]) => name === `env:${debugEnv}`);
                const options = current && Object.fromEntries(current[1]);
                if (!options || options.debug_tool !== 'esp-builtin' || options.build_type !== 'debug'
                    || options.upload_protocol !== 'esp-builtin' || options.debug_init_break !== 'tbreak setup') {
                    throw new Error(`Die vorhandene Umgebung ${debugEnv} weicht von der USB-Debugkonfiguration ab. Bitte platformio.ini prüfen.`);
                }
            } else {
                const eol = original.includes('\r\n') ? '\r\n' : '\n';
                const addition = ['', '; MiniCtrlBox: natives USB-JTAG-Debugging', section,
                    `extends = env:${selected.label}`, 'build_type = debug', 'debug_tool = esp-builtin',
                    'upload_protocol = esp-builtin', 'debug_init_break = tbreak setup', ''].join(eol);
                fs.appendFileSync(iniPath, eol + addition, 'utf8');
            }
            await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification,
                title: 'MiniCtrlBox: Hardware-Debugbuild erstellen', cancellable: false },
            () => run(root, ['run', '--project-dir', root, '--environment', debugEnv]));
            const metadata = await run(root, ['project', 'metadata', '--project-dir', root,
                '--environment', debugEnv, '--json-output'], true);
            const build = metadata[debugEnv];
            if (!build?.prog_path || !build.cc_path) throw new Error('PlatformIO liefert keine Debug-Buildinformationen.');
            const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(root));
            const started = await vscode.debug.startDebugging(folder, {
                name: 'MiniCtrlBox: Echte Hardware (USB-JTAG)', type: 'platformio-debug', request: 'launch',
                cwd: root, projectEnvName: debugEnv, executable: build.prog_path,
                toolchainBinDir: path.dirname(build.cc_path), loadMode: 'always',
                internalConsoleOptions: 'openOnSessionStart',
            });
            if (!started) throw new Error('Hardware-Debugger wurde nicht gestartet. Bitte die PlatformIO-Debugkonsole prüfen.');
            output.appendLine('Hardware-Debugsitzung gestartet. PlatformIO überträgt die Firmware und hält in setup().');
        } catch (error) {
            output.appendLine(error.message);
            output.show(true);
            vscode.window.showErrorMessage(error.message);
        } finally {
            busy = false;
        }
    }

    return { upload: () => execute(false), debug: () => execute(true) };
}

module.exports = { createHardwareCommands };
