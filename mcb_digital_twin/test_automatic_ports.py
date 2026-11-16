"""Real backend processes get distinct bound ports and isolated project state."""

import json
import os
from pathlib import Path
from queue import Queue
import socket
import subprocess
import sys
import tempfile
from threading import Thread
import unittest
from urllib.request import Request, urlopen


class AutomaticPortTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory(prefix="mcb-ports-")
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)

    def launch(self, name, port=0):
        project = self.root / name
        project.mkdir()
        environment = dict(os.environ, LOCALAPPDATA=str(self.root / "profile"),
                           XDG_DATA_HOME=str(self.root / "profile"))
        process = subprocess.Popen(
            [sys.executable, "-m", "mcb_digital_twin.web_app", "--port", str(port),
             "--auto-port", "--project-root", str(project)],
            cwd=Path(__file__).resolve().parent.parent, env=environment,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )

        def stop():
            if process.poll() is None:
                process.terminate()
            process.wait(timeout=5)
            process.stdout.close()
            process.stderr.close()

        self.addCleanup(stop)
        lines = Queue()
        Thread(target=lambda: lines.put(process.stdout.readline()), daemon=True).start()
        return process, lines

    def address(self, lines):
        line = lines.get(timeout=10)
        self.assertTrue(line.startswith("MCB_READY "), line)
        port = json.loads(line[len("MCB_READY "):])["port"]
        self.assertGreater(port, 0)
        return f"http://127.0.0.1:{port}"

    def state(self, address):
        with urlopen(address + "/api/state", timeout=3) as response:
            return json.load(response)

    def test_simultaneous_processes_use_separate_ports_and_project_state(self):
        first, first_lines = self.launch("first")
        _, second_lines = self.launch("second")
        address1, address2 = self.address(first_lines), self.address(second_lines)
        self.assertNotEqual(address1, address2)
        request = Request(address1 + "/api/action", data=json.dumps(
            {"action": "eeprom", "text": "Nur Projekt eins"}).encode(),
            headers={"Content-Type": "application/json"})
        with urlopen(request, timeout=3) as response:
            self.assertEqual(json.load(response)["project"], "Nur Projekt eins")
        self.assertEqual(self.state(address2)["project"], "")
        first.terminate()
        first.wait(timeout=5)
        self.assertEqual(self.state(address2)["project"], "")

    def test_occupied_requested_port_falls_back_to_a_bound_free_port(self):
        with socket.socket() as occupied:
            occupied.bind(("127.0.0.1", 0))
            occupied.listen()
            requested = occupied.getsockname()[1]
            _, lines = self.launch("fallback", requested)
            address = self.address(lines)
            self.assertNotEqual(address, f"http://127.0.0.1:{requested}")
            self.assertFalse(self.state(address)["program_running"])

    def test_existing_simulator_on_requested_port_is_not_reused(self):
        _, first_lines = self.launch("existing")
        address1 = self.address(first_lines)
        _, second_lines = self.launch("new", int(address1.rsplit(":", 1)[1]))
        address2 = self.address(second_lines)
        self.assertNotEqual(address1, address2)
        self.assertFalse(self.state(address1)["program_running"])
        self.assertFalse(self.state(address2)["program_running"])


if __name__ == "__main__":
    unittest.main()
