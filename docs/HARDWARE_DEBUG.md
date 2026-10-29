# Hardware-Debugging und Treiberautomatik

Für Lernende: Die Begriffe [Firmware](begriffe/README.md#firmware), [USB-JTAG](begriffe/README.md#usb-jtag), [GDB/OpenOCD](begriffe/README.md#gdb-openocd) und [Debugadapter](begriffe/README.md#debugadapter) stehen im [Begriffslexikon](begriffe/README.md). Der Weg zum Board lautet vereinfacht: VS Code → Debugadapter → GDB → OpenOCD → ESP32-C3.

## Getestete Toolchain für Erweiterung v0.3.7

Die Hardware-Debugfunktionen der Erweiterung **v0.3.7** wurden mit der folgenden Kombination auf **Windows** und einer MiniCtrlBox mit **ESP32-C3, Revision 0.4**, über den nativen USB-Anschluss geprüft. Diese Angaben beschreiben die getestete Referenzumgebung; sie sind keine Zusage für jede mögliche Versionskombination.

| Bestandteil | Referenzversion |
| --- | --- |
| PlatformIO IDE für VS Code | `3.3.4` |
| PlatformIO Core | `6.2.0` |
| PlatformIO-Plattform `espressif32` | `6.10.0` |
| Board / Framework | `esp32-c3-devkitm-1` / Arduino |
| RISC-V-Toolchain `toolchain-riscv32-esp` | `8.4.0+2021r2-patch5` |
| GCC | `8.4.0` (`crosstool-NG esp-2021r2-patch5`) |
| GDB aus dieser Toolchain | `9.2.90.20200913-git` |
| Arduino-Framework-Paket `framework-arduinoespressif32` | `3.20017.241212+sha.dcc1105b` |
| OpenOCD-Paket `tool-openocd-esp32` | `2.1100.20220706` (OpenOCD `0.11.0-esp32-20220706`) |

Geprüft wurden Firmware-Übertragung, Halt in `setup()`, Einzelschritte im Anwendercode und die Variablensuche mit Übergabe an Watch. Das ist kein vollständiger Dauertest aller Peripheriefunktionen. Die Versionsangaben wurden anhand der lokal installierten Paketmetadaten sowie der Ausgaben von PlatformIO, GCC und GDB kontrolliert.

Für ein neues Projekt lässt sich die Plattformversion in der vorhandenen Projektumgebung ausdrücklich festlegen:

```ini
[env:esp32-c3-devkitm-1]
platform = espressif32@6.10.0
board = esp32-c3-devkitm-1
framework = arduino
```

Eigene Projektoptionen und Bibliotheken beibehalten. Diese Plattformangabe allein fixiert nicht jede Unterpaket- und Bibliotheksversion; eigene `platform_packages`-Einträge können die Werkzeuge überschreiben. Die tatsächlich aufgelösten Versionen stehen im PlatformIO-Buildprotokoll. Andere Versionen werden von der Erweiterung nicht automatisch gesperrt oder heruntergestuft.

Für Linux und macOS ist diese Kombination hier noch nicht durch einen echten Hardware-Debugtest bestätigt. Der Desktop-Compiler `g++` für den digitalen Zwilling ist außerdem vom RISC-V-Compiler für die echte MiniCtrlBox zu unterscheiden.

## Aufbau

| Datei | Aufgabe |
| --- | --- |
| `vscode-extension/extension.js` | Registriert die VS-Code-Befehle und bindet die Hardwarefunktionen ein. |
| `vscode-extension/hardware.js` | Erkennt PlatformIO-Projekt und USB-Gerät, ergänzt die Debug-Umgebung, baut und startet den PlatformIO-Debugadapter. |
| `vscode-extension/jtag-driver.js` | Startet unter Windows die Treiberprüfung bzw. Einrichtung und verarbeitet deren Ergebnis. |
| `vscode-extension/windows-jtag.ps1` | Prüft die JTAG-Treiberzuordnung, verifiziert das Herstellerpaket und ruft das Windows-Treiberwerkzeug auf. |

## Vom Quellprojekt zur echten Hardware

1. Das Projekt der aktiven Datei wird ausgewählt. Der Ordner muss `platformio.ini` enthalten und in VS Code vertrauenswürdig sein.
2. Geänderte Projektdateien werden gespeichert. [PlatformIO](begriffe/README.md#platformio) liefert die aufgelösten Umgebungen einschließlich geerbter Einstellungen als JSON.
3. Unterstützte Umgebungen verwenden Arduino und `esp32-c3-devkitm-1`. Gibt es mehrere, wählt der Nutzer eine aus.
4. `platformio device list --json-output` muss genau ein natives Espressif-USB-Gerät mit VID/PID `303A:1001` erkennen.
5. Beim normalen Hardware-Upload wird die bestehende Umgebung über den eindeutig erkannten COM-Port übertragen. Dieser Befehl benötigt die JTAG-Treiberautomatik nicht.
6. Vor dem Hardware-Debugging wird unter Windows der JTAG-Treiber geprüft bzw. eingerichtet.
7. Eine eigene Umgebung `mcb-usb-debug-<Name>` wird an die Projektkonfiguration angehängt. Sie erbt die ursprüngliche Umgebung und setzt Debug-Build, `esp-builtin` und einen temporären Hardware-Haltepunkt `setup()`. Inlining wird nur für diesen Debug-Build abgeschaltet, damit Breakpoints auf Aufrufzeilen nicht durch vollständig eingebettete Funktionen ihre ausführbare Adresse verlieren. Eine bekannte ältere generierte Umgebung mit `tbreak setup` wird auf `thbreak setup` und den neuen Debugstart aktualisiert. Abweichende bestehende Umgebungen werden nicht überschrieben; zusätzliche Befehle und Build-Flags bleiben erhalten.
8. Nach dem [Build](begriffe/README.md#build) liefert `platformio project metadata --json-output` die [ELF-Datei](begriffe/README.md#elf-bin) und den [Compilerpfad](begriffe/README.md#compiler-linker). Daraus entsteht eine VS-Code-Konfiguration vom Typ `platformio-debug` mit `loadMode: always`.
9. PlatformIO/OpenOCD übertragen die Firmware und übernehmen die Debugsitzung. Haltepunkte, Variablen, Einzelschritte und Fortsetzen gehören zum echten ESP32-Programm.

Der Python-Simulator wird für diese Hardwarebefehle nicht gestartet. Eine Live-Synchronisierung der Browseransicht mit dem Board ist nicht Bestandteil der Anbindung.

## Windows-Treiberprüfung

Die JTAG-Schnittstelle ist `USB\VID_303A&PID_1001&MI_02`. Die serielle Schnittstelle `MI_00` ist ein getrenntes Gerät. Die Prüfung verlangt genau eine vorhandene JTAG-Schnittstelle mit Status `OK`, dem Dienst `WinUSB` und der Espressif-Geräteschnittstellen-GUID `{80869ad8-c37f-476a-a6b4-ae241c30a473}`.

Eine passende Zuordnung führt zu keiner Installation und keiner Administratorabfrage. Andernfalls richtet der Hardware-Debugbefehl den Treiber automatisch ein, sofern `mcbDigitalTwin.autoInstallJtagDriver` aktiviert ist. Der separate Befehl **USB-JTAG-Treiber einrichten** funktioniert auch bei abgeschalteter Automatik.

## Paketprüfung und Installation

- Quelle: `https://dl.espressif.com/dl/idf-driver/idf-driver-esp32-usb-jtag-2021-07-15.zip`.
- Erwartete SHA-256: `84E741DBEC5526E3152BDED421B4F06F990CD2D1D7E83B907C40E81F9DB0F30E`.
- Download und entpackte Dateien liegen im globalen Speicher der Erweiterung unter `usb-jtag-driver`, nicht im Anwenderprojekt.
- Nach der [Hashprüfung](begriffe/README.md#hash-signatur) wird der Treiberkatalog `USB_JTAG_debug_unit.cat` per Windows-Authenticode auf seine digitale Signatur geprüft. Status muss `Valid` sein und der Unterzeichner Espressif Systems (Shanghai).
- Windows PnP Utility erhält ausschließlich die signierte INF-Datei für die native Espressif-JTAG-Schnittstelle mit `/add-driver … /install`. Windows prüft den Katalog und die dazugehörigen Dateien bei der Installation.
- Der Aufruf erfolgt mit `RunAs`. Der Nutzer bestätigt selbst die Windows-UAC-Abfrage. Es werden keine Windows-Signaturprüfung, Skript-Ausführungsrichtlinie oder anderen Schutzmechanismen abgeschaltet.
- Nach Abschluss wird die tatsächliche Zuordnung erneut geprüft. Abbruch oder Fehler werden gemeldet; ein bloß gestarteter Installer gilt nicht als Erfolg.

Die Einrichtung verlangt beim ersten Download Internetzugriff und bei einer notwendigen Änderung Administratorrechte. Währenddessen wird keine Firmware übertragen. Ein Hardware-Debugstart danach überträgt dagegen wie üblich die Debug-Firmware.

## Geprüfter Reparaturfall

Auf dem Entwicklungs-PC war COM5 sichtbar, und die JTAG-Schnittstelle verwendete bereits den generischen Microsoft-WinUSB-Treiber. OpenOCD meldete trotzdem `LIBUSB_ERROR_NOT_FOUND`.

Der offizielle Espressif-Helfer installierte das signierte Paket zunächst nur im Treiberspeicher. Erst die anschließende Ausführung von Windows PnP Utility mit Administratorrechten ordnete es dem Gerät zu. Danach erkannte OpenOCD den JTAG-TAP und RISC-V-Kern des ESP32-C3 und startete seinen GDB-Server. Die Automatik bildet diesen geprüften Weg nach, ohne einen zusätzlichen Hersteller-EXE-Installer auszuführen.

Dieser erste Verbindungstest änderte die Firmware nicht. In späteren Tests mit Erweiterung 0.3.6 wurden außerdem Firmware-Übertragung, Halt in `setup()` und mehrere Einzelschritte im Anwendercode geprüft (siehe unten). Die [automatischen Tests](begriffe/README.md#test) prüfen auch Ablehnung, Abbruch und Fehlerpfade; sie simulieren den administrativen Installationsteil, statt einen funktionierenden Systemtreiber für Tests zu entfernen.

## Linux: GDB und USB-Rechte

Vor dem Start führt die Erweiterung den von PlatformIO gewählten GDB mit `--version` aus. Ein alter, an `libpython2.7.so.1.0` gebundener Debugger wird dadurch vor OpenOCD erkannt. Python 2.7 soll nicht nachinstalliert werden; stattdessen ist ein aktueller Espressif-RISC-V-GDB bzw. eine aktualisierte PlatformIO-Toolchain zu verwenden. So erscheinen keine irreführenden Folgefehler des Debugadapters.

OpenOCD benötigt Lese- und Schreibzugriff auf das native USB-JTAG-Gerät `303a:1001`. Bei `LIBUSB_ERROR_ACCESS` empfiehlt die Erweiterung eine auf genau dieses Gerät begrenzte Regel für den aktiven Desktop-Benutzer:

```udev
SUBSYSTEM=="usb", ATTR{idVendor}=="303a", ATTR{idProduct}=="1001", TAG+="uaccess", ENV{ID_MM_DEVICE_IGNORE}="1", ENV{ID_MM_PORT_IGNORE}="1"
```

Die Regel gehört mit Administratorrechten nach `/etc/udev/rules.d/70-minictrlbox-esp32c3.rules`. Danach die Regeln neu laden und das Gerät neu verbinden. Pauschale Regeln mit `MODE="0666"` werden nicht empfohlen, weil sie jedem lokalen Benutzer Schreibzugriff auf alle passenden Geräte geben.

macOS benötigt normalerweise keinen zusätzlichen USB-JTAG-Treiber. Die Windows-Einrichtung wird auf Linux und macOS nicht aufgerufen. Andere USB-UART-Adapter oder JTAG-Probes sind nicht Teil dieser automatischen Einrichtung.

## Interrupt-Watchdog und „Duplicate Breakpoint“

Zum Nachschlagen: [Interrupt](begriffe/README.md#interrupt) · [Watchdog](begriffe/README.md#watchdog) · [Watchdog-Interrupt](begriffe/README.md#watchdog-interrupt) · [Panic-Handler](begriffe/README.md#panic-handler) · [Register und Bit](begriffe/README.md#register-bit). Interrupt-Watchdog ist der Name der Überwachung; Watchdog-Interrupt ist das ausgelöste Unterbrechungssignal.

Im untersuchten Fall war „Duplicate Breakpoint address: 0x42001b9c“ ein Folgefehler. GDB meldete keine normalen Haltepunkte mehr. Der ESP32 stand im Panic-Handler mit `PANIC_EXCEPTION_IWDT` und dem Grund `Interrupt wdt timeout on CPU0`; der interne Panic-Haltepunkt zielte auf `COLed::begin()`.

Ein Debugger-Reset mit deaktiviertem Debug-Watchdog, gelöschten ausstehenden Watchdog-Interrupts und `riscv set_maskisr off` stellte die Ausführung ohne Änderung der Firmware wieder her. Das Originalprogramm erreichte danach einen temporären Hardware-Haltepunkt in `loop()`. Dieser Ablauf ist als zusätzliche GDB-Konfiguration für die eigene ESP32-C3-Debugumgebung umgesetzt:

```ini
debug_init_break = thbreak setup
debug_extra_cmds =
    monitor riscv set_maskisr off
    monitor esp32c3 configure -event halted { esp32c3_wdt_disable; mww 0x6002007c 2; mww 0x6001f07c 2 }
    monitor esp32c3_wdt_disable
    monitor mww 0x6002007c 2
    monitor mww 0x6001f07c 2
```

Die beiden Register sind beim ESP32-C3 `TIMG_INT_CLR_TIMERS_REG` der Timergruppen 1 und 0; Bit 1 löscht den Watchdog-Interrupt. Die Änderung betrifft ausschließlich die Debugumgebung. Das normale Hardware-Upload verwendet weiterhin die ursprüngliche Umgebung. Watchdog-Verhalten im Debugger ist kein Test für das Watchdog-Verhalten im normalen Betrieb.

Der erste Wiederherstellungsablauf enthielt einen Reset und danach einen temporären Halt in `loop()`. Beim späteren Einzelschritttest war der Watchdog zwar abgeschaltet (`0x60020048 = 0`), aber der Interruptstatus weiterhin gesetzt (`0x60020078 = 2`). Die einmalige Bereinigung beim Start reichte nach der Initialisierung durch das Programm nicht aus.

Seit **0.3.6** ergänzt der `halted`-Ereignisbefehl deshalb OpenOCDs Watchdog-Abschaltung um das Löschen der ausstehenden Watchdog-Interrupts bei **jedem Halt**. Der Registerwert war im direkten Vergleichstest anschließend `0`. In einer frischen Sitzung mit 0.3.6 wurden Firmware-Übertragung und normale F10-Schritte in `src/main.cpp` geprüft: `setup()` (Zeile 10), `display.begin()` (11), `display.printfLine()` (12), `delay(2000)` (14), `ampel.nextPhase()` (15) und die nächste Wartezeit (16). In dieser Schrittfolge trat der Panic-Handler nicht mehr auf. Das ist kein vollständiger Dauertest aller Peripheriefunktionen; andere Panic- oder Haltepunktfehler müssen anhand ihrer eigenen Diagnose untersucht werden.

Ein [USB-JTAG-Timeout mit „busy“](begriffe/README.md#timeout), der durch physisches USB-Neuverbinden behoben wurde, war ein separater Verbindungszustand. Ein erfolgreicher Build allein belegt weder die JTAG-Verbindung noch das erfolgreiche Ausführen des Anwenderprogramms.

Siehe [OpenOCD: Interruptmaskierung beim Einzelschritt](https://openocd.org/doc/html/Architecture-and-Core-Commands.html) und [Espressif: JTAG und Watchdogs](https://docs.espressif.com/projects/esp-idf/en/release-v4.4/esp32c3/api-reference/system/wdts.html).

Quellen: [Espressif USB-JTAG und Treiber](https://docs.espressif.com/projects/esp-idf/en/latest/esp32c3/api-guides/jtag-debugging/configure-builtin-jtag.html), [PlatformIO Debug-Konfiguration](https://docs.platformio.org/en/latest/projectconf/sections/env/options/debug/index.html).
