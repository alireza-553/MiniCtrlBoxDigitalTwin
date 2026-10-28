# MiniCtrlBox Digital Twin für VS Code

Diese Erweiterung enthält den Python-Digitalzwilling und startet ihn für den
aktuell geöffneten MiniCtrlBox-Projektordner. Das Projekt selbst wird dabei
nicht verändert.

## Benutzung

Die Datei `mcb-digital-twin-0.2.1.vsix` über **Extensions → … → Install from
VSIX…** installieren. Unter Windows bei Bedarf die Einstellung
`mcbDigitalTwin.pythonPath` auf `python` oder den Pfad zu `python.exe` setzen.

1. Den gewünschten Projektordner in VS Code öffnen.
2. Links das MiniCtrlBox-Symbol `MiniCtrlBox Digital Twin` anklicken.
3. **Geöffnetes Projekt hochladen** mit dem Upload-Symbol auswählen.

Der Befehl speichert geänderte Dateien dieses Projekts, startet den Twin
bei Bedarf und baut/startet den originalen C++-Code aus dem geöffneten
Projektordner. In einem Workspace mit mehreren Ordnern wird das Projekt
der aktiven Datei verwendet. Das Upload-Symbol steht auch oben in der
Steuerungsansicht und unten in der Statusleiste neben „MCB Digital Twin“. Eine manuelle Pfadeingabe ist dafür nicht erforderlich.

Es muss keine Datei in das Projekt kopiert werden.

Über **Verbinden** werden Modul 1 und Modul 2 zu einer zusammengesteckten
Einheit. Mit **Modul / Ampeln** direkt über Modul 2 lässt sich dessen Ansicht
an derselben Stelle wechseln. Die Straßenansicht enthält zwei Fahrzeugampeln
und zwei Fußgängerampeln. Modul 1 bleibt dabei sichtbar.
Das OLED ist auf Modul 1 vergrößert. Ein Klick oder Enter auf dem Display
öffnet den aktuellen Inhalt zusätzlich in einer großen Leseansicht;
Schließen oder Escape kehrt zur Modulansicht zurück.
Fahrtrichtungspfeile und Haltelinien zeigen die Zuordnung der Fahrzeugampeln;
die Fußgängerampeln stehen an den beiden Überwegen.
Je eine Fahrzeug- und Fußgängerampel bilden ein zusammengehöriges Paar.
Beide Köpfe sind direkt nebeneinander an einem gemeinsamen Mast montiert.
Beim Zeigen oder Fokussieren einer Ampel werden beide Gehäuse des Paars
hervorgehoben. Die Lichtzustände werden dadurch nicht verändert.
GPIO_0/1/2 steuern die erste Fahrzeugampel, GPIO_3/4/5 die zweite.

Alle Ampeln bleiben ohne Anwenderprogramm aus. Es gibt keine manuelle
Phasensteuerung, Automatik oder anklickbaren Ausgangs-LEDs.

## C++ debuggen (ab 0.2.1)

Zusätzlich die Microsoft-Erweiterung **C/C++** (`ms-vscode.cpptools`) installieren.
MSVC-Builds verwenden den Visual-Studio-Debugger; bei `g++`/`clang++` wird GDB im PATH benötigt.
Im vertrauenswürdigen Projektordner Haltepunkte mit F9 setzen und **C++-Projekt debuggen**
in der Seitenleiste, Toolbar oder Statusleiste wählen. Der Debugger verbindet sich vor `setup()`.
Eine `launch.json` ist nicht nötig. F10: nächster Schritt, F11: hineinspringen,
F5: fortsetzen, Umschalt+F5: beenden. Variablen und Aufrufliste stehen in der VS-Code-Debugansicht.

Am Haltepunkt bleibt der Twin bedienbar und zeigt den letzten vollständigen Zustand.
Ausgänge aktualisieren sich während `delay()` und nach `setup()` bzw. dem jeweiligen `loop()`-Durchlauf.
Während einer Pause wird nur der aktuelle Eingabestand übernommen; vollständig während
der Pause gedrückte und losgelassene Taster können nicht als Ereignis ankommen.
Es gibt im Debugmodus kein Zwei-Sekunden-Timeout. Debuggen beenden stoppt den Prozess
und entfernt den temporären Build. Einen bereits laufenden älteren Twin zuerst stoppen.

## C++-Anwenderprogramm ausführen

Unter **Einstellungen → Modul 1** den Projektordner mit `src/main.cpp`
angeben und **Programm starten** wählen. Ein äußerer Ordner mit genau einem
solchen Unterprojekt wird ebenfalls erkannt. Der aktuell in VS Code
geöffnete Ordner wird vorbelegt.

Der originale C++-Quellcode wird in einem temporären Ordner mit einem
Desktop-Hardwareadapter gebaut. Das Quellprojekt wird nicht verändert.
Voraussetzung: Visual Studio mit C++-Tools (Windows) oder `g++`/`clang++`.
Dies führt `setup()` und `loop()` als Desktop-Prozess aus; es emuliert kein
ESP32-Firmwareabbild. Der Adapter unterstützt die für `Ueb_2.7.3.4`
benötigten GPIO-, OLED- und Tasterfunktionen. Nicht unterstützte
Bibliotheksaufrufe führen zu einem sichtbaren Buildfehler.

Für `Ueb_2.7.3.4` startet nur die erste Fahrzeugampel rot. Der linke Taster
an Modul 1 schaltet sie aus/ein, der rechte wechselt ihre Phase. Die zweite
Fahrzeugampel und beide Fußgängerampeln bleiben unprogrammiert und dunkel.
**Programm stoppen** löscht alle angezeigten Ausgänge. **Trennen** trennt
Modul 2; das Anwenderprogramm auf Modul 1 läuft weiter.

## Befehle

- `MiniCtrlBox: Digital Twin starten`
- `MiniCtrlBox: Geöffnetes Projekt in den Digital Twin hochladen`
- `MiniCtrlBox: C++-Projekt im Digital Twin debuggen`
- `MiniCtrlBox: Digital Twin stoppen`
- `MiniCtrlBox: Digital Twin öffnen`
- `MiniCtrlBox: Digital Twin testen`

Optional kann eine Datei `mcb-digital-twin.json` Backend, Testordner und Port
überschreiben. Für die normale Nutzung wird sie nicht benötigt.

```json
{
  "port": 8765,
  "autoOpen": true
}
```

## Entwicklung

Mit `python build_vsix.py` im Erweiterungsordner das installierbare Paket
erzeugen. Der enthaltene Python-Simulator wird dabei mit eingepackt.

Den Erweiterungsordner separat in VS Code öffnen und `F5` drücken. Im
gestarteten Extension Development Host anschließend ein MiniCtrlBox-Projekt
öffnen.

## Download und Anleitung

[Version 0.1.0 herunterladen](https://github.com/alireza-553/MiniCtrlBoxDigitalTwin/releases/tag/v0.1.0).
Die [bebilderte Projektanleitung](https://github.com/alireza-553/MiniCtrlBoxDigitalTwin/tree/v0.1.0#readme) erklärt Installation, Upload und Bedienung.
Bereits installierte interne 0.4.x-Entwicklungsversionen vor der Installation von 0.1.0 deinstallieren.
