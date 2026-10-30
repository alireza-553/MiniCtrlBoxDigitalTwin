const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

function createLocalTests(vscode, output, extensionRoot) {
    let busy = false;
    async function run() {
        if (busy) { vscode.window.showInformationMessage('Die lokalen Unit-Tests laufen bereits.'); return; }
        busy = true;
        try {
            const testDirectory = path.join(extensionRoot, 'test');
            const tests = fs.readdirSync(testDirectory).filter(name => name.endsWith('.test.js')).sort()
                .map(name => path.join(testDirectory, name));
            if (!tests.length) throw new Error('Die installierte Erweiterung enthält keine JavaScript-Tests. VSIX neu installieren.');
            const pythonRoot = path.join(extensionRoot, 'python');
            const python = vscode.workspace.getConfiguration('mcbDigitalTwin').get('pythonPath', 'python3');
            const environment = { ...process.env, FORCE_COLOR: '0' };
            // Optional live integrations must never load an unrelated user project.
            delete environment.MCB_UPLOAD_INTEGRATION_ROOT;
            delete environment.MCB_NATIVE_TEST_PROJECT;
            output.clear();
            output.show(true);
            output.appendLine('Lokale Unit-Tests: Erweiterung und Simulator');
            output.appendLine('Keine GitHub-Runner und keine echte Hardware. Native C++-Tests benötigen einen Desktop-Compiler; bei GNU/Clang zusätzlich GDB.');
            const results = [];
            async function suite(title, executable, args, options) {
                output.appendLine(`\n=== ${title} ===`);
                let text = '';
                const result = await new Promise(resolve => {
                    let child;
                    let settled = false;
                    function finish(code, error) {
                        if (settled) return;
                        settled = true;
                        if (error) output.appendLine(`${title}: ${error.message}`);
                        resolve({ title, code, error });
                    }
                    try {
                        child = childProcess.spawn(executable, args, { shell: false, windowsHide: true, ...options });
                    } catch (error) { finish(null, error); return; }
                    const append = data => { const value = data.toString(); text = (text + value).slice(-1000000); output.append(value); };
                    child.stdout.on('data', append);
                    child.stderr.on('data', append);
                    child.once('error', error => finish(null, error));
                    child.once('close', (code, signal) => finish(code, signal ? new Error(`Testprozess durch ${signal} beendet.`) : undefined));
                });
                const skipped = Number(text.match(/\bskipped\s+(\d+)/)?.[1] || text.match(/\bskipped=(\d+)/)?.[1] || 0);
                results.push({ ...result, skipped });
            }
            await suite('JavaScript-Unit-Tests', process.execPath, ['--test', '--test-reporter=spec', ...tests], {
                cwd: extensionRoot,
                env: { ...environment, ELECTRON_RUN_AS_NODE: '1', MCB_WINDOWS_DRIVER_TEST: process.platform === 'win32' ? '1' : '' },
            });
            const pythonEnvironment = { ...environment, PYTHONPATH: pythonRoot };
            delete pythonEnvironment.ELECTRON_RUN_AS_NODE;
            await suite('Python-Simulator-Tests', python, ['-m', 'unittest', 'discover', '-s', path.join(pythonRoot, 'mcb_digital_twin'), '-p', 'test_*.py', '-v'], {
                cwd: pythonRoot, env: pythonEnvironment,
            });
            const skipped = results.reduce((sum, result) => sum + result.skipped, 0);
            const failed = results.filter(result => result.code !== 0 || result.error);
            output.appendLine('\n=== Ergebnis ===');
            for (const result of results) output.appendLine(`${result.title}: ${result.code === 0 && !result.error ? 'erfolgreich' : 'fehlgeschlagen'}; übersprungen: ${result.skipped}`);
            if (failed.length) {
                vscode.window.showErrorMessage(`Lokale Unit-Tests fehlgeschlagen: ${failed.map(result => result.title).join(', ')}. Details in der Ausgabe. Python ggf. über mcbDigitalTwin.pythonPath einstellen.`);
            } else {
                vscode.window.showInformationMessage(`Lokale Unit-Tests erfolgreich. Übersprungen: ${skipped}. Details in der Ausgabe.`);
            }
        } catch (error) {
            output.appendLine(`Unit-Tests: ${error.message}`);
            output.show(true);
            vscode.window.showErrorMessage(`Unit-Tests konnten nicht gestartet werden: ${error.message}`);
        } finally { busy = false; }
    }
    return { run };
}

module.exports = { createLocalTests };
