"""Exercise the actual C++ desktop process through the web controller."""

from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

from mcb_digital_twin.native_runner import _compiler
from mcb_digital_twin.web_app import SimulationController


class NativePeripheralTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            _compiler()
        except (ValueError, OSError) as error:
            raise unittest.SkipTest(str(error)) from error

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="mcb-peripheral-test-")
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        (self.root / "src").mkdir()
        self.temp_patch = patch("mcb_digital_twin.native_runner.tempfile.gettempdir", return_value=self.directory.name)
        self.temp_patch.start()
        self.addCleanup(self.temp_patch.stop)
        self.storage_patch = patch("mcb_digital_twin.native_runner._storage_directory", return_value=self.root / "eeprom")
        self.storage_patch.start()
        self.addCleanup(self.storage_patch.stop)
        self.controller = SimulationController()
        self.addCleanup(self.controller.program.stop)

    def start(self, source):
        (self.root / "src/main.cpp").write_text(source, encoding="utf-8")
        self.controller.action({"action": "program_start", "path": self.directory.name})

    def wait_for(self, predicate):
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            state = self.controller.state()
            self.assertEqual(state["program_error"], "")
            if predicate(state):
                return state
            time.sleep(.02)
        self.fail("Native peripheral state did not arrive")

    def test_eeprom_commit_restart_and_ui_share_storage(self):
        self.start('''
#include <MiniCtrlBox.h>
#include <EEPROM.h>
using namespace nspMiniCtrlBox;
CEeprom storage;
COLed oled;
void setup(){
 EEPROM.begin(16);
 auto count=EEPROM.read(0);EEPROM.write(0,count+1);EEPROM.commit();
 if(count==0)storage.writeProjectName("Ampel");
 oled.printfLine(0,"%u",unsigned(count+1));
}
void loop(){oled.printLine(1,storage.readProjectName().c_str());}
''')
        self.assertEqual(self.controller.state()["eeprom_bytes"][0], 1)
        self.assertEqual(self.controller.state()["project"], "Ampel")
        self.controller.action({"action": "eeprom", "text": "Test ä"})
        # Existing OLED transport escapes UTF-8 byte by byte.
        self.wait_for(lambda state: state["oled"][1].startswith("Test "))
        self.controller.program.stop()
        self.controller = SimulationController()
        self.addCleanup(self.controller.program.stop)
        self.controller.action({"action": "program_start", "path": self.directory.name})
        self.assertEqual(self.controller.state()["eeprom_bytes"][0], 2)
        self.assertEqual(self.controller.state()["project"], "Test ä")

        old_pid = self.controller.program.process.pid
        self.controller.action({"action": "twin_restart"})
        self.addCleanup(self.controller.program.stop)
        self.assertNotEqual(self.controller.program.process.pid, old_pid)
        self.assertEqual(self.controller.state()["eeprom_bytes"][0], 3)
        self.assertEqual(self.controller.state()["project"], "Test ä")

    def test_twai_receives_web_frame_and_returns_real_program_response(self):
        self.start('''
#include <MiniCtrlBox.h>
#include <driver/twai.h>
void setup(){
 auto general=TWAI_GENERAL_CONFIG_DEFAULT(GPIO_NUM_20,GPIO_NUM_21,TWAI_MODE_NORMAL);
 auto timing=TWAI_TIMING_CONFIG_500KBITS();auto filter=TWAI_FILTER_CONFIG_ACCEPT_ALL();
 twai_driver_install(&general,&timing,&filter);twai_start();
}
void loop(){twai_message_t message{};if(twai_receive(&message,0)==ESP_OK){
 if(message.identifier==0x101){message.identifier=0x100;message.data[0]='!';twai_transmit(&message,0);}
}}
''')
        self.controller.action({"action": "can", "identifier": "0x101", "text": "HALLO"})
        self.wait_for(lambda state: state["can"] == "!ALLO")
        with self.assertRaises(ValueError):
            self.controller.action({"action": "can", "identifier": "0x20000000", "text": "bad"})
        with self.assertRaises(ValueError):
            self.controller.action({"action": "can", "text": "123456789"})

    def test_ccanbus_and_eeprom_bounds(self):
        self.start('''
#include <MiniCtrlBox.h>
#include <EEPROM.h>
using namespace nspMiniCtrlBox;
CCanBus bus; COLed oled;
void setup(){
 bool invalid=EEPROM.begin(5000);EEPROM.begin(16);EEPROM.write(16,99);
 uint32_t value=0x12345678,actual=0;EEPROM.put(4,value);EEPROM.get(4,actual);
 oled.printfLine(0,"%d %d %d",invalid,EEPROM.read(16),value==actual);bus.start();
}
void loop(){CCanBus::Frame frame;if(bus.receive(frame,0))bus.transmit(frame,0);}
''')
        self.assertEqual(self.controller.state()["oled"][0], "0 0 1")
        self.controller.action({"action": "can", "text": "Echo"})
        self.wait_for(lambda state: state["can"] == "Echo")
        self.controller.action({"action": "can", "identifier": "0x1fffffff", "text": "12345678"})
        self.wait_for(lambda state: state["can"] == "12345678")
        self.assertEqual(self.controller.program.eeprom_memory[4], 0)

    def test_freertos_task_blinks_without_project_compatibility_code(self):
        self.start('''
#include <MiniCtrlBox.h>
using namespace nspMiniCtrlBox;
CPortExpLoc port;
void blink(void*){
 bool state=false;
 while(1){state=!state;port.setColor(CPortExpLoc::RED0,state);vTaskDelay(pdMS_TO_TICKS(20));}
}
void setup(){port.begin();xTaskCreate(blink,"blink",1024,NULL,1,NULL);}
void loop(){}
''')
        observed = set()
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline and observed != {False, True}:
            state = self.controller.state()
            self.assertEqual(state["program_error"], "")
            observed.add(state["local"][0])
            time.sleep(.02)
        self.assertEqual(observed, {False, True})

    def test_twenty_ms_delay_exposes_both_levels_in_each_loop(self):
        self.start('''
#include <MiniCtrlBox.h>
using namespace nspMiniCtrlBox;
CPortExpLoc port;
void setup(){port.begin();}
void loop(){
 port.setColor(CPortExpLoc::RED0,true);delay(20);
 port.setColor(CPortExpLoc::RED0,false);delay(20);
}
''')
        previous = None
        changes = 0
        deadline = time.monotonic() + 1.2
        while time.monotonic() < deadline:
            state = self.controller.state()
            self.assertEqual(state["program_error"], "")
            level = state["local"][0]
            if previous is not None and level != previous:
                changes += 1
            previous = level
            time.sleep(.002)
        self.assertGreaterEqual(changes, 20, "20-ms blink phases were lost or heavily slowed")


if __name__ == "__main__":
    unittest.main()
