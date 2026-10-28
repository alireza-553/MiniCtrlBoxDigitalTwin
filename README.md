# MiniCtrlBox Digital Twin

Dieser Ordner enthält die projektübergreifenden Werkzeuge für MiniCtrlBox-Projekte.

- `mcb_digital_twin/`: Python-Simulator und automatisierte Tests
- `vscode-extension/`: VS-Code-Erweiterung und installierbare VSIX-Datei

Ein MiniCtrlBox-Projekt verbindet sich über seine Datei
`mcb-digital-twin.json` mit dem zentralen Simulator.

## Simulator direkt starten

```bash
python mcb_digital_twin/web_app.py
```

Danach `http://127.0.0.1:8765` öffnen.

## Erweiterung installieren

In VS Code **Extensions → … → Install from VSIX…** wählen und diese Datei
auswählen:

`vscode-extension/mcb-digital-twin-0.4.7.vsix`

Danach den Projektordner öffnen und links das MiniCtrlBox-Symbol auswählen.
Unter Windows bei Bedarf in den VS-Code-Einstellungen
`mcbDigitalTwin.pythonPath` auf `python` oder den vollständigen Pfad zu
`python.exe` setzen.

Links **Geöffnetes Projekt hochladen** mit dem Upload-Symbol auswählen.
Der geöffnete C++-Projektordner wird automatisch in den Twin geladen.
Alternativ kann unter **Einstellungen → Modul 1** ein Projektordner
angegeben werden. Erst die Ausgaben dieses Programms schalten
die Ampeln. Der Ansichtswechsel **Modul / Ampeln** liegt direkt an Modul 2.
Für den Desktop-Adapter sind Visual Studio C++-Tools oder `g++`/`clang++`
erforderlich; der Originalquellcode bleibt unverändert.

## Erweiterung neu erzeugen

Im Projektordner ausführen (Python 3 erforderlich, keine Zusatzpakete):

```bash
python vscode-extension/build_vsix.py
```
