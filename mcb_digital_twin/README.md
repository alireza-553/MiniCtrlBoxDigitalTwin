# MiniCtrlBox Digital Twin

Dieser Ordner enthält einen Python-Digitalzwilling des Kreuzungsprojekts und
eine Verhaltenssimulation der dokumentierten MiniCtrlBox-Schnittstellen.

## Starten

Im Ordner `/home/ghost/Dokumente/MiniCtrlBoxDigitalTwin`:

Die browserbasierte Oberfläche benötigt keine Zusatzpakete:

```bash
python3 mcb_digital_twin/web_app.py
```

Danach im Browser `http://127.0.0.1:8765` öffnen.

Alternativ gibt es eine Tkinter-Desktopoberfläche:

```bash
python3 mcb_digital_twin/app.py
```

Für diese Variante muss Tkinter installiert sein (unter Debian/Ubuntu das
Paket `python3-tk`).

## Tests

```bash
python3 -m unittest discover -s mcb_digital_twin -p "test_*.py" -v
```

## Simulierte Bereiche

- `CSignal`, `CAmpel` und `CKreuzung` mit allen acht Phasen
- `CEeprom`
- `COLed`
- `CButton`
- `CPortExpLoc`
- `CPortExpRem` und `CPortExpOOPExp`
- `CTimer`
- `CCanBus` mit mehreren simulierten Teilnehmern
- `CServo`
- `CASBActors`
- `CASBSensors`

Die Simulation bildet das Verhalten der öffentlichen Methoden ab. Sie ist
kein takt- oder registergenauer Emulator des ESP32, des MCP23017 oder der
anderen Hardwarebausteine.
