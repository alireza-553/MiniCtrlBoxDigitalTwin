# Versionshistorie

## v0.3.14 – MiniCtrlBoxLib 6.12 und SwitchLEDBoard

- Das Tastaturmodul besitzt den Koppelanschluss links und wird beim Verbinden zusammen mit der MiniCtrlBox in einer gemeinsamen Karte angezeigt. Ansicht und Einstellungen bleiben beim Wechsel der Erweiterung erhalten.
- Eine kompakte Verbindungsleiste ersetzt die drei großen Einzelkarten. Die Auswahl und die Einstellungsansichten nennen MiniCtrlBox, Kreuzungsmodul, SwitchLEDBoard und Tastaturmodul statt Modulnummern. Ein Klick verbindet die Erweiterung, ein erneuter Klick trennt sie.
- SwitchLEDBoard nach Hardwarefoto ausgerichtet: acht Schalter oben, acht LEDs darunter, waagerechte Beschriftung und ausschließlich der seitliche Koppelanschluss links. Die gekoppelte Ansicht berücksichtigt die breite Bauform.
- Kippschalter mit skalierbarer Metallgrafik, Unterlegscheibe, Sechskantmutter und verchromtem Hebel überarbeitet. Die beiden Stellungen kippen um denselben Drehpunkt; reduzierte Animation wird berücksichtigt.
- Modul 3 bildet das SwitchLEDBoard mit acht farbigen LEDs und acht Schaltern in der Browseroberfläche ab.
- Modul 4 stellt das 4×4-Tastaturmodul einschließlich zweier LEDs und Beeper dar.
- Der native C++-Adapter unterstützt `CPortExpRem` einschließlich Portoperationen, Interruptmaske und dem ab MiniCtrlBoxLib 6.12 gültigen `freeInterrupts()`.
- `CKeyPad` ist im Python-Modell und im nativen Adapter mit Tasten, LEDs, Beeper und Interruptfreigabe verfügbar.
- Modul 2, Modul 3 und Modul 4 schließen sich wegen ihrer gemeinsamen I²C-Adresse gegenseitig aus; Verbindungswechsel setzen die Eingänge des getrennten Moduls zurück.
- Unit- und native Integrationstests prüfen die neuen APIs, alle acht Schalter sowie die LED-Ausgabe des Anwenderprogramms.

## v0.3.13 – FreeRTOS-Tasks im Digital Twin

- Der Desktop-Adapter stellt `xTaskCreate()` und `vTaskDelay()` automatisch bereit, sodass ESP32-Übungen mit separaten FreeRTOS-Tasks ohne projektspezifischen Simulationscode gebaut werden.
- Desktop-Tasks laufen als C++-Threads; `vTaskDelay()` wartet nur im aufrufenden Task. Auf echter Hardware bleiben die FreeRTOS-Funktionen des Arduino-ESP32-Frameworks unverändert.
- Ein nativer Integrationstest kompiliert und startet ein unverändertes Task-Beispiel und prüft den LED-Zustandswechsel im Digital Twin.

## v0.3.12 – Unit-Tests lokal unter Werkzeuge

- Gesamter lokaler Testlauf für Erweiterung und Simulator über **Werkzeuge → Unit-Tests ausführen**; Tests werden im VSIX mitgeliefert. Keine separate Node.js-Installation nötig.
- Ausgabe und Ergebnis nennen auch übersprungene Tests; doppelte Starts werden verhindert und fehlendes Python gemeldet.
- GitHub-Testworkflow deaktiviert und Workflow-Datei entfernt, damit keine weiteren GitHub-Actions-Läufe entstehen.

## v0.3.11 – Nach Einzelschritten aus Arduino loopTask zurückkehren

- Hardware-Debug-Build mit abschließendem `-O0 -g3 -ggdb3`: Der konkrete irreführende Zeilensprung im `OFF`-Zweig von `CAmpel::setPhase()` wurde auf echter Hardware beseitigt; geprüft wurde Zeile 87 → 89 → Aufrufer in Zeile 58. Eigene Debug-Definitionen bleiben erhalten, die normale Uploadumgebung unverändert.
- Interruptmaskierung auf `steponly` umstellen und ältere generierte `off`-Befehle ersetzen: Im Hardwarevergleich erreichte F11 am Nutzerhaltepunkt `ampel.nextPhase()` damit direkt beim ersten Druck statt nach einem erneuten Halt an derselben Adresse.
- Die Rückkehrbehandlung erkennt PlatformIO-Namen wie `loopTask(void*)@0x42001b9c` einschließlich Adresszusatz. Tests prüfen das tatsächliche Adapterformat, Namen ohne Adresszusatz und ähnlich benannte Funktionen.
- Nach F10/F11 am Ende von `setup()` oder `loop()` führt ein Schritt-Halt in der Arduino-Hülle einmalig bis zum nächsten `loop()`-Eintritt weiter. `skip function loopTask` allein verhindert diesen Rücksprung nicht.
- Haltepunkte, Fehler, manuelles Anhalten, Maschinenschritte und explizites Herausspringen bleiben erhalten. Abschaltbar über `mcbDigitalTwin.skipArduinoLoopTask`.
- Temporärer Hardware-Haltepunkt statt `advance loop`: Der PlatformIO-Adapter stellt dessen Haltgrund `location-reached` sonst fälschlich als Ausnahme dar.
- Automatische Tests prüfen Zielauswahl, Abbruch und Fehlerpfade. Auf echter MiniCtrlBox mit `Ueb_2.7.3.4` wurden Rückkehr aus `setup()` und `loop()`, F10/F11 sowie das Entfernen der temporären Haltepunkte geprüft.

## v0.3.10 – EEPROM und CAN im Desktop-Anwenderprogramm

- Direkt am Statusleisteneintrag erscheint beim Darüberfahren ein anklickbares Menü mit denselben Gruppen „Digital Twin“ und „Echte Hardware“ wie in der Seitenleiste. Ein Klick auf den Eintrag öffnet die Seitenleiste; das Auswahlmenü bleibt über die Befehlspalette verfügbar.

- Die zusätzlichen RGB-Kanalfelder und Taster-Ereignisdiagnosen samt Reset-Button entfallen in den Moduleinstellungen. LEDs und Taster bleiben in der Modulansicht bedienbar bzw. sichtbar.



- Der Eintrag „Digital Twin neu starten“ steht zusätzlich in der VS-Code-Seitenleiste unter „Digital Twin“ und in der Befehlspalette bereit.

- „Twin neu starten“ setzt den Twin direkt in der Oberfläche zurück und startet das zuletzt geladene C++-Programm erneut. EEPROM und Modulverbindung bleiben erhalten; aktive Debugsitzungen müssen vorher beendet werden.

- Der projektbezogene EEPROM wird bereits beim Start des Twins geladen, bevor ein C++-Programm läuft.
- „EEPROM speichern“ schreibt den Projektnamen auch ohne laufendes Anwenderprogramm dauerhaft auf die Festplatte.
- `--project-root` bestimmt den Speicher von Anfang an; bereits gespeicherte Inhalte bleiben beim nächsten Start sofort sichtbar.
- Regressionstests prüfen unabhängige Projekte und das vollständige Beenden und Neustarten des HTTP-Backends.

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
