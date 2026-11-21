#include <MiniCtrlBox.h>

using namespace nspMiniCtrlBox;

COLed display;
CPortExpOOPExp crossing;
CButton left(PIN_BUTTON_LEFT);
CButton right(PIN_BUTTON_RIGHT);

// Zuordnung wie im Digital Twin: Ost/West GPIO 0,1,4; Nord/Sued 5,6,7.
const unsigned char vehiclePins[] = {0, 1, 4, 5, 6, 7};
struct Phase {
    const char* name;
    unsigned char vehicles;  // Bits: OW rot/gelb/gruen, NS rot/gelb/gruen.
    unsigned char pedestrians;
    unsigned long duration;
};

// Fussgaenger erhalten nur bei beidseitig roten Fahrzeugampeln Gruen.
// Anschliessend folgt vor jeder Fahrzeugfreigabe eine reine Rotphase.
const Phase phases[] = {
    {"Fussgaenger frei", 0x09, 0x0a, 3000},
    {"Alle rot",         0x09, 0x05, 1000},
    {"OW rot-gelb",      0x0b, 0x05, 1000},
    {"OW gruen",         0x0c, 0x05, 4000},
    {"OW gelb",          0x0a, 0x05, 1000},
    {"Alle rot",         0x09, 0x05, 1000},
    {"NS rot-gelb",      0x19, 0x05, 1000},
    {"NS gruen",         0x21, 0x05, 4000},
    {"NS gelb",          0x11, 0x05, 1000},
    {"Alle rot",         0x09, 0x05, 1000},
};
unsigned char phase = 1;  // Start mit allen Ampeln rot.
bool automatic = true;
unsigned long phaseStarted = 0;

void showPhase() {
    const Phase& current = phases[phase];
    // Zuerst alle Fahrzeugausgaenge aus, dann neue Phase einschalten.
    for (unsigned char pin : vehiclePins) digitalWrite(pin, LOW);
    crossing.setLEDPort(0x05);  // Fussgaenger zuerst rot.
    for (unsigned char i = 0; i < 6; ++i)
        digitalWrite(vehiclePins[i], (current.vehicles & (1u << i)) ? HIGH : LOW);
    crossing.setLEDPort(current.pedestrians);
    phaseStarted = millis();
    display.printfLine(1, "%-21s", current.name);
    display.printfLine(2, "Phase: %u/%u", unsigned(phase + 1), unsigned(sizeof(phases) / sizeof(phases[0])));
}

void setup() {
    for (unsigned char pin : vehiclePins) pinMode(pin, OUTPUT);
    display.begin();
    crossing.begin();
    display.printLine(0, "Demo Kreuzungsmodul");
    display.printLine(4, "Links: Auto/Manuell");
    display.printLine(5, "Rechts: naechste Phase");
    showPhase();
}

void loop() {
    if (left.hasButtonPressed()) {
        automatic = !automatic;
        phaseStarted = millis();
    }
    if (right.hasButtonPressed() || (automatic && millis() - phaseStarted >= phases[phase].duration)) {
        phase = (phase + 1) % (sizeof(phases) / sizeof(phases[0]));
        showPhase();
    }
    // Vier Modultaster spiegeln sich in den LEDs SW1 bis SW4 (Bits 4..7).
    const unsigned char buttons = crossing.getSwitchState() & 0x0f;
    crossing.setLEDPort(phases[phase].pedestrians | (buttons << 4));
    display.printfLine(3, "Modus: %-12s", automatic ? "Automatik" : "Manuell");
    display.printfLine(6, "Taster: %u %u %u %u", unsigned(bool(buttons & 1)),
        unsigned(bool(buttons & 2)), unsigned(bool(buttons & 4)), unsigned(bool(buttons & 8)));
    delay(10);
}
