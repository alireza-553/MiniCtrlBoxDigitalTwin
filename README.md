# MiniCtrlBox Digital Twin

> **Mit KI-Unterstützung entwickelt:** Dieses Projekt wurde mit Hilfe von künstlicher Intelligenz (OpenAI Codex) entwickelt und dokumentiert.

MiniCtrlBox-Projekte direkt aus VS Code in einem digitalen Zwilling ausführen: mit OLED, Tastern und gekoppeltem Kreuzungsmodul. Der originale C++-Quellcode steuert die simulierten Ausgänge.

**[Version v0.1.0 herunterladen](https://github.com/alireza-553/MiniCtrlBoxDigitalTwin/releases/tag/v0.1.0)** · **[VSIX direkt herunterladen](https://github.com/alireza-553/MiniCtrlBoxDigitalTwin/releases/download/v0.1.0/mcb-digital-twin-0.1.0.vsix)**

Das Repository ist privat: Zum Download mit einem GitHub-Konto mit Zugriff anmelden. Die Erweiterung steht unter **Releases → Assets**, nicht unter Packages. „Source code“ ist der Quellcode und nicht die installierbare Erweiterung.

## Vorschau

### MiniCtrlBox und Kreuzungsmodul

![Digitaler Zwilling mit MiniCtrlBox und verbundenem Kreuzungsmodul](docs/images/modules.png)

Modul 1 und Modul 2 koppeln über ihre seitlichen Steckverbinder zu einer gemeinsamen Ansicht. Einstellungen liegen als Tab direkt im Modul. OLED und Taster gehören zu Modul 1. Das Bild zeigt das laufende Übungsprogramm.

### Ampelansicht

![Straßenansicht mit zwei Fahrzeugampeln und zwei Fußgängerampeln](docs/images/traffic.png)

Mit **Modul / Ampeln** oben rechts an Modul 2 zwischen Platine und Straßenansicht wechseln. Je eine Fahrzeug- und Fußgängerampel bilden ein Paar am gemeinsamen Mast. Beide Ansichten zeigen dieselben Programmausgänge. Ohne laufendes Anwenderprogramm bleiben alle Ampeln aus, wie in dieser Vorschau.

## Voraussetzungen

- VS Code ab **1.85**.
- Python 3, erreichbar über `python` oder `python3`. Zusätzliche Python-Pakete sind nicht erforderlich.
- Für C++-Projekte: **Visual Studio C++-Buildtools** unter Windows oder `g++`/`clang++`.
- Ein MiniCtrlBox-Projekt mit `src/main.cpp`, das die vom Desktop-Adapter unterstützten Hardwarefunktionen verwendet.

Eine physische MiniCtrlBox ist nicht erforderlich. Der Python-Simulator ist in der Erweiterung enthalten; das Repository muss zur Benutzung nicht geklont werden.

## Erweiterung installieren

![Installation: VSIX herunterladen, Erweiterungsansicht öffnen, aus VSIX installieren und Projekt öffnen](docs/images/install.svg)

1. Die [Release-Seite v0.1.0](https://github.com/alireza-553/MiniCtrlBoxDigitalTwin/releases/tag/v0.1.0) öffnen und unter **Assets** die Datei **`mcb-digital-twin-0.1.0.vsix`** herunterladen.
2. In VS Code mit **Strg+Umschalt+X** die Erweiterungsansicht öffnen.
3. Oben im Menü **… → Install from VSIX… / Aus VSIX installieren…** auswählen.
4. Die heruntergeladene VSIX-Datei auswählen. Falls VS Code dazu auffordert, das Fenster neu laden.
5. Über **Datei → Ordner öffnen…** deinen MiniCtrlBox-Projektordner öffnen.

Alternativ im Terminal:

```powershell
code --install-extension .\mcb-digital-twin-0.1.0.vsix
```

Unter Windows in den VS-Code-Einstellungen nach **`mcbDigitalTwin.pythonPath`** suchen und bei Bedarf `python` oder den vollständigen Pfad zur `python.exe` eintragen. Mit `python --version` im Terminal die Installation prüfen.

Falls bereits eine interne Entwicklungsversion `0.4.x` installiert ist, diese zuerst deinstallieren und anschließend `0.1.0` installieren. Mit `0.1.0` beginnt die neue Release-Reihe; frühere Nummern waren Entwicklungsstände.

## Projekt hochladen und benutzen

1. Den C++-Projektordner in VS Code öffnen. Bei mehreren Workspace-Ordnern eine Datei des gewünschten Projekts aktivieren.
2. Links das **MiniCtrlBox-Symbol** öffnen und **Geöffnetes Projekt hochladen** wählen. Alternativ das **Upload-Symbol unten neben „MCB Digital Twin“** oder oben in der Steuerungsansicht anklicken.
3. Die Erweiterung speichert geänderte Dateien dieses Projekts, startet den Simulator, baut den C++-Code und startet das Anwenderprogramm. Die Oberfläche öffnet sich in VS Code.
4. In der Oberfläche **Verbinden** wählen, um das Kreuzungsmodul an die MiniCtrlBox zu koppeln. Modul 2 benötigt diese Verbindung.
5. Über **Modul / Ampeln** die Darstellung von Modul 2 wechseln. Lichtzustände kommen ausschließlich aus deinem Programm.
6. Das **OLED anklicken** oder mit Enter öffnen, um den Inhalt groß zu lesen. Mit **Schließen** oder Escape zurückkehren.
7. Unter **Einstellungen → Modul 1** den Projektpfad ansehen und das **Programm starten / stoppen**. **Digital Twin stoppen** in der Erweiterung beendet den von ihr gestarteten Simulator.

Die orangefarbenen Taster sind Programmeingänge. Ihre Wirkung hängt vom C++-Programm ab. Es gibt keine manuelle Ampel-Phasensteuerung.

### Beispiel: Ueb_2.7.3.4

Mit dem geprüften Übungsprogramm startet die erste Fahrzeugampel rot. Der linke Taster an Modul 1 schaltet sie aus/ein, der rechte wechselt die Phase. Die zweite Fahrzeugampel und beide Fußgängerampeln bleiben dunkel, solange das Programm sie nicht ansteuert.

## Befehle und Einstellungen

Alle Befehle sind über **Strg+Umschalt+P** unter „MiniCtrlBox“ erreichbar.

| Aktion | Wirkung |
| --- | --- |
| Digital Twin starten | Startet den Simulator für den geöffneten Ordner. |
| Geöffnetes Projekt hochladen | Speichert, baut und startet das aktive C++-Projekt im Twin. |
| Digital Twin öffnen | öffnet die Oberfläche. |
| Digital Twin testen | Führt die Simulator-Tests aus. |
| Digital Twin stoppen | Beendet den von der Erweiterung gestarteten Simulator. |

| VS-Code-Einstellung | Standard | Zweck |
| --- | --- | --- |
| `mcbDigitalTwin.pythonPath` | `python3` | Python-Befehl oder vollständiger Interpreterpfad. |
| `mcbDigitalTwin.openInsideVSCode` | `true` | Oberfläche innerhalb von VS Code öffnen. |

Optional im Anwenderprojekt eine `mcb-digital-twin.json` anlegen, etwa für einen anderen Port:

```json
{
  "port": 8765,
  "autoOpen": true
}
```

Für die normale Nutzung ist diese Datei nicht erforderlich.

## Wenn etwas nicht funktioniert

| Problem | Lösung |
| --- | --- |
| Python wird nicht gefunden | `mcbDigitalTwin.pythonPath` auf den funktionierenden Python-Befehl oder Interpreterpfad setzen. |
| C++-Compiler fehlt | Visual Studio C++-Buildtools oder `g++`/`clang++` installieren. Details unter **Ausgabe → MiniCtrlBox Digital Twin** prüfen. |
| Kein Anwenderprojekt gefunden | Ordner mit `src/main.cpp` öffnen. Ein äußerer Ordner mit genau einem solchen Unterprojekt wird ebenfalls erkannt. |
| Ampeln bleiben dunkel | Programmstatus prüfen und Modul 2 verbinden. Nur programmierte Ausgänge leuchten. |
| Oberfläche öffnet sich nicht | Bei Standardport `http://127.0.0.1:8765` im Browser öffnen; Ausgabe auf Startfehler prüfen. |

Der Desktop-Adapter führt `setup()` und `loop()` als Prozess auf deinem Rechner aus. Er emuliert kein ESP32-Firmwareabbild. Unterstützt sind die für die geprüfte Übung benötigten GPIO-, OLED- und Tasterfunktionen. Andere Hardwarebibliotheken können Buildfehler verursachen.

## Entwicklung

| Ordner | Inhalt |
| --- | --- |
| `mcb_digital_twin/` | Zentraler Python-Simulator und Tests. |
| `vscode-extension/` | Erweiterung einschließlich mitgeliefertem Simulator. |
| `docs/images/` | Vorschaubilder und Installationsgrafik. |

Simulator ohne Erweiterung starten:

```bash
python mcb_digital_twin/web_app.py
```

Danach `http://127.0.0.1:8765` öffnen.

Prüfen und das Paket bauen:

```bash
node --check vscode-extension/extension.js
node vscode-extension/test/upload.test.js
python -m unittest discover -s mcb_digital_twin -p "test_*.py"
python vscode-extension/build_vsix.py
```

Ergebnis: `vscode-extension/mcb-digital-twin-0.1.0.vsix`. Versionshistorie: [CHANGELOG.md](CHANGELOG.md).
