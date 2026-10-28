# Hardware-Debugging und Treiberautomatik

## Aufbau

| Datei | Aufgabe |
| --- | --- |
| `vscode-extension/extension.js` | Registriert die VS-Code-Befehle und bindet die Hardwarefunktionen ein. |
| `vscode-extension/hardware.js` | Erkennt PlatformIO-Projekt und USB-Gerät, ergänzt die Debug-Umgebung, baut und startet den PlatformIO-Debugadapter. |
| `vscode-extension/jtag-driver.js` | Startet unter Windows die Treiberprüfung bzw. Einrichtung und verarbeitet deren Ergebnis. |
| `vscode-extension/windows-jtag.ps1` | Prüft die JTAG-Treiberzuordnung, verifiziert das Herstellerpaket und ruft das Windows-Treiberwerkzeug auf. |

## Vom Quellprojekt zur echten Hardware

1. Das Projekt der aktiven Datei wird ausgewählt. Der Ordner muss `platformio.ini` enthalten und in VS Code vertrauenswürdig sein.
2. Geänderte Projektdateien werden gespeichert. PlatformIO liefert die aufgelösten Umgebungen einschließlich geerbter Einstellungen als JSON.
3. Unterstützte Umgebungen verwenden Arduino und `esp32-c3-devkitm-1`. Gibt es mehrere, wählt der Nutzer eine aus.
4. `platformio device list --json-output` muss genau ein natives Espressif-USB-Gerät mit VID/PID `303A:1001` erkennen.
5. Beim normalen Hardware-Upload wird die bestehende Umgebung über den eindeutig erkannten COM-Port übertragen. Dieser Befehl benötigt die JTAG-Treiberautomatik nicht.
6. Vor dem Hardware-Debugging wird unter Windows der JTAG-Treiber geprüft bzw. eingerichtet.
7. Eine eigene Umgebung `mcb-usb-debug-<Name>` wird an die Projektkonfiguration angehängt. Sie erbt die ursprüngliche Umgebung und setzt Debug-Build, `esp-builtin` und den initialen Haltepunkt `setup()`. Abweichende bestehende Umgebungen werden nicht überschrieben.
8. Nach dem Build liefert `platformio project metadata --json-output` die ELF-Datei und den Compilerpfad. Daraus entsteht eine VS-Code-Konfiguration vom Typ `platformio-debug` mit `loadMode: always`.
9. PlatformIO/OpenOCD übertragen die Firmware und übernehmen die Debugsitzung. Haltepunkte, Variablen, Einzelschritte und Fortsetzen gehören zum echten ESP32-Programm.

Der Python-Simulator wird für diese Hardwarebefehle nicht gestartet. Eine Live-Synchronisierung der Browseransicht mit dem Board ist nicht Bestandteil der Anbindung.

## Windows-Treiberprüfung

Die JTAG-Schnittstelle ist `USB\VID_303A&PID_1001&MI_02`. Die serielle Schnittstelle `MI_00` ist ein getrenntes Gerät. Die Prüfung verlangt genau eine vorhandene JTAG-Schnittstelle mit Status `OK`, dem Dienst `WinUSB` und der Espressif-Geräteschnittstellen-GUID `{80869ad8-c37f-476a-a6b4-ae241c30a473}`.

Eine passende Zuordnung führt zu keiner Installation und keiner Administratorabfrage. Andernfalls richtet der Hardware-Debugbefehl den Treiber automatisch ein, sofern `mcbDigitalTwin.autoInstallJtagDriver` aktiviert ist. Der separate Befehl **USB-JTAG-Treiber einrichten** funktioniert auch bei abgeschalteter Automatik.

## Paketprüfung und Installation

- Quelle: `https://dl.espressif.com/dl/idf-driver/idf-driver-esp32-usb-jtag-2021-07-15.zip`.
- Erwartete SHA-256: `84E741DBEC5526E3152BDED421B4F06F990CD2D1D7E83B907C40E81F9DB0F30E`.
- Download und entpackte Dateien liegen im globalen Speicher der Erweiterung unter `usb-jtag-driver`, nicht im Anwenderprojekt.
- Nach der Hashprüfung wird der Treiberkatalog `USB_JTAG_debug_unit.cat` per Windows-Authenticode geprüft. Status muss `Valid` sein und der Unterzeichner Espressif Systems (Shanghai).
- Windows PnP Utility erhält ausschließlich die signierte INF-Datei für die native Espressif-JTAG-Schnittstelle mit `/add-driver … /install`. Windows prüft den Katalog und die dazugehörigen Dateien bei der Installation.
- Der Aufruf erfolgt mit `RunAs`. Der Nutzer bestätigt selbst die Windows-UAC-Abfrage. Es werden keine Windows-Signaturprüfung, Skript-Ausführungsrichtlinie oder anderen Schutzmechanismen abgeschaltet.
- Nach Abschluss wird die tatsächliche Zuordnung erneut geprüft. Abbruch oder Fehler werden gemeldet; ein bloß gestarteter Installer gilt nicht als Erfolg.

Die Einrichtung verlangt beim ersten Download Internetzugriff und bei einer notwendigen Änderung Administratorrechte. Währenddessen wird keine Firmware übertragen. Ein Hardware-Debugstart danach überträgt dagegen wie üblich die Debug-Firmware.

## Geprüfter Reparaturfall

Auf dem Entwicklungs-PC war COM5 sichtbar, und die JTAG-Schnittstelle verwendete bereits den generischen Microsoft-WinUSB-Treiber. OpenOCD meldete trotzdem `LIBUSB_ERROR_NOT_FOUND`.

Der offizielle Espressif-Helfer installierte das signierte Paket zunächst nur im Treiberspeicher. Erst die anschließende Ausführung von Windows PnP Utility mit Administratorrechten ordnete es dem Gerät zu. Danach erkannte OpenOCD den JTAG-TAP und RISC-V-Kern des ESP32-C3 und startete seinen GDB-Server. Die Automatik bildet diesen geprüften Weg nach, ohne einen zusätzlichen Hersteller-EXE-Installer auszuführen.

Die Erkennung und der Build wurden geprüft. Der Verbindungstest änderte die Firmware nicht. Ein vollständiger Haltepunkt-Test mit neu übertragener Hardware-Firmware steht noch aus. Die automatischen Tests prüfen auch Ablehnung, Abbruch und Fehlerpfade; sie simulieren den administrativen Installationsteil, statt einen funktionierenden Systemtreiber für Tests zu entfernen.

## Weitere Betriebssysteme

Linux benötigt passende USB-Zugriffsregeln. macOS benötigt normalerweise keinen zusätzlichen USB-JTAG-Treiber. Die Windows-Einrichtung wird auf diesen Systemen nicht aufgerufen. Andere USB-UART-Adapter oder JTAG-Probes sind nicht Teil dieser automatischen Einrichtung.

Quellen: [Espressif USB-JTAG und Treiber](https://docs.espressif.com/projects/esp-idf/en/latest/esp32c3/api-guides/jtag-debugging/configure-builtin-jtag.html), [PlatformIO Debug-Konfiguration](https://docs.platformio.org/en/latest/projectconf/sections/env/options/debug/index.html).
