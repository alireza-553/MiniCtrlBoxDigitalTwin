# MiniCtrlBox Digital Twin für VS Code

**Zum Nachschlagen:** Das [Begriffslexikon mit Beispielen und Lernaufgaben](https://github.com/alireza-553/MiniCtrlBoxDigitalTwin/blob/main/docs/begriffe/README.md) erklärt unter anderem [Build](https://github.com/alireza-553/MiniCtrlBoxDigitalTwin/blob/main/docs/begriffe/README.md#build), [Haltepunkt](https://github.com/alireza-553/MiniCtrlBoxDigitalTwin/blob/main/docs/begriffe/README.md#haltepunkt), [USB-JTAG](https://github.com/alireza-553/MiniCtrlBoxDigitalTwin/blob/main/docs/begriffe/README.md#usb-jtag) und [Watchdog-Interrupt](https://github.com/alireza-553/MiniCtrlBoxDigitalTwin/blob/main/docs/begriffe/README.md#watchdog-interrupt).

Diese Erweiterung enthält den Python-Digitalzwilling und startet ihn für den
aktuell geöffneten MiniCtrlBox-Projektordner. Lade- und Hardwareaktionen speichern geänderte Projektdateien. Hardware-Debugging ergänzt oder aktualisiert zusätzlich eine Debug-Umgebung in `platformio.ini`.

## Benutzung

Ab **0.3.11** führt ein F10-/F11-Schritt, der am Ende von `setup()` oder `loop()` in Arduinos `loopTask()` zurückkehrt, automatisch bis zum nächsten `loop()`-Eintritt weiter. Die genaue Eingrenzung und die abschaltbare Einstellung beschreibt die [Hardware-Dokumentation](https://github.com/alireza-553/MiniCtrlBoxDigitalTwin/blob/main/docs/HARDWARE_DEBUG.md#rücksprung-in-arduino-looptask-beim-einzelschritt-ab-0311).

**Getesteter Hardware-Stand für v0.3.7:** Espressif32 `6.10.0`, RISC-V-GCC `8.4.0` (`esp-2021r2-patch5`) und Espressif-OpenOCD `0.11.0-esp32-20220706` unter Windows. Die [vollständige Referenzumgebung und ihre Testgrenzen](https://github.com/alireza-553/MiniCtrlBoxDigitalTwin/blob/main/docs/HARDWARE_DEBUG.md#getestete-toolchain-für-erweiterung-v037) stehen in der Hardware-Dokumentation.

Die Datei `mcb-digital-twin-0.3.10.vsix` über **Extensions → … → Install from
VSIX…** installieren. Unter Windows bei Bedarf die Einstellung
`mcbDigitalTwin.pythonPath` auf `python` oder den Pfad zu `python.exe` setzen.

1. Den gewünschten Projektordner in VS Code öffnen.
2. Links das MiniCtrlBox-Symbol `MiniCtrlBox Digital Twin` anklicken.
3. **Digital Twin → Projekt laden und starten** mit dem Upload-Symbol auswählen.

Die Seitenleiste trennt **Digital Twin** (Simulation auf diesem PC) und **Echte Hardware**
(MiniCtrlBox über USB). **Werkzeuge** ist anfangs eingeklappt und enthält
**Unit-Tests ausführen** und **USB-JTAG-Treiber einrichten**. Ab 0.3.12 prüfen die Unit-Tests die mitgelieferte Erweiterung und den Simulator lokal; Python muss installiert sein, Node.js wird aus VS Code verwendet. Ergebnisse und übersprungene Tests stehen in der Ausgabe. Es werden keine GitHub-Runner verwendet. [Testumfang](https://github.com/alireza-553/MiniCtrlBoxDigitalTwin/blob/main/docs/TESTS.md). Der separate Startbefehl
bleibt in der Befehlspalette verfügbar; Laden und Öffnen starten den Twin bei Bedarf selbst.

Die [Bedienungsanleitung](https://github.com/alireza-553/MiniCtrlBoxDigitalTwin/blob/main/docs/BEDIENUNG.md) erklärt alle Schaltflächen und Debug-Tasten.

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

## Echte Hardware programmieren und debuggen (ab 0.3.0)

**Echte Hardware → Programm übertragen** überträgt das geöffnete PlatformIO-Projekt auf die
MiniCtrlBox. **Echte Hardware → Hardware debuggen** baut und überträgt einen Debug-Build,
verbindet PlatformIO über natives USB-JTAG und hält in `setup()`.
Beide Aktionen ersetzen die Firmware auf dem angeschlossenen Board.

Voraussetzungen: PlatformIO IDE, ein Arduino-Projekt mit `board = esp32-c3-devkitm-1`,
genau eine direkt über natives USB angeschlossene MiniCtrlBox (C3 ab Revision 0.3)
und ein funktionierender JTAG-Treiber. Ein USB-UART-Wandler genügt nicht.
Den seriellen Monitor vorher schließen.

Beim Debuggen wird eine eigene Umgebung `mcb-usb-debug-<Projektumgebung>` an
`platformio.ini` angehängt. Sie erbt die bestehende Umgebung und setzt `build_type = debug`,
`debug_tool = esp-builtin`, `upload_protocol = esp-builtin`, `debug_init_break = thbreak setup`.
Abweichende vorhandene Umgebungen werden nicht überschrieben.
F9/F10/F11/F5 und Umschalt+F5 dienen zur üblichen VS-Code-Debugsteuerung.

Ab **0.3.11** setzt die generierte Hardware-Debugumgebung außerdem `debug_build_flags` mit abschließendem **`-O0 -g3 -ggdb3`**. `-O0` (großes O, Ziffer Null) schaltet die meisten Compileroptimierungen ab; die `-g`-Optionen liefern Debug-Informationen. Dies verhindert den im Übungsprojekt geprüften irreführenden Sprung vom `OFF`-`break` in Zeile 87 zur Zeile 67. Einzelschritte wurden stattdessen als **87 → 89 → Aufrufer** geprüft. Die normale Uploadumgebung bleibt unverändert. Nach Änderungen den Hardware-Debugstart neu ausführen, damit neu gebaut und übertragen wird. [Optimierungsstufen und Build-Begriffe nachschlagen](https://github.com/alireza-553/MiniCtrlBoxDigitalTwin/blob/main/docs/begriffe/README.md#optimierung).

Am Haltepunkt hält die **echte CPU** an. Ausgänge behalten normalerweise ihren letzten Zustand, und das OLED zeigt den letzten Inhalt. Eigenständig laufende Peripherie kann weiterarbeiten. **F5** setzt das Programm fort, **F10** führt den nächsten Schritt aus, **F11** springt in eine Funktion. **Umschalt+F5** beendet die Sitzung; bei Bedarf das Board anschließend zurücksetzen.

Ab **0.3.4** werden laufende Hardware-Debugsitzungen auch bei einem Wechsel der ausgewählten Sitzung berücksichtigt. Unter Windows wird die vorhandene `firmware.elf` vor dem Build auf exklusiven Zugriff geprüft. Bei einer Sperre die alte Sitzung mit **Umschalt+F5** beenden, auch in anderen VS-Code-Fenstern; falls nötig das zugehörige Fenster schließen und erneut versuchen.

Bei `LIBUSB_ERROR_NOT_FOUND` die [offizielle USB-JTAG-Treiberanleitung](https://docs.espressif.com/projects/esp-idf/en/latest/esp32c3/api-guides/jtag-debugging/configure-builtin-jtag.html) prüfen.
Unter Windows wird die JTAG-Treiberzuordnung vor dem Hardware-Debugstart geprüft.
Bei Bedarf wird das feste Espressif-Paket geladen, per SHA-256 und Signatur geprüft
und mit dem Windows-Treiberwerkzeug eingerichtet. Die Administratorabfrage muss
der Nutzer selbst bestätigen. Ein korrekt eingerichteter PC benötigt keinen Download.
Manuell starten: **USB-JTAG-Treiber einrichten**. Mit
`mcbDigitalTwin.autoInstallJtagDriver = false` lässt sich die Automatik abschalten.
Linux/macOS führen keine Windows-Treiberinstallation aus. Details zur Umsetzung:
[Hardware-Debugging und Treiberautomatik](https://github.com/alireza-553/MiniCtrlBoxDigitalTwin/blob/main/docs/HARDWARE_DEBUG.md).
Ein eigener PlatformIO-Core ist über
`mcbDigitalTwin.platformioPath` einstellbar. Die Browseransicht bleibt der Simulator;
die echte Hardware wird darin nicht live gespiegelt.

## C++ debuggen (ab 0.2.0)

Ab **0.3.7** hilft **Variable suchen und überwachen** beim Finden von Variablennamen: am Haltepunkt das Suchsymbol bei **Variables** oder **Watch** anklicken, einen Namen wie `af` eingeben und `afTemperaturen` auswählen. Die Variable erscheint unter **Watch**. Der Befehl steht außerdem unter **Werkzeuge** und in der Befehlspalette. Weitere globale Variablen können ausdrücklich nachgeladen werden. Die [Bedienungsanleitung](https://github.com/alireza-553/MiniCtrlBoxDigitalTwin/blob/main/docs/BEDIENUNG.md#variablen-suchen-und-zu-watch-hinzufügen-ab-037) erklärt Ablauf und Grenzen. Die Vorschläge erscheinen in der eigenen Suchauswahl, nicht im normalen Watch-Textfeld.

Zusätzlich die Microsoft-Erweiterung **C/C++** (`ms-vscode.cpptools`) installieren.
MSVC-Builds verwenden den Visual-Studio-Debugger; bei `g++`/`clang++` wird GDB im PATH benötigt.
Im vertrauenswürdigen Projektordner Haltepunkte mit F9 setzen und **Digital Twin → Projekt debuggen**
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
ESP32-Firmwareabbild. Der Adapter unterstützt GPIO, OLED, Taster und ab 0.3.10
EEPROM (`EEPROM.h`) sowie klassische CAN-Nachrichten (`driver/twai.h`).
EEPROM wird pro Projekt im Benutzerprofil gespeichert. Bereits beim Twin-Start wird der Inhalt
bereits beim Twin-Start geladen; Speichern und Wiederherstellen funktionieren
auch ohne laufendes C++-Programm. Das CAN-Feld sendet bei
laufendem Programm an dessen C++-Eingang; die Empfangsanzeige zeigt dessen Antwort.
Die Oberfläche bietet eine CAN-ID und eine Vorschau der ersten 16 EEPROM-Bytes.
Die unterstützten API-Teilmengen und Simulationsgrenzen stehen in der Projekt-README.
Nicht unterstützte
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

[Aktuelle veröffentlichte Erweiterung herunterladen](https://github.com/alireza-553/MiniCtrlBoxDigitalTwin/releases/latest).
Die [bebilderte Projektanleitung](https://github.com/alireza-553/MiniCtrlBoxDigitalTwin#readme) erklärt Installation, Upload und Bedienung. Ein Entwicklungsbranch kann zusätzliche, noch nicht veröffentlichte Funktionen enthalten.
Nach einem Update das VS-Code-Fenster neu laden und einen bereits laufenden Twin beenden und neu starten.
