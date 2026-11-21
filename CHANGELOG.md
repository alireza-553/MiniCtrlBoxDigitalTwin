# Versionshistorie

## v0.3.24 – PlatformIO-Starttabs deaktivieren

- **Werkzeuge → PlatformIO-Starttabs deaktivieren** schaltet das automatische Öffnen von PIO Home und `platformio.ini` für den aktuellen Arbeitsbereich ab.
- Der Befehl schließt die passenden offenen Tabs. Angeheftete Tabs und ungespeicherte Änderungen bleiben erhalten.

## v0.3.23 – Debug-Firmware über den normalen USB-Upload übertragen

- **Übertragen und debuggen** nutzt für den Debug-Build den Uploadweg der normalen Projektumgebung. Erst danach verbindet sich der USB-JTAG-Debugger ohne zweiten automatischen Upload.
- Der Diagnosebericht zeigt Build, Upload und Debugger-Verbindung als getrennte Schritte.

## v0.3.22 – Hardware-Diagnosebericht

- **Übertragen und debuggen** macht sichtbar, dass der Debug-Build auf die MiniCtrlBox übertragen wird.
- **Diagnosebericht speichern** exportiert Hardwaremeldungen, Debug-Aktionen und Versionsangaben als lokale TXT-Datei.
- Schalter und LEDs des simulierten SwitchLEDBoards stehen von links nach rechts in Bitreihenfolge 7 bis 0.

## v0.3.21 – Hardware-Debugstart ohne automatischen Haltepunkt

- Die erzeugte Debugumgebung setzt `debug_init_break` leer. Beim nächsten Hardware-Debugstart werden auch bisherige automatisch erzeugte `thbreak setup`- und `tbreak setup`-Einträge abgelöst.

## v0.3.20 – Beide Haupttaster gleichzeitig bedienen

- Die Twin-Ansicht bietet direkt an der MiniCtrlBox die Schaltfläche **Beide Taster**. Gedrückt halten simuliert beide Haupttaster gleichzeitig; Loslassen gibt sie wieder frei. Maus, Touch sowie Leertaste/Enter werden unterstützt.
- Gemeinsame Zustandsänderungen werden in einem Aufruf an das C++-Programm übergeben. Einzelbetätigung und gemeinsamer Druck bleiben getrennt; Abbruch, Fokusverlust, Tabwechsel und Neustart geben gehaltene Taster frei.
- Tests prüfen die echten Browser-Ereignishandler, atomare Übergabe und einen C++-Moduswechsel bei wiederholtem gemeinsamem Drücken.

## v0.3.19 – Update-Hinweis nach jedem VS-Code-Start

- Die Updateprüfung nach dem Start wird nicht mehr durch eine erfolgreiche Prüfung innerhalb der vergangenen 24 Stunden unterdrückt. Sie läuft etwa 15 Sekunden nach jedem VS-Code-Start; im geöffneten Fenster bleibt es bei einer täglichen Prüfung.
- Fehlgeschlagene Updateprüfungen setzen keine neue 24-Stunden-Pause. Die Einstellung zum Abschalten automatischer Prüfungen wird weiterhin berücksichtigt.

## v0.3.18 – Automatische Simulator-Ports

- Jedes VS-Code-Fenster startet seinen eigenen Simulator mit einem automatisch vergebenen freien Port. Ein belegter Wunschport aus der Projektkonfiguration führt automatisch zu einem Ausweichport.
- Die tatsächlich gebundene Adresse wird für Öffnen, Laden, Neustart und Debuggen weiterverwendet und in der Ausgabe angezeigt. Fremde Simulatoren werden nicht übernommen.
- Parallele Starts innerhalb desselben Fensters werden zusammengeführt. Tests decken getrennte Simulationen und den belegten Wunschport ab.

## v0.3.17 – Stabile MiniCtrlBox-Größe und Erweiterungssymbol

- Die MiniCtrlBox behält beim Verbinden, Wechseln und Trennen der Erweiterungsmodule ihre Größe. Auf schmalen Fenstern lässt sich die verbundene Ansicht seitlich scrollen.
- Das OLED ist mittig zwischen den orangefarbenen Tastern ausgerichtet; die Kontrollleuchten liegen mit Abstand daneben.
- Eigenes MiniCtrlBox-Symbol für die Liste installierter Erweiterungen und die Detailansicht ergänzt.

## v0.3.16 – Hinweise auf neue Erweiterungsversionen

- Prüft das neueste öffentliche GitHub-Release nach dem Start und höchstens einmal täglich; eine neuere Version wird zuerst gemeldet. Keine GitHub-Anmeldung erforderlich.
- **Werkzeuge → Nach Updates suchen** prüft manuell; die automatische Prüfung lässt sich über `mcbDigitalTwin.checkForUpdates` ausschalten.
- Download und Installation erst nach Zustimmung, mit Größen- und SHA256-Prüfung. Debugsitzungen blockieren die Installation; das Fenster wird nur auf ausdrückliche Auswahl neu geladen.
- README um den Update-Ablauf ergänzt und den veralteten Hinweis auf ein privates Repository entfernt.

## v0.3.15 – Aktueller Hardware-GDB unter Linux und macOS

- Unter Linux wird der USB-JTAG-Zugriff vor dem Debugstart geprüft. Bei fehlenden Rechten öffnet die Erweiterung ein Terminal mit fester, auf `303a:1001` begrenzter udev-Regel und sudo-Passwortabfrage. Nach dem erneuten Anschließen wird der tatsächliche Gerätezugriff geprüft und der Debugstart fortgesetzt. Abbruch oder fehlgeschlagene Einrichtung stoppen den Start.

- Behebt den Linux-Debugstart, der trotz erfolgreich installiertem aktuellem GDB weiterhin den alten Python-2.7-GDB startete.
- Ein mitgeliefertes PlatformIO-Post-Skript setzt `GDB` in der generierten Debugumgebung auf den geprüften absoluten Pfad. Vor dem Start muss `gdb_path` in den neu abgefragten Metadaten diesen Pfad bestätigen.
- Der globale Prozesssuchpfad wird nicht mehr verändert. Vorhandene Projektskripte werden übernommen; die normale Projektumgebung bleibt erhalten.

- Erkennt die bekannte `libpython2.7.so.1.0`-Abhängigkeit des alten PlatformIO-GDB und installiert automatisch den separaten Espressif-RISC-V-GDB `14.2.0+20240403` über PlatformIO.
- Compiler, Arduino-Framework und normale Projektumgebung bleiben unverändert.
- Die Automatik ist mit `mcbDigitalTwin.autoInstallGdb` abschaltbar. Python 2.7 wird weiterhin weder benötigt noch installiert.

## v0.3.14 – MiniCtrlBoxLib 6.12 und SwitchLEDBoard

- Die vier Taster des Kreuzungsmoduls verwenden dieselbe orangefarbene Oberfläche und denselben Druckzustand wie die MiniCtrlBox. Auch getrennte, nicht bedienbare Taster behalten ihre Hardwarefarbe; der Verbindungsstatus bleibt separat sichtbar.
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
- Die lokale Testzusammenfassung erkennt übersprungene Python- und JavaScript-Tests auch bei farbiger ANSI-Ausgabe. Zuvor konnte Python fälschlich „übersprungen: 0“ melden.
- Farbausgabe wird für beide Testprozesse ausgeschaltet, damit im VS-Code-Ausgabefenster keine ANSI-Farbcodes erscheinen.
- Die Oberfläche empfängt geänderte Zustände über einen laufenden HTTP-Ereignisstrom statt durch Abfragen alle 250 ms. Der Server prüft Zustände im Abstand von 5 ms und überträgt nur Änderungen sowie gelegentliche Verbindungszeichen.
- Nach einem zeitgesteuerten `loop()`-Durchlauf entfällt die zusätzliche Pause von 20 ms. Leere Schleifen werden weiterhin begrenzt, damit sie den PC nicht unnötig belasten.
- GPIO- und RGB-Zustände werden zwischen Desktop-Tasks und Anzeige atomar ausgetauscht. Native und HTTP-Tests prüfen kurze Blinkphasen mit 20 ms.

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
