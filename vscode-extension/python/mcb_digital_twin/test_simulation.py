import os
import threading
import unittest

from mcb_digital_twin.crossing import AmpelPhase, CAmpel, CKreuzung, KreuzungPhase, SignalPort
from mcb_digital_twin.mcb_simulation import (
    CANFrame,
    CASBActors,
    CASBSensors,
    CButton,
    CCanBus,
    CEeprom,
    COLed,
    CPortExpLoc,
    CPortExpOOPExp,
    CServo,
    CTimer,
    SimulatedCANNetwork,
)
from mcb_digital_twin.web_app import SimulationController


class AmpelTests(unittest.TestCase):
    def test_ampel_phases(self):
        ampel = CAmpel(SignalPort.GPIO_0, SignalPort.GPIO_1, SignalPort.GPIO_2,
                       AmpelPhase.OFF)
        self.assertEqual(ampel.getLights(), (False, False, False))
        ampel.on()
        self.assertEqual(ampel.getLights(), (True, False, False))
        ampel.nextPhase()
        self.assertEqual(ampel.getLights(), (True, True, False))
        ampel.nextPhase()
        self.assertEqual(ampel.getLights(), (False, False, True))
        ampel.nextPhase()
        self.assertEqual(ampel.getLights(), (False, True, False))
        ampel.off()
        self.assertEqual(ampel.getLights(), (False, False, False))

    def test_all_eight_crossing_phases(self):
        crossing = CKreuzung()
        crossing.on()
        expected = [
            (KreuzungPhase.NSR_EWR, (True, False, False), (True, False, False)),
            (KreuzungPhase.NSR_EWRY, (True, False, False), (True, True, False)),
            (KreuzungPhase.NSR_EWG, (True, False, False), (False, False, True)),
            (KreuzungPhase.NSR_EWY, (True, False, False), (False, True, False)),
            (KreuzungPhase.EWR_NSR, (True, False, False), (True, False, False)),
            (KreuzungPhase.EWR_NSRY, (True, True, False), (True, False, False)),
            (KreuzungPhase.EWR_NSG, (False, False, True), (True, False, False)),
            (KreuzungPhase.EWR_NSY, (False, True, False), (True, False, False)),
        ]
        for index, (phase, ns, ew) in enumerate(expected):
            self.assertEqual(crossing.getCurrentPhase(), phase)
            self.assertEqual(crossing.pAmpelNS.getLights(), ns)
            self.assertEqual(crossing.pAmpelEW.getLights(), ew)
            if index < len(expected) - 1:
                crossing.nextPhase()
        crossing.nextPhase()
        self.assertEqual(crossing.getCurrentPhase(), KreuzungPhase.NSR_EWR)

    def test_crossing_off_and_on_reset(self):
        crossing = CKreuzung()
        crossing.on()
        crossing.nextPhase()
        crossing.nextPhase()
        crossing.off()
        self.assertEqual(crossing.getCurrentPhase(), KreuzungPhase.OFF)
        self.assertEqual(crossing.pAmpelNS.getLights(), (False, False, False))
        self.assertEqual(crossing.pAmpelEW.getLights(), (False, False, False))
        crossing.on()
        self.assertEqual(crossing.getCurrentPhase(), KreuzungPhase.NSR_EWR)


class MiniCtrlBoxTests(unittest.TestCase):
    def test_web_controller(self):
        controller = SimulationController()
        controller.action({"action": "module_connection", "state": True})
        controller.action({"action": "remote_switch", "index": 2, "state": True})
        self.assertTrue(controller.state()["remote_switch"][2])
        self.assertEqual(controller.state()["ns"], [False] * 3)
        self.assertEqual(controller.state()["ew"], [False] * 3)
        self.assertFalse(controller.state()["program_running"])

    def test_module_requires_connection_and_disconnect_removes_inputs(self):
        controller = SimulationController()
        with self.assertRaises(ValueError):
            controller.action({"action": "remote_switch", "index": 0, "state": True})
        controller.action({"action": "module_connection", "state": True})
        controller.action({"action": "remote_switch", "index": 0, "state": True})
        controller.action({"action": "module_connection", "state": False})
        self.assertEqual(controller.state()["remote_switch"], [False] * 8)
        self.assertEqual(controller.state()["interrupt"], 0)
        with self.assertRaises(ValueError):
            controller.action({"action": "module_connection", "state": "false"})

    def test_main_unit_buttons_keep_events_and_are_separate_from_module(self):
        controller = SimulationController()
        for side in ("left", "right"):
            controller.action({"action": "main_button", "side": side, "state": True})
            self.assertEqual(controller.state()["main_buttons"][side],
                             {"down": True, "pressed": True, "released": False})
            controller.action({"action": "main_button", "side": side, "state": False})
            self.assertEqual(controller.state()["main_buttons"][side],
                             {"down": False, "pressed": True, "released": True})
            self.assertTrue(controller.state()["main_buttons"][side]["pressed"])
        self.assertEqual(controller.state()["remote_switch"], [False] * 8)
        controller.action({"action": "main_button_reset"})
        for button in controller.state()["main_buttons"].values():
            self.assertEqual(button, {"down": False, "pressed": False, "released": False})
        with self.assertRaises(ValueError):
            controller.action({"action": "main_button", "side": "invalid", "state": True})

    def test_module_buttons_press_release_and_unused_inputs(self):
        controller = SimulationController()
        controller.action({"action": "module_connection", "state": True})
        for index in range(4):
            controller.action({"action": "remote_switch", "index": index, "state": True})
            self.assertTrue(controller.state()["remote_switch"][index])
            self.assertEqual(controller.state()["interrupt"] & (1 << index), 1 << index)
            controller.action({"action": "remote_switch", "index": index, "state": False})
            self.assertFalse(controller.state()["remote_switch"][index])
        for index in (-1, 4, 7):
            with self.assertRaises(ValueError):
                controller.action({"action": "remote_switch", "index": index, "state": True})

    def test_no_demo_outputs_without_user_program(self):
        controller = SimulationController()
        controller.action({"action": "module_connection", "state": True})
        for action in ("on", "off", "next", "remote_led", "local", "oled"):
            with self.assertRaises(ValueError):
                controller.action({"action": action, "index": 0})
        for side in ("left", "right"):
            controller.action({"action": "main_button", "side": side, "state": True})
            controller.action({"action": "main_button", "side": side, "state": False})
        controller.action({"action": "remote_switch", "index": 0, "state": True})
        for _ in range(5):
            state = controller.state()
            self.assertEqual(state["ns"], [False] * 3)
            self.assertEqual(state["ew"], [False] * 3)
            self.assertEqual(state["remote_led"], [False] * 8)

    @unittest.skipUnless(os.environ.get("MCB_NATIVE_TEST_PROJECT"), "No C++ integration test project configured")
    def test_original_cpp_program_drives_only_programmed_outputs(self):
        controller = SimulationController()
        try:
            controller.action({"action": "module_connection", "state": True})
            controller.action({"action": "program_start", "path": os.environ["MCB_NATIVE_TEST_PROJECT"]})
            self.assertTrue(controller.state()["program_running"])
            self.assertIn("Ueb_2.7.3.4", controller.state()["oled"][1])
            self.assertEqual(controller.state()["ew"], [True, False, False])
            for lights in ([True, True, False], [False, False, True], [False, True, False], [True, False, False]):
                controller.action({"action": "main_button", "side": "right", "state": True})
                controller.action({"action": "main_button", "side": "right", "state": False})
                self.assertEqual(controller.state()["ew"], lights)
                self.assertEqual(controller.state()["ns"], [False] * 3)
                self.assertEqual(controller.state()["remote_led"], [False] * 8)
            for side, lights in (("left", [False] * 3), ("right", [False] * 3), ("left", [True, False, False])):
                controller.action({"action": "main_button", "side": side, "state": True})
                controller.action({"action": "main_button", "side": side, "state": False})
                self.assertEqual(controller.state()["ew"], lights)
            controller.action({"action": "program_stop"})
            self.assertFalse(controller.state()["program_running"])
            self.assertEqual(controller.state()["ew"], [False] * 3)
        finally:
            controller.program.stop()

    def test_eeprom_and_oled(self):
        eeprom = CEeprom()
        eeprom.writeID(300)
        eeprom.writeProjectName("Kreuzung")
        self.assertEqual(eeprom.readID(), 44)
        self.assertEqual(eeprom.readProjectName(), "Kreuzung")
        self.assertTrue(eeprom.writeUserData(b"abc"))
        self.assertEqual(eeprom.readUserData(3), b"abc")

        display = COLed(rows=2, cols=10)
        display.printLine(0, "Ampel")
        display.printfAt(1, 0, "P:%d", 3)
        self.assertEqual(display.getLines()[0].strip(), "Ampel")
        self.assertEqual(display.getLines()[1].strip(), "P:3")

    def test_button_events(self):
        button = CButton(10)
        button.simulatePress()
        self.assertTrue(button.hasButtonPressed())
        self.assertFalse(button.hasButtonPressed())
        button.simulateRelease()
        self.assertTrue(button.hasButtonReleased())

    def test_local_port_expander(self):
        expander = CPortExpLoc()
        expander.setColor(CPortExpLoc.RED0 | CPortExpLoc.GREEN0, True)
        self.assertTrue(expander.getColorState(0))
        self.assertTrue(expander.getColorState(1))
        expander.setColor(0, False)
        self.assertFalse(expander.getColorState(0))

    def test_remote_port_expander_and_interrupt(self):
        expander = CPortExpOOPExp()
        called = []
        expander.setLEDPort(0b00000001)
        expander.toggleLEDPortRemain(0b00000011)
        self.assertEqual(expander.getLEDPortState(), 0b00000010)
        expander.setInterruptMask(0b00000100)
        expander.enableInterrupts(lambda: called.append(True))
        expander.simulateSwitch(2, True)
        self.assertTrue(expander.getSwitchState(2))
        self.assertEqual(expander.getInterruptFlag(), 0b00000100)
        self.assertEqual(called, [True])

    def test_can_network(self):
        network = SimulatedCANNetwork()
        sender = CCanBus(network=network)
        receiver = CCanBus(network=network)
        sender.start()
        receiver.start()
        frame = CANFrame(0x1A, b"Phase 3")
        self.assertTrue(sender.transmit(frame))
        self.assertEqual(receiver.receive(10), frame)
        receiver.stop()
        self.assertFalse(sender.transmit(frame))
        self.assertTrue(sender.busOffDetected())

    def test_timer(self):
        fired = threading.Event()
        timer = CTimer(0, 20_000, fired.set, autoReload=False)
        timer.start()
        self.assertTrue(fired.wait(0.5))
        timer.stop()

    def test_servo_sensors_and_actors(self):
        servo = CServo()
        servo.setPWMPercent(CServo.RED0, 50)
        self.assertAlmostEqual(servo.channels[0], 2048, delta=1)
        self.assertEqual(servo.angleToMicroseconds(90), 1500)
        servo.simulatePoti(50)
        self.assertAlmostEqual(servo.getPotiVoltagePercent(), 50, delta=0.1)

        sensors = CASBSensors()
        sensors.simulateAHT20(23.5, 48.0)
        sensors.simulateSCD4x(850, 23.0, 47.0)
        self.assertEqual(sensors.getAHT20Temperature(), 23.5)
        self.assertEqual(sensors.getSCD4xData().ui16CO2, 850)

        actors = CASBActors()
        actors.setRelais(True)
        actors.setBuzzer(True)
        actors.setLED(True)
        self.assertTrue(actors.relais and actors.buzzer and actors.led)


if __name__ == "__main__":
    unittest.main()
