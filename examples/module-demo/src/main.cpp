#include <MiniCtrlBox.h>
#include <atomic>

using namespace nspMiniCtrlBox;

COLed display;
CButton left(PIN_BUTTON_LEFT);
CButton right(PIN_BUTTON_RIGHT);
CPortExpOOPExp crossing;
CPortExpRem board;
CPortExpLoc localLEDs;

enum Demo { CROSSING, SWITCH_LED, THREAD_BLINKER };
Demo demo = CROSSING;
const unsigned char vehiclePins[] = {0, 1, 4, 5, 6, 7};
struct Phase {
    const char* name;
    unsigned char vehicles;  // OW rot/gelb/gruen, NS rot/gelb/gruen.
    unsigned char pedestrians;
    unsigned long duration;
};
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
unsigned char phase = 1;
bool automatic = true;
unsigned long phaseStarted = 0;
unsigned char mode = 0;  // Spiegeln, Invertiert, Lauflicht.
bool paused = false;
unsigned char chasePosition = 0;
unsigned char leds = 0;
unsigned long lastStep = 0;
bool leftDown = false;
bool rightDown = false;
bool chord = false;
constexpr unsigned blinkStartMs = 100;
constexpr unsigned blinkStepMs = 20;
constexpr unsigned blinkMaxMs = 1000;
// Null pausiert die Task außerhalb der Blinkerdemo.
std::atomic<unsigned> blinkIntervalMs{0};
bool blinkerTaskStarted = false;

void blinkTask(void*) {
    bool ledOn = false;
    unsigned long lastToggle = millis();
    while (true) {
        const unsigned interval = blinkIntervalMs.load();
        const unsigned long now = millis();
        if (interval == 0) {
            if (ledOn) {
                localLEDs.setColor(CPortExpLoc::RED0, false);
                ledOn = false;
            }
            lastToggle = now;
        } else if (now - lastToggle >= interval) {
            ledOn = !ledOn;
            localLEDs.setColor(CPortExpLoc::RED0, ledOn);
            lastToggle = now;
        }
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

void showPhase() {
    for (unsigned char pin : vehiclePins) digitalWrite(pin, LOW);
    crossing.setLEDPort(0x05);
    for (unsigned char i = 0; i < 6; ++i)
        digitalWrite(vehiclePins[i], (phases[phase].vehicles & (1u << i)) ? HIGH : LOW);
    crossing.setLEDPort(phases[phase].pedestrians);
    phaseStarted = millis();
    display.printfLine(1, "%-21s", phases[phase].name);
    display.printfLine(2, "Phase: %u/10", unsigned(phase + 1));
}

void startDemo() {
    // Beim Wechsel alle Ausgaenge der vorherigen Demo zuruecksetzen.
    for (unsigned char pin : vehiclePins) digitalWrite(pin, LOW);
    display.clear();
    display.printLine(7, "Beide: Demo wechseln");
    if (demo == CROSSING) {
        crossing.begin();
        phase = 1;
        automatic = true;
        display.printLine(0, "Demo Kreuzungsmodul");
        display.printLine(4, "Links: Auto/Manuell");
        display.printLine(5, "Rechts: Phase weiter");
        showPhase();
    } else if (demo == SWITCH_LED) {
        board.begin();
        mode = 0;
        paused = false;
        chasePosition = 0;
        leds = 0;
        lastStep = millis();
        board.setLEDPort(0);
        display.printLine(0, "Demo SwitchLEDBoard");
        display.printLine(4, "Links: Pause/Weiter");
        display.printLine(5, "Rechts: Modus weiter");
    } else {
        display.printLine(0, "Demo Thread-Blinker");
        if (!blinkerTaskStarted && localLEDs.begin()) {
            blinkerTaskStarted = xTaskCreate(blinkTask, "LEDBlinker", 2048, nullptr, 1, nullptr) == pdPASS;
        }
        if (!blinkerTaskStarted) {
            display.printLine(2, "Blinker nicht bereit");
            return;
        }
        blinkIntervalMs.store(blinkStartMs);
        display.printLine(2, "Separate FreeRTOS-Task");
        display.printfLine(3, "Intervall: %4u ms", blinkStartMs);
        display.printLine(4, "Links: langsamer");
        display.printLine(5, "Rechts: schneller");
    }
}

void nextDemo() {
    switch (demo) {
        case CROSSING:
            crossing.setLEDPort(0);
            demo = SWITCH_LED;
            break;
        case SWITCH_LED:
            board.setLEDPort(0);
            demo = THREAD_BLINKER;
            break;
        case THREAD_BLINKER:
            blinkIntervalMs.store(0);
            demo = CROSSING;
            break;
    }
    startDemo();
}

void setup() {
    for (unsigned char pin : vehiclePins) pinMode(pin, OUTPUT);
    display.begin();
    startDemo();
}

void loop() {
    const unsigned long now = millis();
    if (left.hasButtonPressed()) leftDown = true;
    if (right.hasButtonPressed()) rightDown = true;
    bool leftClick = false;
    bool rightClick = false;
    // Einzelaktionen erst beim Loslassen: beide Taster zusammen loesen
    // dadurch weder einen Phasenwechsel noch einen Moduswechsel aus.
    if (leftDown && rightDown && !chord) {
        chord = true;
        nextDemo();
        delay(10);
        return;
    }
    if (left.hasButtonReleased()) { leftClick = leftDown && !chord; leftDown = false; }
    if (right.hasButtonReleased()) { rightClick = rightDown && !chord; rightDown = false; }
    if (!leftDown && !rightDown) chord = false;

    if (demo == CROSSING) {
        if (leftClick) { automatic = !automatic; phaseStarted = now; }
        if (rightClick || (automatic && now - phaseStarted >= phases[phase].duration)) {
            phase = (phase + 1) % (sizeof(phases) / sizeof(phases[0]));
            showPhase();
        }
        const unsigned char buttons = crossing.getSwitchState() & 0x0f;
        crossing.setLEDPort(phases[phase].pedestrians | (buttons << 4));
        display.printfLine(3, "Modus: %-12s", automatic ? "Automatik" : "Manuell");
        display.printfLine(6, "Taster: %u %u %u %u", unsigned(bool(buttons & 1)),
            unsigned(bool(buttons & 2)), unsigned(bool(buttons & 4)), unsigned(bool(buttons & 8)));
    } else if (demo == SWITCH_LED) {
        if (rightClick) { mode = (mode + 1) % 3; chasePosition = 0; lastStep = now; }
        if (leftClick) { paused = !paused; lastStep = now; }
        const unsigned char switches = board.getSwitchState();
        if (!paused) {
            if (mode == 0) leds = switches;
            else if (mode == 1) leds = static_cast<unsigned char>(~switches);
            else {
                if (now - lastStep >= 200) { chasePosition = (chasePosition + 1) % 8; lastStep = now; }
                leds = 1u << chasePosition;
            }
            board.setLEDPort(leds);
        }
        const char* names[] = {"Spiegeln", "Invertiert", "Lauflicht"};
        display.printfLine(1, "Modus: %-12s", names[mode]);
        display.printfLine(2, "Status: %-12s", paused ? "Pause" : "Laeuft");
        display.printfLine(3, "Schalter/LED: %02X/%02X", unsigned(switches), unsigned(leds));
        display.printLine(6, "Schalter SW1 bis SW8");
    } else if (blinkerTaskStarted && (leftClick || rightClick)) {
        unsigned interval = blinkIntervalMs.load();
        if (leftClick && interval < blinkMaxMs) interval += blinkStepMs;
        if (rightClick && interval > blinkStepMs) interval -= blinkStepMs;
        blinkIntervalMs.store(interval);
        display.printfLine(3, "Intervall: %4u ms", interval);
    }
    delay(10);
}
