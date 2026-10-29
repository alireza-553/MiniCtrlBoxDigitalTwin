# Versionshistorie

## v0.3.10 – EEPROM und CAN im Desktop-Anwenderprogramm

- Der Desktop-Adapter stellt `EEPROM.h` und den klassischen Teil von `driver/twai.h` bereit.
- C++ und Browser teilen Projektnamen und CAN-Nachrichten; bei laufendem Programm zeigt CAN empfangen dessen echte Antwort statt eines automatischen Echos.
- 4096 EEPROM-Bytes werden bei `commit()` pro Projekt dauerhaft im Benutzerprofil gespeichert. Die Oberfläche zeigt die ersten 16 Bytes.
- Die CAN-ID kann in der Oberfläche eingegeben werden. Nachrichten sind auf acht Bytes begrenzt.
- Native Integrationstests prüfen Persistenz, Speichergrenzen und CAN-Nachrichten durch einen tatsächlich kompilierten C++-Prozess.

## v0.3.9 – Arduino-Framework beim Einzelschritt überspringen

- Hardware-Debugsitzungen ergänzen `skip function loopTask`, damit „Step Into“ im Anwendercode bleibt und nicht die Arduino-FreeRTOS-Hülle `loopTask(void*)` öffnet.
- Bereits vorhandene generierte Debugumgebungen erhalten die Regel beim nächsten Hardware-Debugstart genau einmal; eigene zusätzliche GDB-Befehle bleiben erhalten.
- `loopTask()` bleibt über einen ausdrücklich gesetzten Funktionshaltepunkt weiterhin untersuchbar.

## v0.3.8 – Robuster Hardware-Debugstart unter Linux

- Debug-Builds verhindern das Inlining von Anwenderfunktionen, damit Quellzeilen-Breakpoints auf ausführbare Adressen zeigen.
- GDB wird vor dem Start geprüft. Veraltete PlatformIO-Debugger mit Python-2.7-Abhängigkeit brechen kontrolliert mit einer sicheren Aktualisierungsempfehlung ab.
- Linux-USB-Zugriffsfehler nennen eine auf `303a:1001` begrenzte `uaccess`-Regel und warnen vor pauschalen `MODE="0666"`-Rechten.
- Irreführende `undefined`-Präfixe werden aus Debugadapter-Diagnosen entfernt.
- Fehlende Desktop-C++-Compiler erhalten unter Ubuntu/Debian einen konkreten Installationshinweis.

## v0.3.7 – Variablen suchen und überwachen

- Suchauswahl für lokale/statische Variablen und globale Variablen der aktuellen C++-Quelldatei; weitere Debugger-Globals lassen sich ausdrücklich laden.
- Suchsymbol bei Variables und Watch sowie ein Eintrag unter Werkzeuge und in der Befehlspalette.
- Auswahl prüft den Ausdruck am Haltepunkt und fügt ihn zu Watch hinzu. Veraltete Suchergebnisse nach Fortsetzen oder Positionswechsel werden abgewiesen.
- Unterstützung für PlatformIO und C++-Debugging im digitalen Zwilling.

## v0.3.6 – Watchdog-Interrupts bei jedem Debug-Halt bereinigen

- Die ESP32-C3-Haltbehandlung schaltet weiterhin die Watchdogs ab und löscht zusätzlich deren ausstehende Interrupts bei jedem Halt. Die bisherige einmalige Bereinigung beim Start reicht nach der Watchdog-Initialisierung des Programms nicht aus.
- Bestehende generierte Debug-Umgebungen erhalten die erweiterte Haltbehandlung beim nächsten Hardware-Debugstart.

## v0.3.5 – Diagnose beim Hardware-Debugstart

- Die Ausgabe des PlatformIO-Debugadapters erscheint zusätzlich im MiniCtrlBox-Ausgabekanal.
- Bei einem fehlgeschlagenen Debugstart werden die tatsächlichen Adapterfehler angezeigt. USB-JTAG-Fehler mit einem blockierten ESP32-C3-Kern enthalten einen Hinweis zum Beenden der Sitzung und erneuten Verbinden des USB-Kabels.
- Dies verbessert die Diagnose; ein Hardware-Timeout wird dadurch nicht automatisch behoben.

## v0.3.4 – Gesperrte Firmware beim Hardware-Debugging

- Hardware-Debugsitzungen bleiben auch bei einem Wechsel der ausgewählten Sitzung erfasst und verhindern einen parallelen Build.
- Unter Windows prüft die Erweiterung vor dem Build, ob die vorhandene `firmware.elf` exklusiv geöffnet werden kann. Bei einer Sperre nennt sie die nötigen Schritte zum Beenden der vorherigen Debugsitzung, bevor PlatformIO gestartet wird.
- Keine automatische Löschung von Builddateien oder Beendigung fremder Prozesse.

## v0.3.3 – Watchdog-Zustand bei Hardware-Debugging

- Debugstart bereinigt Watchdog-Interrupts und erlaubt Interrupts während Einzelschritten.
- Temporärer Hardware-Haltepunkt in `setup()` statt zusätzlichem Software-Haltepunkt.
- Bestehende generierte Debug-Umgebungen werden aktualisiert; eigene zusätzliche Befehle bleiben erhalten.
- Den beobachteten Interrupt-Watchdog-Abbruch mit nachfolgender „Duplicate Breakpoint“-Schleife auf echter Hardware untersucht und bis zum Halt in `loop()` wiederhergestellt.

## v0.3.2 – Übersichtliche Steuerung

- Separate aufklappbare Bereiche für Digital Twin, echte Hardware und Werkzeuge.
- Kürzere Befehle mit erklärenden Tooltips und eindeutiger Zielzuordnung.
- Tests und Treibereinrichtung unter den zunächst eingeklappten Werkzeugen.
- Redundanten Simulator-Start aus der Seitenleiste entfernt; in der Befehlspalette weiter verfügbar.

## v0.3.1 – Automatische Windows-JTAG-Treibereinrichtung

- Treiberprüfung vor dem Hardware-Debugstart und separater Einrichtungsbefehl.
- Offizielles Espressif-Paket mit fester SHA-256-Prüfsumme und Signaturprüfung.
- Zuordnung über Windows PnP Utility mit vom Nutzer bestätigter Administratorabfrage.
- Bereits korrekte Einrichtungen bleiben unverändert; die Automatik ist abschaltbar.
- Anleitung für andere PCs und technische Beschreibung des Ablaufs.

## v0.3.0 – Native USB-Hardwareanbindung

- Befehle zum Programmieren und Debuggen der echten MiniCtrlBox über PlatformIO.
- ESP32-C3 mit nativem USB-JTAG und eigener geerbter Debug-Umgebung.
- Bestehende Projektumgebungen bleiben erhalten.
- Eindeutige Geräteauswahl vor Hardwareaktionen.
- Keine automatische Änderung von USB-Treibern.

## v0.2.1 – Wartezeiten im Anwenderprogramm

- `delay()` überträgt während der Wartezeit regelmäßig den aktuellen Zustand.
- Lange Wartezeiten in `setup()` und `loop()` verursachen keinen falschen Timeout mehr.
- Zwischenzustände von Ampeln und OLED werden bereits während `setup()` sichtbar.
- Oberfläche und Stoppen bleiben während einer Wartezeit bedienbar.
- Mit dem unveränderten Projekt `Ueb_2.7.3.3` geprüft.

## v0.2.0 – C++-Debugging

- Debug-Befehl in Seitenleiste, Toolbar und Statusleiste.
- Debug-Symbole ohne Optimierung; Verbindung zum Debugger vor `setup()`.
- Visual-Studio-Debugger für MSVC und GDB-Anbindung für GNU-kompatible Builds.
- Lange Haltepunkte bei weiterhin bedienbarer Oberfläche.
- Beenden und abgebrochenes Verbinden räumen den zugehörigen Prozess auf.

## v0.1.0 – Erste Veröffentlichung

- Installierbare VS-Code-Erweiterung mit enthaltenem Python-Simulator.
- Aktives C++-Projekt über Seitenleiste, Toolbar oder Statusleiste hochladen.
- MiniCtrlBox und Kreuzungsmodul verbinden und gemeinsam anzeigen.
- Platinen- und Straßenansicht mit zwei Fahrzeug- und zwei Fußgängerampeln.
- Moduleinstellungen als Tabs und vergrößerbare OLED-Anzeige.
- Desktop-Adapter für GPIO, OLED und Taster.
- Bebilderte Installations- und Bedienungsanleitung.

Die Release-Reihe beginnt mit 0.1.0. Frühere 0.4.x-Pakete waren interne Entwicklungsstände.
