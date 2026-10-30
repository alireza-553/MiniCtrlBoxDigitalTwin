# Begriffe zum Nachschlagen

Hier werden die Fachbegriffe aus diesem Lernprojekt erklärt. Links in den Anleitungen führen direkt zum passenden Eintrag. Jeder Eintrag verbindet die Bedeutung mit einem Beispiel aus der MiniCtrlBox.

[Zur Projektübersicht](../../README.md) · [Zur Bedienung](../BEDIENUNG.md) · [Zur technischen Hardware-Anleitung](../HARDWARE_DEBUG.md)

## Wo anfangen?

1. **Programm verstehen:** [Quellcode](#quellcode), [Variable](#variable), [Funktion](#funktion), [Klasse und Objekt](#klasse-objekt), [setup und loop](#setup-loop).
2. **Programm ausführen:** [Build](#build), [Compiler und Linker](#compiler-linker), [Firmware](#firmware), [Upload](#upload), [Simulator](#simulator).
3. **Fehler suchen:** [Debugger](#debugger), [Haltepunkt](#haltepunkt), [Einzelschritt](#einzelschritt), [Aufrufliste](#aufrufliste), [Watchdog-Interrupt](#watchdog-interrupt).

Die folgenden Gruppen sind das Inhaltsverzeichnis. Innerhalb jeder Gruppe führt ein Klick zur Erklärung.

| Thema | Begriffe |
| --- | --- |
| Programmieren | [Quellcode, C++ und Python](#quellcode) · [Variable](#variable) · [Funktion](#funktion) · [Klasse, Objekt, Methode](#klasse-objekt) · [Bibliothek und Framework](#bibliothek-framework) · [setup und loop](#setup-loop) · [delay und blockierend](#delay) |
| Bauen und Ausführen | [Build](#build) · [Compiler und Linker](#compiler-linker) · [Compileroptionen und Build-Flags](#compileroptionen) · [Optimierungsstufen -O](#optimierung) · [Debug- und Release-Build](#debug-release) · [Firmware](#firmware) · [ELF, BIN und Debug-Symbole](#elf-bin) · [Upload und Flashen](#upload) · [RAM und Flash](#ram-flash) · [Simulator und digitaler Zwilling](#simulator) |
| Fehlersuche | [Debugging und Debugger](#debugger) · [Haltepunkt](#haltepunkt) · [Hardware-Haltepunkt und thbreak](#hardware-haltepunkt) · [Einzelschritt und Fortsetzen](#einzelschritt) · [Aufrufliste und Stack Frame](#aufrufliste) · [Task und Thread](#task-thread) · [Interrupt und ISR](#interrupt) · [Watchdog](#watchdog) · [Watchdog-Interrupt](#watchdog-interrupt) · [Panic-Handler](#panic-handler) · [Timeout und busy](#timeout) · [Reset](#reset) |
| Hardware und Verbindung | [Mikrocontroller und CPU](#mikrocontroller-cpu) · [GPIO](#gpio) · [OLED und I2C](#oled-i2c) · [USB, COM-Port und serieller Monitor](#usb-com) · [USB-JTAG](#usb-jtag) · [GDB und OpenOCD](#gdb-openocd) · [Register, Adresse und Bit](#register-bit) · [Treiber und WinUSB](#treiber) |
| Werkzeuge und Projekt | [VS Code und VSIX](#vscode-vsix) · [PlatformIO und Umgebung](#platformio) · [Debugadapter und DAP](#debugadapter) · [Workspace und Vertrauen](#workspace) · [Pfad und PATH](#pfad) · [localhost und Port](#localhost-port) · [SDK und Dateiformate](#sdk-api) · [Prozess und Dateisperre](#prozess-dateisperre) · [Test](#test) · [SHA-256 und Signatur](#hash-signatur) · [Git, Branch, PR und Tag](#git-pr) |

## Programmieren

<a id="quellcode"></a>
### Quellcode, C++ und Python

Quellcode ist der von Menschen geschriebene Programmtext. In diesem Projekt steht dein **C++-Anwenderprogramm** beispielsweise in `src/main.cpp`. Es entscheidet, wann die Ampel leuchtet. **Python** ist eine andere Programmiersprache; hier ist damit der Simulator geschrieben. C++ und Python übernehmen also unterschiedliche Aufgaben im Projekt.

<a id="variable"></a>
### Variable

Eine Variable speichert einen Wert unter einem Namen, zum Beispiel `int zaehler = 0;`. `int` ist der Datentyp, `zaehler` der Name und `0` der Anfangswert. Im Debugger kannst du Werte ansehen. Eine Zuweisung wie `zaehler = 1;` verändert den Wert; `zaehler == 1` vergleicht ihn.

<a id="funktion"></a>
### Funktion und Parameter

Eine Funktion fasst Anweisungen unter einem Namen zusammen. Du führst sie durch einen Aufruf aus. In `delay(2000)` ist `delay` der Funktionsname und `2000` das übergebene Argument. Ein Parameter ist der benannte Platzhalter in der Funktionsdefinition. `void setup()` bedeutet: Die Funktion heißt `setup`, hat hier keine Parameter und liefert keinen Rückgabewert.

<a id="klasse-objekt"></a>
### Klasse, Objekt und Methode

Eine Klasse beschreibt zusammengehörige Daten und Funktionen. `CAmpel` ist im Übungsprogramm eine Klasse. `CAmpel ampel(...);` erzeugt daraus das Objekt `ampel`. Eine Funktion, die zu diesem Objekt gehört, nennt man Methode: `ampel.nextPhase()` ruft die Methode für den Phasenwechsel auf. Wie der Wechsel genau erfolgt, legt der Code von `CAmpel` fest.

<a id="bibliothek-framework"></a>
### Bibliothek und Framework

Eine Bibliothek enthält wiederverwendbaren Code. `#include <MiniCtrlBox.h>` macht die zugehörigen Deklarationen für dein Programm verfügbar. Das Arduino-Framework liefert unter anderem den Programmstart und ruft deine Funktionen `setup()` und `loop()` auf. Deshalb siehst du beim Debuggen manchmal Framework-Dateien, die du nicht selbst geschrieben hast.

<a id="setup-loop"></a>
### setup(), loop() und loopTask()

Bei einem normalen Start des Arduino-Programms wird `setup()` einmal für die Initialisierung aufgerufen. Anschließend wird `loop()` wiederholt aufgerufen. Auf dem ESP32 übernimmt dies die Framework-Funktion `loopTask()`. Die gelb markierte Zeile `setup();` in einer Framework-Datei zeigt daher einen Aufrufer deines Programms. Wähle in der [Aufrufliste](#aufrufliste) den obersten passenden Eintrag, um zu sehen, wo die CPU tatsächlich steht.

<a id="delay"></a>
### delay(), blockierend und nicht blockierend

`delay(2000)` lässt den aufrufenden Programmablauf ungefähr 2000 Millisekunden, also zwei Sekunden, warten. Er führt währenddessen die nächste Anweisung nicht aus. Das nennt man blockierend. Auf dem ESP32 können andere [Tasks](#task-thread) weiterlaufen; `delay()` hält nicht automatisch die gesamte CPU an. Nicht blockierender Code merkt sich beispielsweise einen Zeitpunkt und prüft später mit `millis()`, ob die Zeit vergangen ist. Beim Debuggen verändert die Pause zusätzlich das Zeitverhalten.

## Bauen und Ausführen

<a id="build"></a>
### Build

Ein Build erzeugt aus Quellcode und benötigten Bibliotheken ein ausführbares Programm. Er umfasst unter anderem Übersetzen und Zusammenfügen. **Build SUCCESS** bedeutet, dass das Erstellen gelungen ist. Es beweist weder, dass die Firmware schon übertragen wurde, noch dass USB-JTAG funktioniert oder das Programm fachlich richtig arbeitet.

<a id="compiler-linker"></a>
### Compiler, Linker und Toolchain

Der Compiler übersetzt Quellcode in Maschinencode. Der Linker fügt die übersetzten Teile und Bibliotheken zusammen. Die Sammlung dieser Werkzeuge heißt Toolchain. Für die echte ESP32-C3-Hardware wird eine andere Toolchain verwendet als für den C++-Prozess auf deinem PC. Ein fehlender Funktionsname beim Linken ist deshalb ein anderer Fehler als eine unterbrochene USB-Verbindung.

<a id="compileroptionen"></a>
### Compileroptionen, Build-Flags und Debug-Informationen

Flags sind zusätzliche Einstellungen für die Werkzeuge beim [Build](#build). Sie stehen außerhalb deines C++-Quellcodes. Ein Beispiel für GCC/G++ auf dem PC:

```sh
g++ -O0 -g3 main.cpp -o beispiel
```

Das übersetzt `main.cpp` mit den gewählten Einstellungen in das Programm `beispiel`. Es überträgt nichts auf die MiniCtrlBox. Dafür benötigt man die [RISC-V-Toolchain](#compiler-linker) und einen anschließenden [Upload](#upload).

| Option | Bedeutung |
| --- | --- |
| `-O0` | Großes **O** und Ziffer **0**: die meisten Optimierungen abschalten. |
| `-o beispiel` | Kleines **o**: Name der Ausgabedatei. `-o0` würde eine Datei namens `0` wählen und ist keine Optimierungsstufe. |
| `-g`, `-g2` | Übliche Debug-Informationen, etwa Funktionsnamen, Variablen und Quellzeilen, erzeugen. |
| `-g3` | Zusätzlich Informationen wie Makrodefinitionen aufnehmen. Die 3 bezeichnet die Informationsstufe, nicht die Optimierung. |
| `-ggdb3` | Umfangreiche Debug-Informationen passend zu GDB erzeugen. Es ist keine zweite Optimierungsstufe. |
| `-DDEBUG_CHECK=1` | Einen Präprozessor-Makrowert vorgeben, den der Quellcode abfragen kann. |
| `-Iinclude` | Einen zusätzlichen Suchordner für Header angeben. |
| `-fno-inline` | Das Einbetten von Funktionskörpern am Aufrufort einschränken. Das allein schaltet andere Optimierungen nicht ab. |

`-g3` und `-ggdb3` sind in unserer Debugkonfiguration gemeinsam enthalten; sie bedeuten nicht zwei verschiedene Programmabläufe. Debug-Informationen stehen in der [ELF-Datei](#elf-bin) und sind nicht gleichbedeutend mit zusätzlichem Programmcode im Flash. [GCC 8.4: Debug-Optionen](https://gcc.gnu.org/onlinedocs/gcc-8.4.0/gcc/Debugging-Options.html).

In `platformio.ini` gelten `build_flags` allgemein für die jeweilige Umgebung. `debug_build_flags` steuert zusätzliche Debug-Build-Einstellungen; PlatformIO verwendet dafür normalerweise `-Og -g2 -ggdb2`. Unsere erzeugte Hardware-Debugumgebung setzt ab 0.3.11 abschließend `-O0 -g3 -ggdb3`. Bereits vorhandene eigene Debug-Definitionen bleiben erhalten. Eine geänderte Einstellung wirkt erst nach erneutem Bauen und Übertragen auf der Hardware. [PlatformIO: Debug-Build-Flags](https://docs.platformio.org/en/latest/projectconf/sections/env/options/debug/debug_build_flags.html).

<a id="optimierung"></a>
### Compileroptimierung und die verschiedenen -O-Stufen

Optimierung formt den erzeugten Maschinencode um, beispielsweise für geringere Laufzeit oder weniger Speicherbedarf. Dadurch kann die Anzeige im Debugger vom Zeilenablauf des Quelltextes abweichen. Die folgenden Angaben beziehen sich auf GCC; die Wirkung hängt auch von Version, Zielprozessor und Programm ab.

| Stufe | Ziel und mögliche Auswirkung |
| --- | --- |
| `-O0` | Die meisten Optimierungen aus. Für unsere Lernschritte meist nachvollziehbarer; Programmcode kann größer oder langsamer sein. |
| `-Og` | Kompromiss für Debugging und Optimierung. GCC empfiehlt diese Stufe allgemein für den Entwicklungszyklus; im untersuchten `switch` war die Zeilenanzeige trotzdem verwirrend. |
| `-O` / `-O1` | Grundlegende Optimierungen für Laufzeit und Codegröße. |
| `-O2` | Mehr Optimierungen; im Debugger können Werte oder Zeilenschritte schwerer nachvollziehbar werden. |
| `-O3` | Weitere Optimierungen, etwa für Schleifen. Nicht für jedes Programm schneller oder kleiner als `-O2`. |
| `-Os` | Schwerpunkt auf kleinerem Programmcode; kann bei begrenztem Flash sinnvoll sein. |
| `-Ofast` | Zusätzliche, teils nicht streng standardkonforme Optimierungen, etwa für Gleitkommarechnungen. Ergebnisse können sich dadurch verändern. |
| `-Oz` | In neueren GCC-Versionen noch stärker auf Codegröße ausgerichtet. Gehört nicht zum hier getesteten GCC 8.4; dort nicht ungeprüft verwenden. |

Bei mehreren `-O`-Angaben gilt in GCC die letzte. Deshalb steht unser `-O0` am Ende der Debug-Flags. Die Stufen sind Ziele und keine garantierten Geschwindigkeitswerte. Siehe [GCC 8.4: Optimierungsstufen](https://gcc.gnu.org/onlinedocs/gcc-8.4.0/gcc/Optimize-Options.html) und [aktuelle GCC-Optionen einschließlich -Oz](https://gcc.gnu.org/onlinedocs/gcc/Optimize-Options.html).

**Beispiel aus der MiniCtrlBox:** Das `break` im `OFF`-Zweig von `setPhase()` sprang mit der alten `-Og`-Firmware zum gemeinsamen Funktionsende. Die Debug-Informationen ordneten diesem Ende auch Zeile 67 im `RED`-Zweig zu. Die CPU führte dessen Ampelanweisungen nicht erneut aus; die Markierung war irreführend. Mit `-O0` wurden im Hardwaretest **Zeile 87 → Zeile 89 → Aufrufer in Zeile 58** angezeigt. Auch `-O0` garantiert nicht, dass jede Quellzeile eine eigene ausführbare Adresse bekommt. [Geprüfter Ablauf](../HARDWARE_DEBUG.md#zeilenanzeige-bei-switch-und-break).

<a id="debug-release"></a>
### Debug-Build und Release-Build

Das sind unterschiedliche Build-Konfigurationen desselben Quellcodes. Ein **Debug-Build** erleichtert die Fehlersuche durch Debug-Informationen und passende Compileroptionen. Ein **Release-Build** richtet sich auf den normalen Betrieb aus, zum Beispiel auf Laufzeit und Speicherverbrauch. „Debug“ bedeutet nicht automatisch `-O0`, und „Release“ legt keine allgemeingültige `-O`-Stufe fest. Die tatsächlichen Flags sind entscheidend.

In diesem Projekt erzeugt **Hardware debuggen** eine eigene PlatformIO-Umgebung mit `build_type = debug` und den oben erklärten Debug-Flags. **Programm übertragen** verwendet die ursprünglich ausgewählte Projektumgebung; deren Einstellungen werden dadurch nicht geändert. Ein optimierter Build kann ebenfalls Debug-Informationen enthalten. Zum Abschlusstest gehört deshalb auch die tatsächlich für den normalen Betrieb verwendete Firmware, besonders wenn Zeitverhalten oder Interrupts eine Rolle spielen.

<a id="firmware"></a>
### Firmware

Firmware ist das Programm, das auf dem Mikrocontroller ausgeführt wird und seine Hardware steuert. **Programm übertragen** und **Hardware debuggen** können die bisherige Firmware auf der MiniCtrlBox ersetzen. Das Laden eines Programms in den digitalen Zwilling startet dagegen einen Prozess auf dem PC.

<a id="elf-bin"></a>
### ELF, BIN und Debug-Symbole

`firmware.elf` enthält das gebaute Programm und bei einem Debug-Build zusätzliche Informationen zur Zuordnung von Maschinenbefehlen zu Funktionen, Variablen und Quellcodezeilen. Diese Informationen heißen Debug-Symbole. `firmware.bin` ist ein daraus erzeugtes Binärabbild für die Übertragung. Je nach Projekt werden mehrere BIN-Dateien übertragen. ELF und Quellcode müssen zum Programm auf dem Board passen, sonst können die angezeigten Zeilen irreführend sein. `<optimized out>` bedeutet, dass der Debugger einen Wert aufgrund der Übersetzung beziehungsweise Optimierung nicht mehr zuverlässig anzeigen kann.

<a id="upload"></a>
### Upload und Flashen

Upload bedeutet hier Übertragen. Flashen ist das Schreiben eines Programmabbilds in den Flash-Speicher des Boards. Der Button **Projekt laden und starten** lädt in den Simulator; **Programm übertragen** schreibt auf die echte Hardware. Bei **Hardware debuggen** bewirkt `loadMode: always`, dass PlatformIO die Debug-Firmware erneut lädt.

<a id="ram-flash"></a>
### RAM und Flash

RAM ist Arbeitsspeicher, unter anderem für veränderliche Daten während der Ausführung. Sein Inhalt geht ohne Versorgung verloren. Flash speichert unter anderem Firmware auch ohne Versorgung. Die Prozentangaben im Buildprotokoll betreffen unterschiedliche Speicherbereiche. Viel freier Flash verhindert keinen Fehler durch zu wenig RAM oder einen überlaufenden Stack.

<a id="simulator"></a>
### Simulator, digitaler Zwilling und Hardwareadapter

Der digitale Zwilling bildet für dieses Lernprojekt MiniCtrlBox, Display, Taster und Ampelausgänge auf dem PC nach. Ein Desktop-Hardwareadapter setzt die unterstützten Hardwareaufrufe deines C++-Programms in simulierte Ein- und Ausgänge um. Er bildet keinen vollständigen ESP32-Chip nach. Die Oberfläche ist deshalb auch keine automatische Live-Anzeige des angeschlossenen echten Boards.

## Fehlersuche und Debugging

<a id="debugger"></a>
### Debugging und Debugger

Debugging ist das gezielte Untersuchen eines laufenden Programms. Ein Debugger kann anhalten, Variablen zeigen und schrittweise weiterlaufen. **Projekt debuggen** untersucht hier den PC-Prozess im Twin; **Hardware debuggen** untersucht das Programm auf der echten ESP32-C3-CPU. Der Build ist dafür nur die Vorbereitung.

<a id="haltepunkt"></a>
### Haltepunkt / Breakpoint

Ein Haltepunkt lässt den Debugger an einer bestimmten Stelle anhalten. Mit F9 setzt oder entfernst du ihn. Die markierte Anweisung ist normalerweise die nächste auszuführende Anweisung; sie ist nicht allein wegen der Markierung bereits ausgeführt. Ausgänge behalten häufig den vorherigen Zustand. Ein grauer oder nicht bestätigter Haltepunkt kann zum Beispiel auf fehlende Debug-Symbole oder eine nicht ausführbare Zeile hinweisen.

<a id="hardware-haltepunkt"></a>
### Hardware-Haltepunkt und thbreak

Ein Hardware-Haltepunkt nutzt die Debugfunktionen des Chips. Deren Ressourcen sind begrenzt. Der GDB-Befehl `thbreak setup` setzt einen **temporären** Hardware-Haltepunkt bei `setup()`, der nach dem ersten Treffer entfernt wird. Ein zusätzlicher dauerhaft gesetzter Haltepunkt in deinem Quellcode bleibt davon unabhängig bestehen.

<a id="einzelschritt"></a>
### Einzelschritt und Fortsetzen

**F10** führt die nächste Quellcodeanweisung aus und überspringt dabei normalerweise den Einblick in aufgerufene Funktionen. **F11** springt in einen Funktionsaufruf hinein. **F5** setzt die Ausführung bis zum nächsten Halt fort. Ein einzelner Quellcodeschritt kann viele Maschinenbefehle und eine lange Wartezeit enthalten. Wenn du auf `delay(2000)` F10 drückst, ist eine entsprechende Wartezeit zu erwarten. Framework-Code, Interrupts und Optimierungen können beeinflussen, welche Zeile als Nächstes angezeigt wird.

<a id="aufrufliste"></a>
### Aufrufliste / Call Stack und Stack Frame

Die Aufrufliste zeigt, welche Funktionen einander aufgerufen haben. Ein Eintrag heißt Stack Frame. Oben steht normalerweise die aktuelle Funktion des gewählten Threads; darunter stehen ihre Aufrufer. Beim Anklicken eines älteren Frames änderst du nur die Ansicht, nicht den Ausführungsort der CPU. Deshalb kann `loopTask(): setup();` markiert sein, während die eigentliche Ursache weiter oben im Panic-Handler liegt. Der Stack ist der Speicherbereich für unter anderem Aufrufinformationen und lokale Daten.

<a id="task-thread"></a>
### Task, Thread und FreeRTOS

Ein Task ist ein vom Betriebssystem verwalteter Programmablauf. Auf dem ESP32 verwendet Arduino FreeRTOS; neben `loopTask` gibt es beispielsweise Hintergrundaufgaben für Timer. Auf der einkernigen ESP32-C3-CPU erhalten Tasks abwechselnd Rechenzeit. Der Debugger stellt sie als Threads dar. Achte beim Einzelschritt darauf, welcher Thread und welcher Stack Frame ausgewählt sind.

<a id="interrupt"></a>
### Interrupt, IRQ und ISR

Ein Interrupt ist eine Unterbrechungsanforderung an die CPU, etwa von einem Timer. Die CPU kann dafür den normalen Programmablauf unterbrechen und eine besondere Behandlungsroutine ausführen. Diese heißt ISR, kurz für Interrupt Service Routine. IRQ bezeichnet die Anforderung. Das ist kein automatisch vom Benutzer gesetzter Haltepunkt. Eine Interruptmaske kann festlegen, welche Anforderungen gerade bearbeitet werden dürfen.

<a id="watchdog"></a>
### Watchdog / WDT

Ein Watchdog ist eine Zeitüberwachung gegen festgefahrene Abläufe. Erfolgt das erwartete Lebenszeichen nicht rechtzeitig, kann die konfigurierte Reaktion eine Fehlermeldung oder ein Reset sein. Der ESP32 unterscheidet unter anderem Interrupt-Watchdog und Task-Watchdog: Sie überwachen unterschiedliche Probleme bei Interruptverarbeitung und Task-Ausführung. [Herstellererklärung](https://docs.espressif.com/projects/esp-idf/en/release-v4.4/esp32c3/api-reference/system/wdts.html).

<a id="watchdog-interrupt"></a>
### Watchdog-Interrupt und ausstehender Interrupt

Ein Watchdog-Interrupt ist eine vom Watchdog ausgelöste Unterbrechungsanforderung. „Ausstehend“ bedeutet: Die Hardware hat sie gemeldet, sie ist noch nicht gelöscht. Das spätere Abschalten des Watchdogs entfernt eine bereits gesetzte Meldung nicht automatisch. Im untersuchten Debugfehler stand noch dieses Signal an. Die Erweiterung bereinigt es seit 0.3.6 bei jedem Halt. **Interrupt-Watchdog** bezeichnet die Überwachung; **Watchdog-Interrupt** bezeichnet deren Unterbrechungsanforderung. [Reparatur und Messwerte](../HARDWARE_DEBUG.md#interrupt-watchdog-und-duplicate-breakpoint).

<a id="panic-handler"></a>
### Panic-Handler

Der Panic-Handler ist eine Fehlerbehandlung für schwere Laufzeitfehler. Er kann Diagnoseinformationen ausgeben, das System anhalten oder einen Reset auslösen. `_panic_handler` in der Aufrufliste ist ein Hinweis, die Fehlerursache zu untersuchen. Es ist nicht automatisch ein Fehler in `setup()`, nur weil dessen Aufrufer darunter angezeigt wird. Der Watchdog ist eine mögliche Ursache, aber nicht die einzige.

<a id="timeout"></a>
### Timeout und busy

Timeout bedeutet, dass eine erwartete Antwort innerhalb einer Zeitgrenze ausbleibt. `busy` bedeutet zunächst nur „beschäftigt“. `Abstract command ... busy` beim JTAG-Zugriff beschreibt einen Zustand der Debugschnittstelle; es ist kein C++-Syntaxfehler. Im beobachteten Verbindungsfall half USB-Neuverbinden. Das ist eine andere Diagnose als der nachgewiesene ausstehende Watchdog-Interrupt beim Einzelschritt.

<a id="reset"></a>
### Reset und Neustart

Ein Reset setzt den Controller zurück und beginnt die Programmausführung erneut; dabei werden viele Laufzeitzustände neu initialisiert. Er löscht nicht automatisch die Firmware aus dem Flash. `monitor reset halt` setzt über OpenOCD zurück und hält anschließend an. Das Beenden einer Debugsitzung ist nicht dasselbe wie ein Reset und garantiert nicht, dass alle Ausgänge ausgeschaltet werden.

## Hardware und Verbindung

<a id="mikrocontroller-cpu"></a>
### Mikrocontroller, ESP32-C3 und CPU

Ein Mikrocontroller enthält Rechenkern, Speicher und Hardwarefunktionen auf einem Chip. Der ESP32-C3 ist der Mikrocontroller der hier unterstützten MiniCtrlBox. Seine CPU führt Maschinenbefehle aus und verwendet die RISC-V-Befehlssatzarchitektur. Ein CPU-Halt stoppt den Anwendercode; eigenständig laufende Peripherie kann trotzdem weiterarbeiten.

<a id="gpio"></a>
### GPIO, Eingang und Ausgang

GPIO heißt General Purpose Input/Output: ein Anschluss für digitale Ein- oder Ausgangssignale. Ein Eingang liest beispielsweise einen Taster; ein Ausgang steuert ein Signal. Die Namen `CSignal::GPIO_0` bis `GPIO_5` in diesem Lernprojekt sind Bezeichnungen der MiniCtrlBox-Bibliothek. Sie dürfen nicht ohne Prüfung mit den gleich nummerierten physischen ESP32-Chippins gleichgesetzt werden. Wie ein Taster wirkt, entscheidet dein Programm.

<a id="oled-i2c"></a>
### OLED und I2C

OLED bezeichnet hier das kleine Display der MiniCtrlBox. I2C ist eine Schnittstelle, über die unter anderem Displaybausteine mit dem Controller Daten austauschen können. `display.begin()` initialisiert in der Übung das Display; `display.printfLine(...)` schreibt Text. Nach einem CPU-Halt kann der zuletzt geschriebene Inhalt sichtbar bleiben, obwohl das Programm gerade nicht weiterläuft.

<a id="usb-com"></a>
### USB, COM-Port und serieller Monitor

USB ist die Verbindung zum PC. Ein COM-Port wie `COM5` ist unter Windows der Name eines seriellen Anschlusses. Der serielle Monitor liest oder sendet dort Text, beispielsweise Logmeldungen. Er ist kein Debugger mit Haltepunkten. Die Portnummer kann sich auf einem anderen PC ändern. Ein sichtbarer COM-Port beweist noch nicht, dass die separate JTAG-Schnittstelle funktioniert.

<a id="usb-jtag"></a>
### USB-JTAG und nativer USB-Anschluss

JTAG ermöglicht dem Debugger den Zugriff auf den Chip, zum Beispiel zum Anhalten und Lesen von Registern. Der ESP32-C3 bietet dies über seinen eingebauten USB-Serial/JTAG-Controller an. „Nativ“ bedeutet hier, dass das Kabel mit dieser USB-Funktion des ESP32 verbunden ist. Ein USB-Seriell-Wandler wie CH340 stellt allein keinen JTAG-Zugriff bereit. [Espressifs Anschlussanleitung](https://docs.espressif.com/projects/esp-idf/en/latest/esp32c3/api-guides/jtag-debugging/configure-builtin-jtag.html).

<a id="gdb-openocd"></a>
### GDB, OpenOCD und monitor

GDB ist der Debugger, der unter anderem Symbole und Haltepunkte verwaltet. OpenOCD vermittelt hier den Zugriff auf die echte Hardware über USB-JTAG. Vereinfacht: **VS Code → Debugadapter → GDB → OpenOCD → ESP32-C3**. Ein GDB-Befehl mit `monitor` wird an OpenOCD weitergegeben. Beispiele aus einer Anleitung für einen anderen Debugadapter sind nicht immer unverändert in der PlatformIO-Debugkonsole verwendbar.

<a id="register-bit"></a>
### Register, Speicheradresse, Hexadezimalzahl und Bit

Ein Hardwareregister enthält Steuer- oder Statusinformationen eines Bausteins. Der Debugger kann es über seine Adresse ansprechen. `0x` kennzeichnet eine Hexadezimalzahl, etwa `0x6002007c`. Ein Bit hat den Wert 0 oder 1. Bit 1 hat den Zahlenwert `2`, weil die Zählung bei Bit 0 beginnt. `mww 0x6002007c 2` schreibt einen 32-Bit-Wert an diese Adresse. Im hier verwendeten ESP32-C3-Register löscht dieses Schreiben den Watchdog-Interrupt. Das gilt nicht allgemein für andere Register oder Chips; viele Register haben besondere Schreibwirkungen.

## Werkzeuge und Projekt

<a id="pfad"></a>
### Pfad und PATH

Ein Dateipfad beschreibt den Ort einer Datei oder eines Ordners. `src/main.cpp` ist relativ zum Projektordner; `C:\Projekte\Uebung\src\main.cpp` ist ein vollständiger Windows-Pfad. **PATH** ist dagegen eine Umgebungsvariable mit Suchordnern für Programme. „GDB muss im PATH liegen“ bedeutet: Das Betriebssystem muss den Debugger über seinen Programmnamen finden können. Ein Dateiname mit Leerzeichen muss bei vielen Terminalbefehlen in Anführungszeichen stehen.

<a id="localhost-port"></a>
### localhost, HTTP und Port

`localhost` und die Adresse `127.0.0.1` bezeichnen den eigenen PC. Bei `http://127.0.0.1:8765` ist HTTP das verwendete Webprotokoll und `8765` der Netzwerkport des Simulators. Der Port ordnet die Verbindung einem Dienst auf dem PC zu. Er ist etwas anderes als der serielle Hardwareanschluss `COM5`. „Connection refused“ kann bedeuten, dass der Simulator noch nicht läuft oder ein anderer Port eingestellt ist.

<a id="sdk-api"></a>
### SDK, API, JSON und INI

Ein SDK ist eine Sammlung von Entwicklungswerkzeugen, Bibliotheken und Beschreibungen für eine Plattform. Eine API ist die definierte Schnittstelle, über die dein Code Funktionen einer Bibliothek oder eines Dienstes aufruft. JSON und INI sind Textformate für strukturierte Daten beziehungsweise Einstellungen: In diesem Projekt verwendet `mcb-digital-twin.json` JSON mit Schlüsseln wie `port`; `platformio.ini` verwendet INI-Abschnitte wie `[env:...]`. Die Dateiformate sind selbst keine C++-Programme.

<a id="treiber"></a>
### Treiber und WinUSB

Ein Treiber ermöglicht dem Betriebssystem den Zugriff auf ein Gerät. Für USB-JTAG muss Windows die richtige Schnittstelle der MiniCtrlBox passend zuordnen. WinUSB ist ein Windows-Treiber für USB-Gerätezugriff. In diesem Projekt wird zusätzlich die Espressif-Zuordnung geprüft. Die Treibereinrichtung betrifft den PC; sie ist kein Upload deines C++-Programms.

`VID/PID` sind Hersteller- und Produktkennung eines USB-Geräts; `MI_02` bezeichnet hier eine seiner Schnittstellen. Eine GUID ist eine eindeutige Kennung, über die Software die Geräteschnittstelle findet. Die Windows-Administratorabfrage heißt auch UAC-Abfrage: Sie fragt nach der Freigabe einer Aktion mit erhöhten Rechten, etwa der Treiberinstallation.

<a id="vscode-vsix"></a>
### VS Code, Erweiterung und VSIX

VS Code ist der Editor. Eine Erweiterung ergänzt Funktionen, hier beispielsweise die MiniCtrlBox-Schaltflächen. Eine `.vsix`-Datei ist ein installierbares Erweiterungspaket. Nach einem Update kann ein Neuladen des VS-Code-Fensters erforderlich sein, bevor der neue Erweiterungscode ausgeführt wird. Die Versionsnummer einer VSIX ist nicht die Version deiner eigenen Firmware.

<a id="platformio"></a>
### PlatformIO, platformio.ini und Umgebung

PlatformIO organisiert unter anderem Toolchain, Bibliotheken, Build, Upload und Debugging. `platformio.ini` enthält die Einstellungen. Ein Abschnitt wie `[env:esp32-c3-devkitm-1]` beschreibt eine Umgebung: eine benannte Zusammenstellung von Einstellungen. `extends` übernimmt Einstellungen einer anderen Umgebung. Die Erweiterung legt zum Debuggen `mcb-usb-debug-...` an; deine normale Umgebung bleibt separat. `debug_extra_cmds` enthält zusätzliche Debuggerbefehle. [PlatformIO-Erklärung](https://docs.platformio.org/en/latest/projectconf/sections/env/options/debug/debug_extra_cmds.html).

<a id="debugadapter"></a>
### Debugadapter und DAP

Der Debugadapter übersetzt zwischen der Debugoberfläche von VS Code und dem verwendeten Debugger. DAP heißt Debug Adapter Protocol und beschreibt diese Kommunikation. `type: platformio-debug` wählt den PlatformIO-Debugadapter aus. Ein erfolgreich gebautes Programm kann trotzdem beim anschließenden Adapterstart oder bei der Verbindung zur Hardware scheitern.

<a id="workspace"></a>
### Projektordner, Workspace und Vertrauen

Ein Projektordner enthält die zusammengehörigen Quellen und Einstellungen. Ein VS-Code-Workspace kann mehrere Ordner enthalten. Die MiniCtrlBox-Erweiterung verwendet möglichst das Projekt der aktiven Datei. „Vertrauenswürdig“ ist eine VS-Code-Freigabe für Codeausführung und Werkzeuge in diesem Ordner. Sie ist keine automatische Bestätigung, dass ein fremdes Programm richtig oder ungefährlich ist.

<a id="prozess-dateisperre"></a>
### Prozess und Dateisperre

Ein Prozess ist ein laufendes Programm auf dem PC, etwa GDB oder der Simulator. Ein Prozess kann eine Datei geöffnet halten und dadurch Änderungen verhindern. `WinError 32` bei `firmware.elf` bedeutet deshalb nicht, dass du deinen C++-Code löschen musst. Beende zuerst die zugehörige Debugsitzung, gegebenenfalls auch in einem anderen VS-Code-Fenster. Die Erweiterung prüft seit 0.3.4 vor dem Hardware-Build, ob die vorhandene ELF-Datei exklusiv geöffnet werden kann.

<a id="test"></a>
### Test, Unit-Test und Hardwaretest

Ein Test vergleicht beobachtetes mit erwartetem Verhalten. Ein Unit-Test prüft eine begrenzte Funktion oder einen Ablauf, oft mit nachgebildeten Schnittstellen. Ein Hardwaretest prüft den tatsächlichen Aufbau. Unsere automatischen Tests können beispielsweise die erzeugte Debugkonfiguration prüfen, beweisen allein aber nicht, dass jedes angeschlossene Board funktioniert. Auch ein einzelner erfolgreicher Hardware-Haltepunkt beweist noch nicht, dass das gesamte Programm fehlerfrei durchläuft.

<a id="hash-signatur"></a>
### SHA-256, Prüfsumme und Signatur

SHA-256 berechnet einen Prüfwert aus einer Datei. Der Vergleich mit einem vertrauenswürdig bekannten Sollwert erkennt eine veränderte Datei. Eine passende Prüfsumme allein sagt nicht, wer die Datei erstellt hat. Eine digitale Signatur kann zusätzlich die Herkunft und Unverändertheit im Rahmen der Zertifikatsprüfung bestätigen. Die Treiberautomatik prüft deshalb sowohl den erwarteten Hash als auch den signierten Espressif-Katalog.

<a id="git-pr"></a>
### Git, Repository, Branch, Commit, PR und Tag

Git verwaltet Änderungen am Projekt. Das Repository enthält diese Versionsgeschichte. Ein Branch ist ein eigener Entwicklungszweig; ein Commit ein gespeicherter Änderungsstand. Ein Pull Request (PR) schlägt vor, Änderungen eines Branches in einen Zielbranch zu übernehmen. Erst ein Merge übernimmt sie dorthin. Unsere PRs zielen auf `main`. Ein Tag bezeichnet einen bestimmten Stand, zum Beispiel für ein Release. Einen PR zu öffnen oder eine VSIX zu installieren überträgt noch keine Firmware auf das Board.

## Kleine Lernaufgaben

1. Öffne dein Übungsprogramm und suche eine Variable, eine Funktion und einen Methodenaufruf. Erkläre zu jedem Fund, was er im Programm bewirkt.
2. Setze in deinem Anwendercode einen Haltepunkt vor einer Anweisung, die einen Ausgang verändert. Sage vor dem Fortsetzen voraus, welcher Zustand danach zu erwarten ist. Prüfe anschließend deine Vorhersage.
3. Vergleiche an einem Funktionsaufruf F10 und F11. Wähle danach einen älteren Eintrag in der Aufrufliste. Prüfe, ob du nur die Ansicht oder wirklich den Programmablauf geändert hast.
4. Lies ein Buildprotokoll: Was belegt `SUCCESS`? Welche zusätzlichen Meldungen brauchst du, um eine Firmware-Übertragung und einen erreichten Haltepunkt zu bestätigen?

Die [Bedienungsanleitung](../BEDIENUNG.md) erklärt, welche Schaltfläche für Simulation beziehungsweise echte Hardware zuständig ist. Starte einen Hardware-Upload bewusst: Er ersetzt das Programm auf dem Board.
