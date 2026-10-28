# Versionshistorie

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
