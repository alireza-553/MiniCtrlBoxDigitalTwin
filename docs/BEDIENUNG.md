# Bedienung der MiniCtrlBox-Erweiterung

Die Namen in der folgenden Tabelle entsprechen den Schaltflächen der Seitenleiste. **Digital Twin**, **Echte Hardware** und **Werkzeuge** klappen ihre Einträge auf oder zu; das allein startet keine Aktion. Alle Befehle sind auch über **Strg+Umschalt+P** unter „MiniCtrlBox“ erreichbar, dort teilweise mit längeren Namen.

| Bereich / Schaltfläche | Ablauf und Ergebnis |
| --- | --- |
| Digital Twin → **Projekt laden und starten** | Speichert geänderte Dateien des gewählten Projekts, startet bei Bedarf den Python-Simulator, baut den C++-Code für den PC und startet ihn im Twin. Öffnet die Oberfläche. Benötigt Python und einen unterstützten C++-Compiler. |
| Digital Twin → **Projekt debuggen** | Speichert und baut das Projekt mit Debug-Informationen auf dem PC. Verbindet den C++-Debugger vor der Ausführung von `setup()`. Benötigt zusätzlich Microsoft C/C++ und gegebenenfalls GDB. Haltepunkte betreffen den simulierten Programmprozess. |
| Digital Twin → **Oberfläche öffnen** | Startet den Simulator bei Bedarf und öffnet dessen Oberfläche in VS Code oder entsprechend der Einstellung im externen Browser. Lädt dabei kein neues C++-Programm. |
| Digital Twin → **Digital Twin beenden** | Beendet die zugehörige Twin-Debugsitzung und den von dieser Erweiterung gestarteten Simulator. Ein separat gestarteter Simulator wird nicht beendet. |
| Echte Hardware → **Programm übertragen** | Speichert das Projekt, prüft PlatformIO, die Projektumgebung und das eindeutig erkannte USB-Gerät. Baut die ausgewählte Projektumgebung und überträgt die Firmware über den erkannten USB-COM-Port. **Ersetzt das bisherige Programm auf dem Board.** Startet keine Debugsitzung. |
| Echte Hardware → **Hardware debuggen** | Speichert das Projekt, prüft PlatformIO und das USB-Gerät sowie den JTAG-Treiber. Ergänzt oder aktualisiert die Debug-Umgebung in `platformio.ini`, baut die Debug-Firmware und startet PlatformIO mit USB-JTAG. **Überträgt Firmware, ersetzt das bisherige Programm und startet den Controller neu.** Hält anschließend am Anfang von `setup()`. |
| Werkzeuge → **Simulator testen** | Führt die automatisierten Python-Tests aus dem konfigurierten Testordner aus. Ergebnisse stehen unter **Ausgabe → MiniCtrlBox Digital Twin**. Benötigt Python. |
| Werkzeuge → **USB-JTAG-Treiber einrichten** | Prüft unter Windows die JTAG-Treiberzuordnung und richtet sie bei Bedarf mit dem geprüften Espressif-Paket ein. Erfordert bei Änderungen die Bestätigung der Windows-Administratorabfrage. Überträgt kein Anwenderprogramm. Unter Linux/macOS wird keine Windows-Treiberinstallation ausgeführt. |

Die Aktionen unter **Digital Twin** laufen auf dem PC. Die beiden Aktionen unter **Echte Hardware** benötigen einen vertrauenswürdigen PlatformIO-Arduino-Projektordner, PlatformIO IDE und genau eine MiniCtrlBox mit `board = esp32-c3-devkitm-1` am nativen USB-Anschluss. Den seriellen Monitor vorher schließen. Bei mehreren passenden Projektumgebungen erscheint eine Auswahl.

Seit **0.3.4** verhindern erkannte laufende Hardware-Debugsitzungen einen weiteren Hardware-Build über die Erweiterung. Unter Windows wird zusätzlich die vorhandene `firmware.elf` vor dem Build auf exklusiven Zugriff geprüft. Bei einer Sperre die vorherige Debugsitzung mit **Umschalt+F5** beenden, auch in anderen VS-Code-Fenstern. Bleibt die Datei gesperrt, das zugehörige Fenster schließen und erneut versuchen. Die Erweiterung löscht die Datei nicht automatisch.

## Verhalten während des Hardware-Debuggings

Am Haltepunkt stoppt die **echte ESP32-C3-CPU**; der Anwendercode wird dort nicht weiter ausgeführt. GPIO-Ausgänge behalten normalerweise ihren letzten Zustand, und das OLED zeigt den zuletzt geschriebenen Inhalt. Bereits gestartete, eigenständig laufende Peripherie kann weiterarbeiten. Ein Debug-Halt schaltet daher nicht automatisch alle angeschlossenen Geräte aus.

| Taste | Wirkung |
| --- | --- |
| **F9** | Haltepunkt an der aktuellen Quellcodezeile setzen oder entfernen. |
| **F5** | Angehaltenes Programm bis zum nächsten Haltepunkt fortsetzen. |
| **F10** | Nächsten Programmschritt ausführen; Funktionsaufrufe werden als Ganzes ausgeführt. |
| **F11** | In einen Funktionsaufruf hineinspringen. |
| **Umschalt+F5** | Debugsitzung beenden. Das Verhalten des Boards nach dem Trennen bestimmt PlatformIO/OpenOCD; bei Bedarf das Board zurücksetzen. |

Das USB-JTAG-Debugging verändert das zeitliche Verhalten des Programms. Der Simulator zeigt die echte Hardware dabei nicht live an. Der ausführliche Ablauf steht unter [Echte MiniCtrlBox über USB debuggen](../README.md#echte-minictrlbox-über-usb-debuggen-ab-030).

Die Upload- und Debug-Symbole oben in der Steuerungsansicht und neben **MCB Digital Twin** in der Statusleiste entsprechen **Projekt laden und starten** und **Projekt debuggen** im Bereich **Digital Twin**. Der Statusleisteneintrag **MCB Digital Twin** startet den Simulator oder öffnet seine Oberfläche, wenn er bereits läuft. Der zusätzliche Befehl **Digital Twin starten** startet den Simulator. Diese Aktionen übertragen keine Firmware auf die echte MiniCtrlBox.

