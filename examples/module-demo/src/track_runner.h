#pragma once

#include <MiniCtrlBox.h>

namespace trackRunner {
void start(nspMiniCtrlBox::COLed& display);
void update(nspMiniCtrlBox::COLed& display, bool jumpPressed);
}
