# Automatische Tests mit GitHub Actions

Der Workflow [Unit-Tests](../.github/workflows/unit-tests.yml) startet bei Pull Requests mit Ziel `main` und bei Pushes auf `main`. Nach dem Merge der Workflow-Datei lässt er sich außerdem unter **Actions → Unit-Tests → Run workflow** manuell starten. Ein neuer Commit in derselben PR ersetzt einen noch laufenden älteren Prüflauf.

| Prüfung | Umfang |
| --- | --- |
| Erweiterung unter Linux | Alle `vscode-extension/test/*.test.js` mit Node.js 24 sowie Syntaxprüfung von `extension.js`. |
| Erweiterung unter Windows | Dieselben Tests und zusätzlich die fünf PowerShell-Treiberfälle mit `MCB_WINDOWS_DRIVER_TEST=1`. Downloads, Windows-Gerätezugriff, Installation und UAC sind dabei nachgebildet; es wird kein echter Treiber installiert. |
| Simulator unter Linux | Python 3.12, vollständige `unittest`-Testsuite einschließlich selbst erzeugter nativer C++-Testprojekte. `build-essential` und GDB werden installiert und vor dem Test geprüft. |
| VSIX-Paket | Baut das Erweiterungspaket und prüft Manifest-Version sowie Archivintegrität. Es wird kein Release veröffentlicht und keine generierte VSIX eingecheckt. |

Die beiden Tests, die ein externes Übungsprojekt über `MCB_NATIVE_TEST_PROJECT` bzw. `MCB_UPLOAD_INTEGRATION_ROOT` benötigen, bleiben ohne dieses Projekt übersprungen. Die übrigen nativen Simulator-Tests erzeugen ihre eigenen C++-Projekte. Ein echter USB-JTAG-Hardwaretest ist auf den GitHub-Runnern nicht enthalten.

Die Ergebnisse stehen in der PR unter **Checks** und im Repository unter **Actions**. Ein roter Lauf zeigt im betroffenen Schritt die Fehlermeldung. Auch übersprungene Tests werden im Protokoll genannt. Der Workflow benötigt keine zusätzlichen Repository-Secrets und veröffentlicht oder merged keine Änderungen. Die verwendeten offiziellen GitHub-Actions sind auf konkrete Commitstände festgelegt.

Die Einrichtung dieser Tests erzwingt noch keine neue Merge-Regel. Die drei Prüfnamen können nach dem ersten Lauf separat als erforderliche Statusprüfungen in den Regeln für `main` ausgewählt werden.

## Lokal prüfen

```sh
node --check vscode-extension/extension.js
node --test vscode-extension/test/*.test.js
python -m unittest discover -s mcb_digital_twin -p "test_*.py" -v
python vscode-extension/build_vsix.py
```

Für die nativen Tests einen Desktop-C++-Compiler und bei GNU-/Clang-Builds GDB bereitstellen. Die Windows-PowerShell-Fälle lassen sich in PowerShell mit `$env:MCB_WINDOWS_DRIVER_TEST = '1'` vor dem Node-Testlauf aktivieren.
