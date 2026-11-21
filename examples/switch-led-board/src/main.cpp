#include <MiniCtrlBox.h>

using namespace nspMiniCtrlBox;

COLed display;
CPortExpRem board;
CButton left(PIN_BUTTON_LEFT);
CButton right(PIN_BUTTON_RIGHT);

enum Mode { MIRROR, INVERTED, CHASE };
Mode mode = MIRROR;
bool paused = false;
unsigned char chasePosition = 0;
unsigned char leds = 0;
unsigned long lastStep = 0;

void setup() {
    display.begin();
    board.begin();
    board.setLEDPort(0);
    display.printLine(0, "Demo SwitchLEDBoard");
    display.printLine(4, "Rechts: Modus wechseln");
    display.printLine(5, "Links: Pause/Weiter");
    display.printLine(7, "Bits: SW8 ... SW1");
}

void loop() {
    const unsigned long now = millis();
    if (right.hasButtonPressed()) {
        mode = static_cast<Mode>((unsigned(mode) + 1) % 3);
        chasePosition = 0;
        lastStep = now;
    }
    if (left.hasButtonPressed()) {
        paused = !paused;
        lastStep = now;
    }
    const unsigned char switches = board.getSwitchState();
    if (!paused) {
        if (mode == MIRROR) leds = switches;
        else if (mode == INVERTED) leds = static_cast<unsigned char>(~switches);
        else {
            if (now - lastStep >= 200) {
                chasePosition = (chasePosition + 1) % 8;
                lastStep = now;
            }
            leds = 1u << chasePosition;
        }
        board.setLEDPort(leds);
    }
    const char* names[] = {"Spiegeln", "Invertiert", "Lauflicht"};
    display.printfLine(1, "Modus: %-12s", names[mode]);
    display.printfLine(2, "Status: %-12s", paused ? "Pause" : "Laeuft");
    display.printfLine(3, "Schalter/LED: %02X/%02X", unsigned(switches), unsigned(leds));
    char bits[9];
    for (unsigned char i = 0; i < 8; ++i) bits[i] = (switches & (1u << (7 - i))) ? '1' : '0';
    bits[8] = '\0';
    display.printfLine(6, "Schalter: %s", bits);
    delay(10);
}
