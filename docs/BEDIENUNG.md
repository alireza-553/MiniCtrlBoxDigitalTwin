# Bedienung der MiniCtrlBox-Erweiterung

Neu beim Programmieren? Das [Begriffslexikon](begriffe/README.md) erklärt die verlinkten Fachbegriffe mit Beispielen. Ein sinnvoller Einstieg ist [Quellcode → Build → Firmware](begriffe/README.md#wo-anfangen).

Die Namen in der folgenden Tabelle entsprechen den Schaltflächen der Seitenleiste. **Digital Twin**, **Echte Hardware** und **Werkzeuge** klappen ihre Einträge auf oder zu; das allein startet keine Aktion. Alle Befehle sind auch über **Strg+Umschalt+P** unter „MiniCtrlBox“ erreichbar, dort teilweise mit längeren Namen.

| Bereich / Schaltfläche | Ablauf und Ergebnis |
| --- | --- |
| Werkzeuge → **Variable suchen und überwachen** | Öffnet am Haltepunkt eine Suche nach lokalen und statischen Variablen sowie globalen Variablen aus der aktuellen Quelldatei. Eine Auswahl wird zu **Watch / Überwachung** hinzugefügt. Für weitere globale Variablen gibt es einen zusätzlichen Ladeeintrag. |
| Digital Twin → **Projekt laden und starten** | Speichert geänderte Dateien des gewählten Projekts, startet bei Bedarf den Python-[Simulator](begriffe/README.md#simulator), baut den C++-Code für den PC und startet ihn im Twin. Öffnet die Oberfläche. Benötigt Python und einen unterstützten [C++-Compiler](begriffe/README.md#compiler-linker). |
| Digital Twin → **Projekt debuggen** | Speichert und baut das Projekt mit [Debug-Informationen](begriffe/README.md#elf-bin) auf dem PC. Verbindet den [C++-Debugger](begriffe/README.md#debugger) vor der Ausführung von [`setup()`](begriffe/README.md#setup-loop). Benötigt zusätzlich Microsoft C/C++ und gegebenenfalls [GDB](begriffe/README.md#gdb-openocd). [Haltepunkte](begriffe/README.md#haltepunkt) betreffen den simulierten Programmprozess. |
| Digital Twin → **Oberfläche öffnen** | Startet den Simulator bei Bedarf und öffnet dessen Oberfläche in VS Code oder entsprechend der Einstellung im externen Browser. Lädt dabei kein neues C++-Programm. |
| Digital Twin → **Digital Twin beenden** | Beendet die zugehörige Twin-Debugsitzung und den von dieser Erweiterung gestarteten Simulator. Ein separat gestarteter Simulator wird nicht beendet. |
| Echte Hardware → **Programm übertragen** | Speichert das Projekt, prüft [PlatformIO und die Projektumgebung](begriffe/README.md#platformio) und das eindeutig erkannte USB-Gerät. Baut die ausgewählte Projektumgebung und überträgt die [Firmware](begriffe/README.md#firmware) über den erkannten [USB-COM-Port](begriffe/README.md#usb-com). **Ersetzt das bisherige Programm auf dem Board.** Startet keine Debugsitzung. |
| Echte Hardware → **Hardware debuggen** | Speichert das Projekt, prüft PlatformIO und das USB-Gerät sowie den [JTAG-Treiber](begriffe/README.md#treiber). Ergänzt oder aktualisiert die Debug-Umgebung in `platformio.ini`, baut die Debug-Firmware und startet PlatformIO mit [USB-JTAG](begriffe/README.md#usb-jtag). **Überträgt Firmware, ersetzt das bisherige Programm und startet den Controller neu.** Hält anschließend am Anfang von `setup()`. |
| Werkzeuge → **Simulator testen** | Führt die automatisierten [Python-Tests](begriffe/README.md#test) aus dem konfigurierten Testordner aus. Ergebnisse stehen unter **Ausgabe → MiniCtrlBox Digital Twin**. Benötigt Python. |
| Werkzeuge → **USB-JTAG-Treiber einrichten** | Prüft unter Windows die JTAG-Treiberzuordnung und richtet sie bei Bedarf mit dem geprüften Espressif-Paket ein. Erfordert bei Änderungen die Bestätigung der Windows-Administratorabfrage. Überträgt kein Anwenderprogramm. Unter Linux/macOS wird keine Windows-Treiberinstallation ausgeführt. |

Die Aktionen unter **Digital Twin** laufen auf dem PC. Die beiden Aktionen unter **Echte Hardware** benötigen einen vertrauenswürdigen PlatformIO-Arduino-Projektordner, PlatformIO IDE und genau eine MiniCtrlBox mit `board = esp32-c3-devkitm-1` am nativen USB-Anschluss. Den seriellen Monitor vorher schließen. Bei mehreren passenden Projektumgebungen erscheint eine Auswahl.

Seit **0.3.4** verhindern erkannte laufende Hardware-Debugsitzungen einen weiteren Hardware-Build über die Erweiterung. Unter Windows wird zusätzlich die vorhandene `firmware.elf` vor dem Build auf exklusiven Zugriff geprüft. Bei einer Sperre die vorherige Debugsitzung mit **Umschalt+F5** beenden, auch in anderen VS-Code-Fenstern. Bleibt die Datei gesperrt, das zugehörige Fenster schließen und erneut versuchen. Die Erweiterung löscht die Datei nicht automatisch.

## Verhalten während des Hardware-Debuggings

### Variablen suchen und zu Watch hinzufügen (ab 0.3.7)

1. Das Programm an einem Haltepunkt anhalten. In der **Aufrufliste** die gewünschte Funktion auswählen, zum Beispiel dein `setup()` oder `loop()`.
2. Auf das **Suchsymbol** oben bei **Variables / Variablen** oder **Watch / Überwachung** klicken. Alternativ **MiniCtrlBox → Werkzeuge → Variable suchen und überwachen** oder den gleichnamigen Befehl über **Strg+Umschalt+P** öffnen.
3. Einen Teil des Namens tippen, etwa `af`. Die Liste filtert die Vorschläge, darunter `afTemperaturen`, sofern es in dieser Quelldatei als globale Variable bekannt ist.
4. Den gewünschten Treffer mit Enter auswählen. Die Erweiterung prüft den Ausdruck am aktuellen Haltepunkt und fügt ihn zu **Watch** hinzu. Arrays und Objekte lassen sich dort aufklappen.

Globale C++-Variablen werden mit `::` eingetragen, etwa `::afTemperaturen`. Das bezeichnet ausdrücklich die globale Variable, auch wenn eine lokale Variable denselben Namen hat. Die Auswahl zeigt den Namen ohne dieses Präfix.

Die schnelle Liste verwendet die vom Debugger gelieferten lokalen/statischen Variablen und den C++-Symbolanbieter für globale Variablen der aktuellen Quelldatei. **Weitere globale Variablen laden** fragt zusätzlich die globalen Variablen des Debuggers ab, einschließlich Bibliotheks- und Framework-Variablen. Bei großen Projekten kann das länger dauern. Fehlt der C++-Symbolanbieter, bleibt dieser Ladeeintrag der Weg zu den globalen Variablen.

Die Suche arbeitet mit PlatformIO- und C++-Debugsitzungen im Twin und auf echter Hardware. Sie fügt eine eigene Suchauswahl hinzu; im normalen Watch-Textfeld werden dadurch keine automatischen Vorschläge aktiviert. Wenn du fortsetzt oder den Stack Frame wechselst, öffne die Suche erneut. Bereits überwachte Variablen können außerhalb ihres Gültigkeitsbereichs nicht mehr verfügbar sein.

### Halten und Fortsetzen

Am Haltepunkt stoppt die [**echte ESP32-C3-CPU**](begriffe/README.md#mikrocontroller-cpu); der Anwendercode wird dort nicht weiter ausgeführt. [GPIO-Ausgänge](begriffe/README.md#gpio) behalten normalerweise ihren letzten Zustand, und das [OLED](begriffe/README.md#oled-i2c) zeigt den zuletzt geschriebenen Inhalt. Bereits gestartete, eigenständig laufende Peripherie kann weiterarbeiten. Ein Debug-Halt schaltet daher nicht automatisch alle angeschlossenen Geräte aus.

Die Begriffe [Einzelschritt](begriffe/README.md#einzelschritt), [Aufrufliste](begriffe/README.md#aufrufliste) und [Task/Thread](begriffe/README.md#task-thread) helfen beim Lesen der Debugansicht. Ein Halt in `loopTask(): setup();` allein bedeutet noch keinen Absturz: Prüfe den obersten Eintrag der Aufrufliste. Steht dort der [Panic-Handler](begriffe/README.md#panic-handler), lies die Fehlermeldung in der Debugkonsole. [Watchdog-Interrupts](begriffe/README.md#watchdog-interrupt) sind eine mögliche Ursache.

| Taste | Wirkung |
| --- | --- |
| **F9** | Haltepunkt an der aktuellen Quellcodezeile setzen oder entfernen. |
| **F5** | Angehaltenes Programm bis zum nächsten Haltepunkt fortsetzen. |
| **F10** | Nächsten Programmschritt ausführen; Funktionsaufrufe werden als Ganzes ausgeführt. |
| **F11** | In einen Funktionsaufruf hineinspringen. |
| **Umschalt+F5** | Debugsitzung beenden. Das Verhalten des Boards nach dem Trennen bestimmt PlatformIO/OpenOCD; bei Bedarf das Board zurücksetzen. |

Das USB-JTAG-Debugging verändert das zeitliche Verhalten des Programms. Der Simulator zeigt die echte Hardware dabei nicht live an. Der ausführliche Ablauf steht unter [Echte MiniCtrlBox über USB debuggen](../README.md#echte-minictrlbox-über-usb-debuggen-ab-030).

Die Upload- und Debug-Symbole oben in der Steuerungsansicht und neben **MCB Digital Twin** in der Statusleiste entsprechen **Projekt laden und starten** und **Projekt debuggen** im Bereich **Digital Twin**. Der Statusleisteneintrag **MCB Digital Twin** startet den Simulator oder öffnet seine Oberfläche, wenn er bereits läuft. Der zusätzliche Befehl **Digital Twin starten** startet den Simulator. Diese Aktionen übertragen keine Firmware auf die echte MiniCtrlBox.

