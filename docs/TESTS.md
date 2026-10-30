# Unit-Tests lokal unter Werkzeuge

Ab Erweiterung **0.3.12** startet **Werkzeuge → Unit-Tests ausführen** den vollständigen lokalen Testlauf. Alternativ in der Befehlspalette **MiniCtrlBox: Unit-Tests lokal ausführen** wählen. Ergebnisse erscheinen unter **Ausgabe → MiniCtrlBox Digital Twin**. Der abschließende Hinweis nennt Erfolg bzw. Fehler und die Anzahl übersprungener Tests.

| Teil | Verhalten |
| --- | --- |
| Erweiterung | Alle mitgelieferten JavaScript-Tests laufen mit der Node-Laufzeit von VS Code. Eine separate Node.js-Installation und ein geklontes Repository sind dafür nicht nötig. |
| Windows-Treiberfälle | Die fünf PowerShell-Fälle verwenden nachgebildete Geräte-, Download-, Installations- und UAC-Aufrufe. Es wird kein echter Treiber installiert. |
| Simulator | Die mitgelieferten Python-Tests laufen mit `mcbDigitalTwin.pythonPath`. Python muss installiert sein. |
| Native C++-Tests | Erzeugen eigene temporäre Testprojekte. Benötigen einen Desktop-Compiler und bei GNU-/Clang-Debug-Builds zusätzlich GDB; fehlen Voraussetzungen, werden entsprechende Tests als übersprungen gemeldet. |

Es wird kein Anwenderprojekt geladen, keine Firmware übertragen und keine echte Hardware angesprochen. Der Testlauf benötigt keinen geöffneten Übungsordner. Die Integrationen mit externen Übungsprojekten werden bei diesem Befehl ausdrücklich nicht aktiviert. Ein zweiter Klick startet keinen parallelen Lauf. Ein Fehler der JavaScript-Suite verhindert nicht die anschließende Python-Prüfung.

**GitHub Actions ist deaktiviert.** Die bisherige Workflow-Datei wird aus dem Repository entfernt. Die lokalen Testläufe verwenden nur deinen PC und verursachen keine GitHub-Actions-Rechenkosten. Alte GitHub-Prüfprotokolle bleiben als Historie sichtbar.

Ein grüner lokaler Testlauf ersetzt keinen USB-JTAG-Test auf einer echten MiniCtrlBox. Übersprungene Tests und fehlende Voraussetzungen stehen im Ausgabeprotokoll. Bei fehlendem Python den Interpreter unter `mcbDigitalTwin.pythonPath` einstellen.

## Im Quellrepository prüfen

Mit separat installiertem Node.js und Python:

```sh
node --check vscode-extension/extension.js
node --test vscode-extension/test/*.test.js
python -m unittest discover -s mcb_digital_twin -p "test_*.py" -v
python vscode-extension/build_vsix.py
```

Die Windows-PowerShell-Fälle lassen sich im Repository mit `$env:MCB_WINDOWS_DRIVER_TEST = '1'` vor dem Node-Testlauf aktivieren. Der VS-Code-Befehl übernimmt das unter Windows automatisch.
