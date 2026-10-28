"""Real native build and breakpoint-wait lifecycle checks."""

from pathlib import Path
import shutil
import tempfile
import time
import unittest

from mcb_digital_twin.native_runner import _compiler
from mcb_digital_twin.web_app import SimulationController


class NativeDebugTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try:
            _, _, msvc = _compiler()
            if not msvc and not shutil.which("gdb"):
                raise unittest.SkipTest("GDB is required for native debug builds")
        except (ValueError, OSError) as error:
            raise unittest.SkipTest(str(error)) from error

    def test_gate_long_pause_responsive_inputs_resume_and_stop(self):
        with tempfile.TemporaryDirectory(prefix="mcb-debug-test-") as directory:
            root = Path(directory)
            (root / "src").mkdir()
            (root / "src/main.cpp").write_text('''
#include "MiniCtrlBox.h"
void setup(){ digitalWrite(0, HIGH); delay(2300); }
void loop(){ digitalWrite(1, HIGH); delay(2300); }
''', encoding="utf-8")
            controller = SimulationController()
            try:
                controller.action({"action": "program_start", "path": directory, "debug": True})
                target = controller.state()["program_debug"]
                self.assertTrue(Path(target["program"]).is_file())
                if target["type"] == "cppvsdbg":
                    self.assertTrue(Path(target["program"]).with_suffix(".pdb").is_file())
                build = controller.program.build
                # Simulates a debugger taking longer than the normal timeout
                # to attach. setup must not execute before explicit release.
                time.sleep(2.2)
                self.assertTrue(controller.state()["program_running"])
                self.assertIsNone(controller.program.snapshot)
                self.assertEqual(controller.program.error, "")
                before = time.monotonic()
                controller.action({"action": "module_connection", "state": True})
                controller.action({"action": "main_button", "side": "left", "state": True})
                self.assertLess(time.monotonic() - before, .5)
                with self.assertRaises(ValueError):
                    controller.action({"action": "program_debug_continue", "processId": "wrong"})
                controller.action({"action": "program_debug_continue", "processId": target["processId"]})
                deadline = time.monotonic() + 6
                while not controller.program.snapshot and time.monotonic() < deadline:
                    time.sleep(.05)
                self.assertTrue(controller.state()["ew"][0])
                self.assertEqual(controller.program.error, "")
                # A stale debugger termination must not kill the current run.
                controller.action({"action": "program_stop", "processId": "wrong"})
                self.assertTrue(controller.program.running)
                # Stop while loop is blocked (as it would be at a breakpoint).
                before = time.monotonic()
                controller.action({"action": "program_stop", "processId": target["processId"]})
                self.assertLess(time.monotonic() - before, 2)
                self.assertFalse(controller.program.running)
                self.assertFalse(build.exists())
                self.assertIsNone(controller.state()["program_debug"])
            finally:
                controller.program.stop()


if __name__ == "__main__":
    unittest.main()
