# Demonstrationen

Das gemeinsame Projekt [module-demo](module-demo) enthält beide Demonstrationen in einem Programm. Daneben gibt es die zwei Einzelprojekte. Alle verwenden MiniCtrlBoxLib 6.12.1 und lassen sich im Digital Twin oder auf dem ESP32-C3 ausführen.

## Beide Demonstrationen einmal laden

1. In VS Code den Ordner **`examples/module-demo`** öffnen und `src/main.cpp` auswählen.
2. **Digital Twin → Projekt hochladen** starten. Beide Demos sind jetzt im selben laufenden Programm enthalten; ein erneuter Upload zum Wechsel ist nicht nötig.
3. Das Programm startet im Modus **Kreuzungsmodul**. Im Twin das Kreuzungsmodul verbinden.
4. Im Twin **Beide Taster** auf der MiniCtrlBox drücken und wieder loslassen, um auf **SwitchLEDBoard** umzuschalten. Danach das SwitchLEDBoard verbinden. Das OLED nennt die aktive Demo.
5. Erneutes gemeinsames Drücken wechselt zurück. Beim Wechsel werden die Demo-Einstellungen zurückgesetzt. Die Einzelaktionen (links/rechts) werden in diesem gemeinsamen Projekt beim Loslassen ausgelöst; der gemeinsame Druck verändert keine Einzeloptionen.

Die Bedienung innerhalb einer Demo entspricht den unten beschriebenen Einzelprojekten. Beide Erweiterungen haben dieselbe I²C-Adresse, deshalb ist immer nur eine verbunden. Auf echter Hardware die MiniCtrlBox vor dem Umstecken ausschalten; nach dem Neustart beginnt das Programm wieder mit der Kreuzungsdemo. Für das SwitchLEDBoard dann einmal beide Haupttaster drücken. Nur das tatsächlich ausgewählte Modul wird im laufenden Programm bedient. Die Ampelzeiten gelten für eine Lerndemonstration.

## Start in VS Code

1. **Datei → Ordner öffnen** und genau einen Projektordner öffnen: [kreuzungsmodul](kreuzungsmodul) oder [switch-led-board](switch-led-board). Nicht den gesamten `examples`-Ordner als Anwenderprojekt auswählen.
2. `src/main.cpp` öffnen und **Digital Twin → Projekt hochladen** wählen.
3. In der Twin-Oberfläche das passende Erweiterungsmodul verbinden. Wegen der gemeinsamen I²C-Adresse kann nur eine Erweiterung gleichzeitig angeschlossen sein.
4. Für Haltepunkte **Digital Twin → Projekt debuggen** wählen, zum Beispiel in `showPhase()` oder bei `board.setLEDPort(leds)`.

Für echte Hardware: passende Erweiterung anschließen und **Echte Hardware → Programm übertragen** bzw. **Hardware debuggen** wählen. Das ersetzt die Firmware auf der MiniCtrlBox. PlatformIO lädt beim ersten Hardware-Build die in `platformio.ini` festgelegten Pakete; der Digital Twin benötigt für den C++-Desktop-Build einen lokalen C++-Compiler.

## Kreuzungsmodul

Die Demo startet mit beiden Fahrzeugrichtungen und beiden Fußgängerampeln auf Rot. Anschließend läuft eine zeitgesteuerte Folge mit Fußgängerfreigabe, Rotphasen und abwechselnder Freigabe für Ost/West und Nord/Süd. Die vollständige Runde dauert 18 Sekunden. Fußgänger erhalten nur bei beidseitig roten Fahrzeugampeln Grün; vor dem Fahrzeugstart folgt nochmals eine Rotphase.

- Linker MiniCtrlBox-Taster: zwischen Automatik und manueller Bedienung wechseln.
- Rechter MiniCtrlBox-Taster: eine Phase weiter, auch während der Automatik. Die Zeit der neuen Phase beginnt neu.
- Vier Taster am Kreuzungsmodul: die jeweils zugehörige Kontroll-LED leuchtet, solange der Taster gedrückt bleibt. Die Taster ändern die Ampelphasen nicht.
- OLED: Phase, Betriebsart und Tasterzustände.

In der Twin-Oberfläche kannst du zwischen **Platine** und **Ampeln** wechseln. Die Fahrzeugausgänge verwenden GPIO 0/1/4 für Ost/West und 5/6/7 für Nord/Süd; die Fußgängersignale liegen auf den Expanderbits 0–3, die Tasteranzeigen auf 4–7. Die Zeiten stehen in der Tabelle `phases` in `src/main.cpp`. Dies ist eine Lerndemonstration für das Modul, keine Steuerung für Straßenverkehr.

## SwitchLEDBoard

Nach dem Start gilt **Spiegeln**: Jeder der acht Kippschalter schaltet die zugehörige LED. Der rechte MiniCtrlBox-Taster schaltet zyklisch durch drei Betriebsarten:

| Betriebsart | LED-Anzeige |
| --- | --- |
| Spiegeln | LED an, wenn der zugehörige Schalter eingeschaltet ist. |
| Invertiert | LED an, wenn der zugehörige Schalter ausgeschaltet ist. |
| Lauflicht | Eine LED wandert alle 200 ms von SW1 bis SW8; die Schalter werden in diesem Modus nur angezeigt. |

Mit dem linken MiniCtrlBox-Taster frierst du die LED-Ausgabe ein und setzt sie wieder fort. Während der Pause bleiben Schalteranzeige und Moduswahl bedienbar. Das OLED zeigt Schalter- und LED-Bytes hexadezimal sowie die acht Schalterbits in der Reihenfolge **SW8 … SW1**. Bit 0 entspricht SW1/LED1, Bit 7 SW8/LED8.
