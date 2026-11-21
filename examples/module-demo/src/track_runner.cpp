#include "track_runner.h"

namespace trackRunner {
namespace {
constexpr int width = 20;
constexpr int playerColumn = 3;
constexpr unsigned long startStepMs = 150;
constexpr unsigned long minStepMs = 85;
constexpr unsigned long jumpMs = 550;

int obstacleColumn;
unsigned score;
unsigned long lastStep;
unsigned long jumpStarted;
bool jumping;
bool crashed;

void draw(nspMiniCtrlBox::COLed& display) {
    char air[width + 1];
    char ground[width + 1];
    for (int column = 0; column < width; ++column) {
        air[column] = ' ';
        ground[column] = '.';
    }
    air[width] = ground[width] = '\0';
    if (obstacleColumn >= 0) ground[obstacleColumn] = '#';
    if (jumping) air[playerColumn] = '@';
    else ground[playerColumn] = crashed ? 'X' : '@';

    display.printfLine(1, "Punkte: %-12u", score);
    display.printLine(2, air);
    display.printLine(3, ground);
    display.printLine(4, "====================");
    display.printLine(5, crashed ? "Kollision!          " : "                    ");
    display.printLine(6, crashed ? "Rechts: Neustart    " : "Rechts: Springen    ");
}
}

void start(nspMiniCtrlBox::COLed& display) {
    obstacleColumn = width - 1;
    score = 0;
    lastStep = millis();
    jumping = false;
    crashed = false;
    display.printLine(0, "Demo Gleis-Sprung");
    draw(display);
}

void update(nspMiniCtrlBox::COLed& display, bool jumpPressed) {
    if (crashed) {
        if (jumpPressed) start(display);
        return;
    }

    const unsigned long now = millis();
    bool redraw = false;
    if (jumping && now - jumpStarted >= jumpMs) {
        jumping = false;
        redraw = true;
    }
    if (jumpPressed && !jumping) {
        jumping = true;
        jumpStarted = now;
        redraw = true;
    }

    constexpr unsigned long maxSpeedup = startStepMs - minStepMs;
    const unsigned long speedup = score < maxSpeedup / 5 ? score * 5UL : maxSpeedup;
    const unsigned long stepMs = startStepMs - speedup;
    if (now - lastStep >= stepMs) {
        lastStep = now;
        if (--obstacleColumn < 0) obstacleColumn = width - 1;
        if (obstacleColumn == playerColumn - 1) ++score;
        redraw = true;
    }
    if (!jumping && obstacleColumn == playerColumn) {
        crashed = true;
        redraw = true;
    }
    if (redraw) draw(display);
}
}
