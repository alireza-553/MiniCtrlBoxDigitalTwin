"""Exercise the browser's actual HTTP event stream, including 20-ms signals."""

import json
import threading
import time
import unittest
from unittest.mock import patch
from urllib.request import urlopen

from mcb_digital_twin import web_app


class LiveUpdatesTests(unittest.TestCase):
    def test_twenty_ms_changes_arrive_without_quarter_second_polling(self):
        class BlinkingController:
            def __init__(self):
                self.started = time.monotonic()

            def state(self):
                return {"local": [bool(int((time.monotonic() - self.started) / .020) % 2)]}

        with patch.object(web_app, "CONTROLLER", BlinkingController()):
            server = web_app.SimulationServer(("127.0.0.1", 0), web_app.Handler)
            worker = threading.Thread(target=server.serve_forever, daemon=True)
            worker.start()
            try:
                address = f"http://127.0.0.1:{server.server_port}"
                with urlopen(address + "/api/events", timeout=3) as response:
                    self.assertIn("text/event-stream", response.headers["Content-Type"])
                    start = time.monotonic()
                    values = []
                    while len(values) < 16 and time.monotonic() - start < 2:
                        line = response.readline()
                        if line.startswith(b"data: "):
                            values.append(json.loads(line[6:])["local"][0])
                    self.assertEqual(len(values), 16)
                    self.assertEqual(set(values), {False, True})
                    self.assertTrue(all(a != b for a, b in zip(values, values[1:])))
                    # Loose enough for loaded Windows hosts, but 250-ms polling
                    # cannot deliver 16 alternating states within this interval.
                    self.assertLess(time.monotonic() - start, 1.5)
                with urlopen(address + "/api/state", timeout=2) as response:
                    self.assertIn("local", json.load(response))
            finally:
                server.stream_stop.set()
                server.shutdown()
                server.server_close()
                worker.join(timeout=2)

