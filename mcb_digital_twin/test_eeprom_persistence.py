"""EEPROM survives a complete twin restart without starting native C++."""

import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
from urllib.error import URLError
from urllib.request import Request, urlopen

from mcb_digital_twin.web_app import SimulationController


class EepromRestartTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="mcb-eeprom-restart-")
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.storage = patch("mcb_digital_twin.native_runner._storage_directory", return_value=self.root / "storage")
        self.storage.start()
        self.addCleanup(self.storage.stop)

    def test_save_and_restore_without_native_program(self):
        controller = SimulationController(self.root)
        controller.action({"action": "eeprom", "text": "Meine Ampel ä"})
        self.assertFalse(controller.state()["program_running"])
        self.assertTrue(controller.program.storage_path.is_file())
        restored = SimulationController(self.root)
        self.assertEqual(restored.state()["project"], "Meine Ampel ä")
        self.assertFalse(restored.state()["program_running"])

    def test_committed_bytes_are_visible_before_program_start(self):
        controller = SimulationController(self.root)
        controller.program.eeprom_memory[0] = 42
        controller.action({"action": "eeprom", "text": "Gespeichert"})
        restored = SimulationController(self.root)
        self.assertEqual(restored.state()["eeprom_bytes"][0], 42)

    def test_projects_and_wrapped_project_paths(self):
        project = self.root / "exercise"
        (project / "src").mkdir(parents=True)
        (project / "src/main.cpp").touch()
        controller = SimulationController(project)
        controller.action({"action": "eeprom", "text": "Projekt A"})
        self.assertEqual(SimulationController(self.root).state()["project"], "Projekt A")
        other = self.root / "other"
        other.mkdir()
        self.assertEqual(SimulationController(other).state()["project"], "")

    def test_backend_process_restart_with_project_root(self):
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            port = listener.getsockname()[1]
        address = f"http://127.0.0.1:{port}"
        environment = os.environ.copy()
        environment["LOCALAPPDATA"] = str(self.root / "profile")
        environment["XDG_DATA_HOME"] = str(self.root / "profile")
        project = self.root / "web-project"
        project.mkdir()

        def start():
            process = subprocess.Popen(
                [sys.executable, "-m", "mcb_digital_twin.web_app", "--port", str(port), "--project-root", str(project)],
                cwd=Path(__file__).resolve().parent.parent, env=environment,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
            def stop():
                if process.poll() is None:
                    process.terminate()
                process.wait(timeout=5)
            self.addCleanup(stop)
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                self.assertIsNone(process.poll(), "Backend exited before becoming ready")
                try:
                    with urlopen(address + "/api/state", timeout=.5) as response:
                        json.load(response)
                    return stop
                except (URLError, TimeoutError):
                    time.sleep(.03)
            self.fail("Backend did not become ready")

        stop = start()
        request = Request(address + "/api/action", data=json.dumps({"action": "eeprom", "text": "Nach Neustart"}).encode(), headers={"Content-Type": "application/json"})
        with urlopen(request, timeout=2) as response:
            self.assertEqual(json.load(response)["project"], "Nach Neustart")
        stop()
        start()
        with urlopen(address + "/api/state", timeout=2) as response:
            state = json.load(response)
        self.assertEqual(state["project"], "Nach Neustart")
        self.assertFalse(state["program_running"])


if __name__ == "__main__":
    unittest.main()
