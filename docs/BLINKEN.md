# Kurze Blinkphasen im Digital Twin

Ab Erweiterung 0.3.14 empfängt die Oberfläche Zustandsänderungen über eine dauerhafte Verbindung (`/api/events`, Server-Sent Events). Der Server prüft den aktuellen Zustand alle 5 ms und sendet Änderungen sofort weiter. Die bisherigen Abfragen alle 250 ms konnten kurze Ein-/Aus-Phasen verpassen und langsames oder unregelmäßiges Blinken vortäuschen.

Auch die zusätzliche Pause von 20 ms nach jedem `loop()`-Durchlauf entfällt bei zeitgesteuerten Schleifen. `delay(20)` bleibt eine Wartezeit von 20 ms im C++-Programm. Während `delay()` sowie nach `setup()` und `loop()` werden Zustände übertragen. Bei einem FreeRTOS-Task mit `vTaskDelay(20)` muss die Hauptschleife weiterlaufen, damit der aktuelle Task-Zustand übernommen wird.

20 ms ein und 20 ms aus ergeben eine volle Periode von 40 ms, also ungefähr 25 Blinkzyklen pro Sekunde. Das kann bereits wie Flimmern wirken. Bildschirmfrequenz, Betriebssystem, Browser und Rechnerlast begrenzen die Darstellung; der Digital Twin ist keine Echtzeitsimulation und kein Messgerät für exakte Signalzeiten. Unterbrechungen und blockierte Hauptschleifen können weiterhin Änderungen verdecken. Der Simulator verlangsamt den Blinkcode nicht absichtlich, um die Phasen besser sichtbar zu machen.

Wird die Verbindung unterbrochen, verbindet der Browser sich automatisch neu und bekommt den aktuellen Zustand. Es werden keine vergangenen Blinkphasen nachträglich langsam abgespielt. Der Endpunkt `/api/state` bleibt für die Erweiterung und andere Abfragen erhalten.
