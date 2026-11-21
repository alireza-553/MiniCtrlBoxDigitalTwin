const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');
const { createArduinoStepTracker } = require('./arduino-stepping');

const MODERN_RISCV_GDB_PACKAGE = 'platformio/tool-riscv32-esp-elf-gdb@14.2.0+20240403';
const MODERN_RISCV_GDB_DIRECTORY = 'tool-riscv32-esp-elf-gdb';
const DIAGNOSTIC_DEBUG_REQUESTS = new Set(['continue', 'next', 'stepIn', 'stepOut', 'pause', 'restart', 'disconnect', 'terminate']);

const DEBUG_STARTUP_COMMANDS = [
    // Keep Arduino's FreeRTOS wrapper out of normal source-level step-into operations.
    'skip function loopTask',
    // Prevent a pending ISR from returning to and immediately re-hitting the
    // same persistent hardware breakpoint during a source-level step.
    'monitor riscv set_maskisr steponly',
    // Keep OpenOCD's watchdog shutdown and also clear pending interrupts at every halt.
    'monitor esp32c3 configure -event halted { esp32c3_wdt_disable; mww 0x6002007c 2; mww 0x6001f07c 2 }',
    'monitor esp32c3_wdt_disable',
    // ESP32-C3 TIMG_INT_CLR (+0x7c), WDT interrupt bit 1.
    'monitor mww 0x6002007c 2',
    'monitor mww 0x6001f07c 2',
];

const DEBUG_BUILD_FLAGS = [
    '-fno-inline',
    '-fno-inline-small-functions',
    '-fno-default-inline',
];

function updateDebugSection(text, name, commands, baseName, inheritedDebugFlags = [], usePreload = true) {
    const lines = text.split(/\r?\n/);
    const start = lines.findIndex(line => line.trim() === `[env:${name}]`);
    if (start < 0) throw new Error('Die MiniCtrlBox-Debugumgebung wurde nicht gefunden.');
    let end = lines.findIndex((line, index) => index > start && /^\s*\[/.test(line));
    if (end < 0) end = lines.length;
    const section = lines.slice(start, end);
    function setOption(key, value) {
        const index = section.findIndex(line => new RegExp(`^\\s*${key}\\s*=`).test(line));
        if (index < 0) { section.push(...value); return; }
        let count = 1;
        while (index + count < section.length && /^\s+\S/.test(section[index + count])) count++;
        section.splice(index, count, ...value);
    }
    function ensureListOption(key, values) {
        const index = section.findIndex(line => new RegExp(`^\\s*${key}\\s*=`).test(line));
        if (index < 0) {
            section.push(`${key} =`, ...values.map(value => `    ${value}`));
            return;
        }
        let end = index + 1;
        while (end < section.length && /^\s+\S/.test(section[end])) end++;
        const existing = new Set(section.slice(index, end).map(line => line.trim()));
        section.splice(end, 0, ...values.filter(value => !existing.has(value)).map(value => `    ${value}`));
    }
    // An explicit empty value disables PlatformIO's default startup breakpoint.
    setOption('debug_init_break', ['debug_init_break =']);
    // Let PlatformIO upload and verify the complete flash image before GDB connects.
    if (usePreload) setOption('debug_load_cmds', ['debug_load_cmds = preload']);
    setOption('debug_extra_cmds', ['debug_extra_cmds =', ...commands.map(command => `    ${command}`)]);
    // Keep custom debug definitions, then make our source-stepping mode the
    // final compiler choice. -fno-inline alone does not disable -Og tail sharing.
    const debugIndex = section.findIndex(line => /^\s*debug_build_flags\s*=/.test(line));
    let debugFlags = [...inheritedDebugFlags];
    if (debugIndex >= 0) {
        debugFlags = [section[debugIndex].replace(/^\s*debug_build_flags\s*=\s*/, '')];
        for (let index = debugIndex + 1; index < section.length && /^\s+\S/.test(section[index]); index++)
            debugFlags.push(section[index].trim());
    }
    const sourceDebugFlags = ['-O0', '-g3', '-ggdb3'];
    debugFlags = debugFlags.map(flag => flag.trim()).filter(flag => flag && !sourceDebugFlags.includes(flag));
    setOption('debug_build_flags', ['debug_build_flags =', ...debugFlags.map(flag => `    ${flag}`), ...sourceDebugFlags.map(flag => `    ${flag}`)]);
    ensureListOption('build_flags', [baseName && `\${env:${baseName}.build_flags}`, ...DEBUG_BUILD_FLAGS].filter(Boolean));
    lines.splice(start, end - start, ...section);
    return lines.join(text.includes('\r\n') ? '\r\n' : '\n');
}

function debuggerPath(compiler) {
    const name = path.basename(compiler || '');
    const gdb = name.replace(/(?:gcc|g\+\+|cc|c\+\+)$/, 'gdb');
    return gdb === name ? '' : path.join(path.dirname(compiler), gdb);
}

function cleanDiagnostic(text) {
    return String(text || '').replace(/(^|\n)undefined(?=\/)/g, '$1');
}

function launchHint(details) {
    if (/abstract command|abstractcs|busy to go low/i.test(details)) {
        return ' Der ESP32-C3 antwortet nicht auf USB-JTAG. Die Debugsitzung beenden, USB kurz trennen und wieder verbinden, dann erneut starten.';
    }
    if (/LIBUSB_ERROR_ACCESS|could not find or open device/i.test(details)) {
        return ' Linux verweigert den USB-JTAG-Zugriff. Eine auf 303a:1001 begrenzte udev-Regel mit TAG+="uaccess" einrichten, die Regeln neu laden und das Gerät neu verbinden; keine pauschalen MODE="0666"-Rechte vergeben.';
    }
    if (/libpython2\.7\.so\.1\.0/i.test(details)) {
        return ' Der PlatformIO-GDB ist veraltet und verlangt Python 2.7. Einen aktuellen Espressif RISC-V-GDB verwenden; Python 2.7 nicht nachinstallieren.';
    }
    return '';
}

function createHardwareCommands(vscode, output, getRoot, ensureDriver) {
    let busy = false;
    let launchDiagnostics;
    const sessions = new Map();
    const isHardwareSession = session => session.type === 'platformio-debug'
        || session.configuration?.type === 'platformio-debug'
        || (session.configuration?.projectEnvName && !session.configuration?.mcbProcessId);
    const sessionStarted = session => { if (isHardwareSession(session)) sessions.set(session.id, session); };
    if (vscode.debug.activeDebugSession) sessionStarted(vscode.debug.activeDebugSession);

    async function checkFirmwareAvailable(root, environment) {
        const file = path.join(root, '.pio', 'build', environment, 'firmware.elf');
        if (process.platform !== 'win32' || !fs.existsSync(file)) return;
        await new Promise((resolve, reject) => {
            childProcess.execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
                'try { $f = [IO.File]::Open($env:MCB_FIRMWARE_PATH, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::None); $f.Dispose() } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }'],
            { windowsHide: true, timeout: 10000, env: { ...process.env, MCB_FIRMWARE_PATH: file } }, error => {
                if (error) reject(new Error(`Die Firmware-Datei ist noch gesperrt oder nicht zugänglich: ${file}. Bitte die Hardware-Debugsitzung auch in anderen VS-Code-Fenstern beenden (Umschalt+F5) und erneut versuchen. Bleibt die Sperre bestehen, das zugehörige VS-Code-Fenster schließen. Der Build wurde nicht gestartet.`));
                else resolve();
            });
        });
    }

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

    function probeDebugger(executable) {
        return new Promise((resolve, reject) => childProcess.execFile(executable, ['--version'],
            { windowsHide: true, timeout: 10000 }, (error, stdout, stderr) => {
                if (!error) return resolve();
                error.details = cleanDiagnostic([stdout, stderr, error.message].filter(Boolean).join('\n')).trim();
                reject(error);
            }));
    }

    async function checkDebugger(root, compiler) {
        if (process.platform === 'win32') return '';
        const bundled = debuggerPath(compiler);
        if (!bundled || !fs.existsSync(bundled)) return '';
        try {
            await probeDebugger(bundled);
            return '';
        } catch (error) {
            const details = error.details || error.message;
            if (!/libpython2\.7\.so\.1\.0/i.test(details)) {
                throw new Error(`Hardware-Debugger ist nicht lauffähig.${details ? `\n${details}` : ''}${launchHint(details)}`);
            }
            const automatic = vscode.workspace.getConfiguration('mcbDigitalTwin').get('autoInstallGdb', true);
            if (!automatic) {
                throw new Error(`Hardware-Debugger ist nicht lauffähig.\n${details}${launchHint(details)}`);
            }
            output.appendLine('Veralteter Python-2.7-GDB erkannt. PlatformIO richtet automatisch einen aktuellen Espressif-RISC-V-GDB ein.');
            const info = await run(root, ['system', 'info', '--json-output'], true);
            const coreDir = info?.core_dir?.value;
            if (!coreDir) throw new Error('PlatformIO hat sein Core-Verzeichnis nicht gemeldet; der aktuelle GDB konnte nicht eingerichtet werden.');
            await run(root, ['pkg', 'install', '--global', '--tool', MODERN_RISCV_GDB_PACKAGE]);
            const binDir = path.join(coreDir, 'packages', MODERN_RISCV_GDB_DIRECTORY, 'bin');
            const executable = path.join(binDir, 'riscv32-esp-elf-gdb');
            if (!fs.existsSync(executable)) {
                throw new Error(`PlatformIO hat den aktuellen GDB installiert, aber nicht unter ${executable} bereitgestellt.`);
            }
            try {
                await probeDebugger(executable);
            } catch (modernError) {
                const modernDetails = modernError.details || modernError.message;
                throw new Error(`Der automatisch installierte Espressif-RISC-V-GDB ist nicht lauffähig.${modernDetails ? `\n${modernDetails}` : ''}`);
            }
            output.appendLine(`Aktueller Espressif-RISC-V-GDB ist einsatzbereit: ${executable}`);
            return binDir;
        }
    }

    function configureDebugger(iniPath, environment, binDir, inheritedScripts) {
        const text = fs.readFileSync(iniPath, 'utf8');
        const lines = text.split(/\r?\n/);
        const start = lines.findIndex(line => line.trim() === `[env:${environment}]`);
        let end = lines.findIndex((line, index) => index > start && /^\s*\[/.test(line));
        if (start < 0) throw new Error('Die MiniCtrlBox-Debugumgebung wurde nicht gefunden.');
        if (end < 0) end = lines.length;
        const section = lines.slice(start, end);
        function replace(key, values) {
            const index = section.findIndex(line => new RegExp(`^\\s*${key}\\s*=`).test(line));
            let count = 1;
            if (index >= 0) {
                while (index + count < section.length && /^\s+\S/.test(section[index + count])) count++;
                section.splice(index, count, ...values);
            } else section.push(...values);
        }
        const hook = `post:${path.join(__dirname, 'hardware-gdb.py').replace(/\\/g, '/')}`;
        const scripts = [].concat(inheritedScripts || []).filter(script => !/post:.*[/\\]hardware-gdb\.py$/.test(script));
        replace('extra_scripts', ['extra_scripts =', ...[...scripts, hook].map(script => `    ${script}`)]);
        replace('custom_mcb_gdb_path', [`custom_mcb_gdb_path = ${path.join(binDir, 'riscv32-esp-elf-gdb').replace(/\\/g, '/')}`]);
        lines.splice(start, end - start, ...section);
        fs.writeFileSync(iniPath, lines.join(text.includes('\r\n') ? '\r\n' : '\n'), 'utf8');
    }

    async function execute(debug) {
        if (busy) return;
        busy = true;
        try {
            output.appendLine(`\n[${new Date().toISOString()}] ${debug ? 'Übertragen und debuggen' : 'Programm übertragen'}`);
            if (!vscode.workspace.isTrusted) throw new Error('Hardwarezugriff benötigt einen vertrauenswürdigen Projektordner.');
            if (sessions.size || (vscode.debug.activeDebugSession && isHardwareSession(vscode.debug.activeDebugSession))) {
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
                await checkFirmwareAvailable(root, selected.label);
                await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification,
                    title: 'MiniCtrlBox: Echte Hardware programmieren', cancellable: false },
                () => run(root, ['run', '--project-dir', root, '--environment', selected.label,
                    '--target', 'upload', '--upload-port', devices[0].port]));
                output.appendLine('Programm erfolgreich übertragen.');
                vscode.window.showInformationMessage('Anwenderprogramm wurde auf die echte MiniCtrlBox übertragen.');
                return;
            }

            await ensureDriver();
            const debugEnv = `mcb-usb-debug-${selected.label}`;
            await checkFirmwareAvailable(root, debugEnv);
            const iniPath = path.join(root, 'platformio.ini');
            const original = fs.readFileSync(iniPath, 'utf8');
            const section = `[env:${debugEnv}]`;
            let updated = original;
            let extraCommands = [].concat(selected.options.debug_extra_cmds || []);
            let loadCommands = selected.options.debug_load_cmds;
            if (original.split(/\r?\n/).some(line => line.trim() === section)) {
                const current = config.find(([name]) => name === `env:${debugEnv}`);
                const options = current && Object.fromEntries(current[1]);
                if (!options || options.debug_tool !== 'esp-builtin' || options.build_type !== 'debug'
                    || options.upload_protocol !== 'esp-builtin' || !['', 'tbreak setup', 'thbreak setup'].includes(options.debug_init_break)) {
                    throw new Error(`Die vorhandene Umgebung ${debugEnv} weicht von der USB-Debugkonfiguration ab. Bitte platformio.ini prüfen.`);
                }
                extraCommands = [].concat(options.debug_extra_cmds || []);
                loadCommands = options.debug_load_cmds;
            } else {
                const eol = original.includes('\r\n') ? '\r\n' : '\n';
                const addition = ['', '; MiniCtrlBox: natives USB-JTAG-Debugging', section,
                    `extends = env:${selected.label}`, 'build_type = debug', 'build_flags =',
                    `    \${env:${selected.label}.build_flags}`, ...DEBUG_BUILD_FLAGS.map(flag => `    ${flag}`),
                    'debug_tool = esp-builtin',
                    'upload_protocol = esp-builtin', ''].join(eol);
                updated += eol + addition;
            }
            // Keep user commands; add the debug-only C3 workaround once.
            const preservedCommands = extraCommands.filter(command => command.trim() !== 'monitor riscv set_maskisr off');
            updated = updateDebugSection(updated, debugEnv, [...new Set([...preservedCommands, ...DEBUG_STARTUP_COMMANDS])], selected.label,
                [].concat(selected.options.debug_build_flags || []), loadCommands === undefined);
            if (updated !== original) fs.writeFileSync(iniPath, updated, 'utf8');
            await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification,
                title: 'MiniCtrlBox: Hardware-Debugbuild erstellen', cancellable: false },
            () => run(root, ['run', '--project-dir', root, '--environment', debugEnv]));
            const metadata = await run(root, ['project', 'metadata', '--project-dir', root,
                '--environment', debugEnv, '--json-output'], true);
            const build = metadata[debugEnv];
            if (!build?.prog_path || !build.cc_path) throw new Error('PlatformIO liefert keine Debug-Buildinformationen.');
            const debuggerBinDir = await checkDebugger(root, build.cc_path);
            if (debuggerBinDir) {
                const current = config.find(([name]) => name === `env:${debugEnv}`);
                const options = current ? Object.fromEntries(current[1]) : selected.options;
                configureDebugger(iniPath, debugEnv, debuggerBinDir, options.extra_scripts);
                const verified = await run(root, ['project', 'metadata', '--project-dir', root,
                    '--environment', debugEnv, '--json-output'], true);
                const expected = path.join(debuggerBinDir, 'riscv32-esp-elf-gdb');
                if (verified[debugEnv]?.gdb_path !== expected) {
                    throw new Error('PlatformIO hat den aktuellen GDB nicht in die Debug-Metadaten übernommen. Debugstart abgebrochen.');
                }
                output.appendLine(`PlatformIO-Debuggerpfad bestätigt: ${expected}`);
            }
            const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(root));
            launchDiagnostics = { text: '' };
            if (loadCommands === undefined || [].concat(loadCommands).join(' ') === 'preload') {
                output.appendLine('PlatformIO überträgt und prüft den vollständigen Debug-Build vor der GDB-Verbindung.');
            }
            const started = await vscode.debug.startDebugging(folder, {
                name: 'MiniCtrlBox: Echte Hardware (USB-JTAG)', type: 'platformio-debug', request: 'launch',
                cwd: root, projectEnvName: debugEnv, executable: build.prog_path,
                toolchainBinDir: path.dirname(build.cc_path), loadMode: 'always',
                internalConsoleOptions: 'openOnSessionStart',
                mcbHardwareDebug: true,
                mcbModernGdb: Boolean(debuggerBinDir),
            });
            if (!started) {
                const details = launchDiagnostics.text.trim();
                const hint = launchHint(details);
                throw new Error(`Hardware-Debugger wurde nicht gestartet.${details ? `\n${details}` : ' PlatformIO hat den Start abgebrochen. Details in der Debugkonsole prüfen.'}${hint}`);
            }
            output.appendLine('Hardware-Debugsitzung ohne automatischen Start-Haltepunkt gestartet. Bei einem anfänglichen Halt mit F5 fortsetzen.');
        } catch (error) {
            output.appendLine(error.message);
            output.show(true);
            vscode.window.showErrorMessage(error.message);
        } finally {
            busy = false;
        }
    }

    function createDebugAdapterTracker(session) {
        if (!session.configuration?.mcbHardwareDebug) return undefined;
        const diagnostics = launchDiagnostics || { text: '' };
        const stepping = createArduinoStepTracker(session, output,
            vscode.workspace.getConfiguration('mcbDigitalTwin').get('skipArduinoLoopTask', true));
        function record(text) {
            if (!text) return;
            text = cleanDiagnostic(text);
            diagnostics.text = (diagnostics.text + text + '\n').slice(-4000);
            output.appendLine(`[Hardware-Debugger] ${text.trim()}`);
        }
        return {
            onWillReceiveMessage(message) {
                if (message.type === 'request' && DIAGNOSTIC_DEBUG_REQUESTS.has(message.command)) {
                    record(`Debug-Aktion: ${message.command}`);
                }
                stepping?.onWillReceiveMessage(message);
            },
            onDidSendMessage(message) {
                stepping?.onDidSendMessage(message);
                if (message.type === 'event' && message.event === 'output') record(message.body?.output);
                if (message.type === 'event' && message.event === 'stopped') record(`Debugger angehalten: ${message.body?.reason || 'unbekannt'}`);
                if (message.type === 'event' && message.event === 'terminated') record('Debugsitzung beendet.');
                if (message.type === 'response' && message.success === false) record(message.message || message.body?.error?.format);
            },
            onError(error) { record(error.message); },
            onExit(code, signal) { stepping?.onExit(); record(`Debugadapter beendet (Code: ${code}, Signal: ${signal || 'keines'}).`); },
        };
    }

    function sessionTerminated(session) {
        sessions.delete(session.id);
    }

    return { upload: () => execute(false), debug: () => execute(true), sessionStarted, createDebugAdapterTracker,
        sessionTerminated };
}

module.exports = { cleanDiagnostic, createHardwareCommands, debuggerPath, launchHint, updateDebugSection };
