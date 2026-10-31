"""Browseroberflaeche fuer den MiniCtrlBox-Digitalzwilling (ohne Zusatzpakete)."""

from __future__ import annotations

import json
import argparse
from pathlib import Path
import subprocess
from threading import RLock
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    from .native_runner import NativeProgram
    from .crossing import CKreuzung
    from .mcb_simulation import (
        CANFrame, CASBActors, CASBSensors, CButton, CCanBus, CEeprom, CKeyPad, COLed,
        CPortExpLoc, CPortExpOOPExp, CPortExpRem, CServo, SimulatedCANNetwork,
    )
except ImportError:
    from native_runner import NativeProgram
    from crossing import CKreuzung
    from mcb_simulation import (
        CANFrame, CASBActors, CASBSensors, CButton, CCanBus, CEeprom, CKeyPad, COLed,
        CPortExpLoc, CPortExpOOPExp, CPortExpRem, CServo, SimulatedCANNetwork,
    )


class SimulationController:
    def __init__(self, project_root=None):
        self.kreuzung = CKreuzung()
        self.program = NativeProgram()
        self.program_path = str(self.program.select_storage(project_root or Path.cwd()))
        self.module_connected = False
        self.slb_connected = False
        self.keypad_connected = False
        self.local = CPortExpLoc()
        self.main_buttons = {"left": CButton(0), "right": CButton(3)}
        self.remote = CPortExpOOPExp()
        self.remote.setInterruptMask(0xFF)
        self.slb = CPortExpRem()
        self.slb.setInterruptMask(0xFF)
        self.keypad = CKeyPad()
        self.display = COLed()
        self.eeprom = CEeprom()
        self.servo = CServo()
        self.servo_angle = 90.0
        self.servo.setMicroseconds(CServo.SERVO1,
                                   self.servo.angleToMicroseconds(self.servo_angle))
        self.sensors = CASBSensors()
        self.actors = CASBActors()
        self.last_can = ""
        network = SimulatedCANNetwork()
        self.can_sender = CCanBus(network=network)
        self.can_receiver = CCanBus(network=network)
        self.can_sender.start()
        self.can_receiver.start()

    def state(self) -> dict:
        scd = self.sensors.getSCD4xData()
        running = self.program.running
        snapshot = self.program.snapshot if running and self.program.snapshot else {}
        pins = snapshot.get("pins", [0] * 8) if self.module_connected else [0] * 8
        remote = snapshot.get("remote", 0) if self.module_connected else 0
        slb = snapshot.get("slb", 0) if self.slb_connected else 0
        keypad_leds = snapshot.get("keypad_leds", 0) if self.keypad_connected else 0
        return {
            "program_running": running,
            "program_path": self.program.project or self.program_path,
            "program_error": self.program.error,
            "program_debug": self.program.debug if running else None,
            "module_connected": self.module_connected,
            "slb_connected": self.slb_connected,
            "keypad_connected": self.keypad_connected,
            "phase": "PROGRAM" if running else "OFF",
            "ew": [bool(pins[i]) for i in (0, 1, 4)],
            "ns": [bool(pins[i]) for i in (5, 6, 7)],
            "local": [bool(value) for value in snapshot.get("rgb", [0] * 6)],
            "main_buttons": {
                side: {"down": button.state,
                       "pressed": button.hasButtonPressed(False),
                       "released": button.hasButtonReleased(False)}
                for side, button in self.main_buttons.items()
            },
            "remote_led": [bool(remote & (1 << i)) for i in range(8)],
            "remote_switch": [bool(self.remote.getSwitchState(i)) for i in range(8)],
            "interrupt": self.remote.getInterruptFlag(),
            "slb_led": [bool(slb & (1 << i)) for i in range(8)],
            "slb_switch": [bool(self.slb.getSwitchState(i)) for i in range(8)],
            "slb_interrupt": self.slb.interrupt_flag,
            "keypad_led": [bool(keypad_leds & mask) for mask in (CKeyPad.LEDBMRE, CKeyPad.LEDBMGN)],
            "keypad_key": self.keypad.getKey(),
            "keypad_beeper": bool(snapshot.get("keypad_beeper", False)) if self.keypad_connected else False,
            "oled": snapshot.get("oled", [" " * 21] * 8),
            "project": self.program.eeprom_project if self.program.storage_path else self.eeprom.readProjectName(),
            "eeprom_bytes": self.program.eeprom_memory[:16],
            "servo_angle": self.servo_angle,
            "servo_us": self.servo.microseconds[int(CServo.SERVO1)],
            "temperature": self.sensors.getAHT20Temperature(),
            "humidity": self.sensors.getAHT20Humidity(),
            "co2": scd.ui16CO2,
            "actors": {
                "relais": self.actors.relais,
                "buzzer": self.actors.buzzer,
                "led": self.actors.led,
            },
            "can": self.program.last_can if running else self.last_can,
        }

    def action(self, data: dict) -> None:
        action = data.get("action")
        if action == "twin_restart":
            if self.program.debug:
                raise ValueError("Bitte zuerst die laufende Debugsitzung beenden.")
            project = self.program.project or self.program_path
            restart_program = bool(self.program.project)
            connected = self.module_connected
            slb_connected = self.slb_connected
            keypad_connected = self.keypad_connected
            self.program.stop()
            replacement = SimulationController(project)
            replacement.module_connected = connected
            replacement.slb_connected = slb_connected
            replacement.keypad_connected = keypad_connected
            self.__dict__.update(replacement.__dict__)
            if restart_program:
                self.action({"action": "program_start", "path": project})
            return
        if action == "program_start":
            self.program_path = str(data.get("path") or self.program_path)
            try:
                self.program.start(self.program_path, debug=data.get("debug") is True)
            except (ValueError, OSError, subprocess.SubprocessError) as error:
                self.program.stop()
                self.program.error = str(error)
                raise ValueError(str(error)) from error
            self._program_inputs()
            return
        if action == "program_debug_continue":
            if not self.program.debug or data.get("processId") != self.program.debug["processId"]:
                raise ValueError("Debug-Prozess stimmt nicht überein.")
            self.program.release_debug()
            return
        if action == "program_stop":
            if data.get("processId") and (not self.program.debug or data["processId"] != self.program.debug["processId"]):
                return
            self.program.stop()
            return
        if action in ("on", "off", "next", "remote_led", "local", "oled"):
            raise ValueError("Ausgänge werden ausschließlich vom laufenden Anwenderprogramm gesteuert.")
        if action == "module_connection":
            connected = data.get("state")
            if not isinstance(connected, bool):
                raise ValueError("Verbindungszustand muss true oder false sein")
            self.module_connected = connected
            if connected:
                self.slb_connected = False
                self.keypad_connected = False
                self.slb = CPortExpRem()
                self.slb.setInterruptMask(0xFF)
            if not connected:
                self.kreuzung.off()
                self.remote = CPortExpOOPExp()
                self.remote.setInterruptMask(0xFF)
            self._program_inputs()
            return
        if action == "slb_connection":
            connected = data.get("state")
            if not isinstance(connected, bool):
                raise ValueError("Verbindungszustand muss true oder false sein")
            self.slb_connected = connected
            if connected:
                self.module_connected = False
                self.keypad_connected = False
                self.kreuzung.off()
                self.remote = CPortExpOOPExp()
                self.remote.setInterruptMask(0xFF)
            else:
                self.slb = CPortExpRem()
                self.slb.setInterruptMask(0xFF)
            self._program_inputs()
            return
        if action == "keypad_connection":
            connected = data.get("state")
            if not isinstance(connected, bool):
                raise ValueError("Verbindungszustand muss true oder false sein")
            self.keypad_connected = connected
            if connected:
                self.module_connected = False
                self.slb_connected = False
                self.kreuzung.off()
                self.remote = CPortExpOOPExp()
                self.remote.setInterruptMask(0xFF)
                self.slb = CPortExpRem()
                self.slb.setInterruptMask(0xFF)
            else:
                self.keypad = CKeyPad()
            self._program_inputs()
            return
        if action in ("on", "off", "next", "remote_led", "remote_switch") and not self.module_connected:
            raise ValueError("Modul 2 ist nicht mit Modul 1 verbunden.")
        if action == "slb_switch" and not self.slb_connected:
            raise ValueError("Modul 3 ist nicht mit Modul 1 verbunden.")
        if action == "keypad_key" and not self.keypad_connected:
            raise ValueError("Modul 4 ist nicht mit Modul 1 verbunden.")
        if action == "main_button":
            side = data.get("side")
            if side not in self.main_buttons:
                raise ValueError("Unbekannter MiniCtrlBox-Taster")
            button = self.main_buttons[side]
            if data.get("state"):
                button.simulatePress()
            else:
                button.simulateRelease()
        elif action == "main_button_reset":
            for button in self.main_buttons.values():
                button.resetPressedFlag()
                button.resetReleasedFlag()
        elif action == "remote_switch":
            self.remote.simulateSwitch(self._index(data, 4), bool(data.get("state")))
        elif action == "slb_switch":
            self.slb.simulateSwitch(self._index(data, 8), bool(data.get("state")))
        elif action == "keypad_key":
            self.keypad.simulateKey(self._index(data, 16), bool(data.get("state")))
        elif action == "eeprom":
            self.eeprom.writeProjectName(str(data.get("text", "")))
            self.program.write_project_name(str(data.get("text", "")))
        elif action == "servo":
            self.servo_angle = max(0.0, min(180.0, float(data.get("angle", 0))))
            self.servo.setMicroseconds(CServo.SERVO1,
                                       self.servo.angleToMicroseconds(self.servo_angle))
        elif action == "sensors":
            temperature = float(data.get("temperature", 20))
            humidity = float(data.get("humidity", 50))
            co2 = int(data.get("co2", 400))
            self.sensors.simulateAHT20(temperature, humidity)
            self.sensors.simulateSCD4x(co2, temperature, humidity)
        elif action == "actor":
            name, value = str(data.get("name")), bool(data.get("state"))
            setters = {
                "relais": self.actors.setRelais,
                "buzzer": self.actors.setBuzzer,
                "led": self.actors.setLED,
            }
            if name not in setters:
                raise ValueError("Unbekannter Aktor")
            setters[name](value)
        elif action == "can":
            payload = str(data.get("text", "")).encode("utf-8")
            if len(payload) > 8:
                raise ValueError("Eine CAN-Nachricht darf maximal 8 UTF-8-Bytes enthalten.")
            identifier = data.get("identifier", 0x1A)
            identifier = int(identifier, 0) if isinstance(identifier, str) else int(identifier)
            if self.program.running:
                self.program.send_can(identifier, payload)
            elif self.can_sender.transmit(CANFrame(identifier, payload)):
                frame = self.can_receiver.receive(10)
                self.last_can = frame.data.decode("utf-8", errors="replace") if frame else ""
            else:
                self.last_can = "Fehler"
        else:
            raise ValueError("Unbekannte Aktion")
        self._program_inputs()

    def _program_inputs(self):
        self.program.inputs(self.main_buttons["left"].state, self.main_buttons["right"].state,
                            self.remote.getSwitchState(), self.module_connected,
                            self.slb.getSwitchState(), self.slb_connected,
                            self.keypad.getKey(), self.keypad_connected)

    @staticmethod
    def _index(data: dict, size: int) -> int:
        index = int(data.get("index", -1))
        if not 0 <= index < size:
            raise ValueError("Ungueltiger Port")
        return index


HTML = r"""<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>MiniCtrlBox – digitaler Zwilling</title>
<style>
:root{font-family:system-ui,sans-serif;color:#e8edf2;background:#111820}body{margin:0;padding:20px}
h1{margin:0 0 16px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:16px}
.card{background:#1c2732;border:1px solid #34495e;border-radius:12px;padding:16px;box-shadow:0 4px 14px #0005}
button,input{font:inherit}.buttons{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
button{background:#2878bd;color:white;border:0;border-radius:7px;padding:8px 13px;cursor:pointer}button:hover{background:#3791db}
.phase{font-size:1rem;font-weight:600;color:#72c5ff;margin-bottom:16px}
.module-card{grid-column:1/-1;min-width:0}.module-layout{display:grid;grid-template-columns:minmax(0,680px) minmax(180px,1fr);gap:28px;align-items:start}.module-layout>div{min-width:0}
.module{position:relative;aspect-ratio:680/440;width:100%;border-radius:6px;background:linear-gradient(120deg,#e4dfd2,#f6f0df 45%,#d7cebb);box-shadow:0 12px 0 #bc7d30,0 17px 18px #0005;color:#3a342a;margin:0 0 22px}
.module:before{content:"";position:absolute;left:-10px;top:28%;height:48%;width:10px;background:repeating-linear-gradient(#302a22 0 9px,#b89a6b 9px 12px);border-radius:3px 0 0 3px}
.screw{position:absolute;width:2.5%;aspect-ratio:1;border-radius:50%;background:linear-gradient(135deg,#34332e,#b6b1a2 45%,#36342d 50%,#c0baaa 58%,#38362f);box-shadow:0 0 0 2px #b9b1a0}.tl{left:2%;top:3%}.tr{right:2%;top:3%}.bl{left:2%;bottom:3%}.br{right:2%;bottom:3%}
.board-lamp{position:absolute;width:4.6%;aspect-ratio:1;border-radius:50%;padding:0;min-width:0;border:2px solid #8e8574;transform:translate(-50%,-50%);box-shadow:inset 2px 2px 5px #0009,1px 2px 2px #fff9;background:var(--off)}
.board-lamp.red{--off:#590e14;--lit:#ff303a}.board-lamp.yellow{--off:#82520b;--lit:#ffc127}.board-lamp.green{--off:#123d24;--lit:#40e66e}.board-lamp.orange{--off:#885209;--lit:#ffa51f}.board-lamp.blue{--off:#183e65;--lit:#53afff}
.board-lamp.small{width:3.1%}.board-lamp.indicator{width:2.5%}.board-lamp.on{background:var(--lit);box-shadow:inset 1px 1px 3px #fff8,0 0 14px var(--lit)}button.board-lamp:hover{background:var(--lit)}button.board-lamp:focus-visible,.module-key:focus-visible{outline:3px solid #1166bf;outline-offset:4px}
.module-label{position:absolute;font-size:clamp(9px,1.1vw,13px);font-weight:600;letter-spacing:.02em;white-space:nowrap}.module-key{position:absolute;left:80%;width:5.5%;aspect-ratio:1;border-radius:50%;padding:0;transform:translate(-50%,-50%);border:2px solid #bb710f;background:radial-gradient(circle at 35% 30%,#ffc047,#ee8e0a);box-shadow:0 3px 0 #a46716;color:#452c0d;font-size:clamp(9px,1.3vw,14px);font-weight:700;touch-action:none;user-select:none}
.module-key:hover{background:#ffb62d}.module-key[aria-pressed=true]{background:#d77e09;box-shadow:inset 0 2px 4px #6d400b}.module-help{color:#aab7c4;font-size:.9rem;line-height:1.6}.module-help strong{color:#e8edf2}.module-controls h3{margin-top:0}.module-controls input[type=number]{width:95px}
@media(max-width:780px){.module-layout{grid-template-columns:minmax(0,1fr)}.module-controls{min-width:0}.grid{grid-template-columns:minmax(0,1fr)}body{padding:12px}.card{padding:14px;min-width:0}.module-label{font-size:10px}.buttons input{min-width:0;max-width:100%;box-sizing:border-box}.oled{overflow-x:auto}}
.ports{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.port{background:#273747;border-radius:8px;padding:8px;text-align:center}
.led{width:25px;height:25px;border-radius:50%;background:#333;margin:5px auto}.led.on{background:#2ee46a;box-shadow:0 0 10px #2e6}
.rgb{width:35px;height:35px;border-radius:50%;margin:8px auto;border:1px solid #667}
.oled{background:#031307;color:#79ff89;font:14px monospace;white-space:pre;min-height:125px;padding:10px;border-radius:6px}
label{display:block;margin:7px 0}input[type=text],input[type=number]{background:#111820;color:#fff;border:1px solid #526476;border-radius:5px;padding:7px}
.status{color:#8ed2ff}small{color:#aab7c4}
.main-layout{grid-template-columns:minmax(0,420px) minmax(0,1fr);gap:36px}.main-unit{position:relative;width:100%;aspect-ratio:1;margin:28px 0 35px;border-radius:7px;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' opacity='.25' filter='url(%23n)'/%3E%3C/svg%3E"),linear-gradient(130deg,#637d99,#455f7c 55%,#748ba1);box-shadow:inset 0 0 0 1px #a2adb5,0 10px 0 #394657,0 15px 20px #0006}
.unit-number{position:absolute;left:0;top:0;width:100%;text-align:center;font-family:Georgia,serif;font-size:clamp(65px,9vw,115px);line-height:1;color:#171817}.main-unit .screw{width:3.3%}
.can-socket{position:absolute;top:-7%;height:7%;width:12%;border-radius:7px 7px 0 0;background:repeating-linear-gradient(0deg,#5d4936 0 2px,#c2a281 2px 4px);box-shadow:inset 4px 0 5px #0006}.can-socket.first{left:23%}.can-socket.second{left:59%}
.expansion-socket{position:absolute;right:-5%;top:50%;transform:translateY(-50%);width:5%;height:48%;background:repeating-linear-gradient(0deg,#c6aa7c 0 4px,#74583e 4px 6px);border-radius:0 6px 6px 0;box-shadow:2px 0 0 #292825}
.main-unit .unit-oled{position:absolute;left:32%;top:38%;width:34%;height:18%;min-height:0;margin:0;padding:2px;box-sizing:border-box;border-radius:1px;border:2px solid #242322;background:linear-gradient(130deg,#1e1118,#100e14);color:#b7e6ff;box-shadow:0 0 0 2px #a99478;overflow:hidden;font:6px/1.1 monospace;white-space:pre}
.unit-rgb{position:absolute;left:74%;width:5.5%;aspect-ratio:1;border-radius:50%;transform:translate(-50%,-50%);background:var(--rgb,#262827);border:2px solid #b8a98d;box-shadow:inset 1px 2px 4px #000,1px 1px 2px #222}.unit-rgb.on{box-shadow:inset 1px 1px 3px #fffa,0 0 13px var(--rgb)}
.main-unit .module-key{width:7%;top:69%;border:1px solid #a45215;background:radial-gradient(circle at 30% 25%,#ffb052,#ff8c27 65%,#da6718);box-shadow:0 1px 2px #382716;font-size:0}.main-unit .module-key[aria-pressed=true]{background:#cc5f0b;box-shadow:inset 1px 2px 4px #572809}.main-unit .key-left{left:19%}.main-unit .key-right{left:80%}
.main-controls h3{margin-top:0}.main-controls .buttons{align-items:center}
@media(max-width:780px){.main-layout{grid-template-columns:minmax(0,1fr)}.main-unit{max-width:420px;margin-left:auto;margin-right:auto}.unit-number{font-size:clamp(65px,22vw,115px)}.main-unit .unit-oled{font-size:clamp(4px,1.45vw,6px)}}
body{max-width:1400px;margin:auto}.tabs{display:flex;gap:6px;border-bottom:1px solid #34495e;margin-bottom:24px}.tabs button{background:transparent;color:#aab7c4;padding:12px 20px;border-radius:7px 7px 0 0;border-bottom:3px solid transparent}.tabs button:hover{background:#1c2732;color:#fff}.tabs button[aria-selected=true]{color:#8ed2ff;background:#1c2732;border-bottom-color:#72c5ff}.tabs button:focus-visible{outline:2px solid #72c5ff;outline-offset:-4px}
[hidden]{display:none!important}.modules-grid,.settings-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.unit-card{min-width:0;padding:24px}.unit-card h2{display:flex;align-items:center;gap:10px;font-size:1.1rem;margin:0 0 18px}.module-badge{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:7px;background:#34495e;color:#b9dfff;font-size:.9rem}.unit-stage{min-height:410px;display:flex;align-items:center;justify-content:center;padding:10px 4px}.unit-stage .main-unit{max-width:340px;flex-shrink:0}.unit-stage .module{max-width:560px}.unit-stage .unit-number{font-size:90px}.unit-stage .unit-oled{font-size:5px}.settings-grid .card{min-width:0}.settings-grid .ports{max-width:none}.settings-grid input[type=text]{min-width:0;max-width:100%;box-sizing:border-box}.settings-grid .module-controls h3{margin-top:0}
@media(max-width:780px){.modules-grid,.settings-grid{grid-template-columns:minmax(0,1fr)}.unit-card{padding:18px}.unit-stage{min-height:0;padding:10px 0}.unit-stage .main-unit{max-width:340px}.unit-stage .unit-number{font-size:clamp(65px,22vw,90px)}.unit-stage .unit-oled{font-size:clamp(4px,1.2vw,5px)}.tabs{margin-bottom:16px}.tabs button{flex:1;padding:12px}}
.modules-grid{align-items:start}.module-settings{min-height:410px}.module-settings h3{margin-top:0}.module-settings .ports{max-width:none}.module-settings input[type=text]{min-width:0;max-width:100%;box-sizing:border-box}.module-settings details{border-top:1px solid #34495e;margin-top:22px;padding-top:16px}.module-settings summary{cursor:pointer;color:#b9dfff;padding:5px 0;font-weight:600}.extra-settings{padding-top:18px}.extra-settings h3:not(:first-child){margin-top:24px}.unit-card>.tabs{margin-bottom:18px}.unit-card>.tabs button[aria-selected=true]{background:#273747}.unit-card>.tabs button{padding:10px 16px}
@media(max-width:780px){.module-settings{min-height:0}}
.connection-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 16px;margin-bottom:20px;border:1px solid #34495e;border-radius:9px;background:#1c2732;color:#aab7c4;font-size:.95rem}.connection-toolbar.connected{border-color:#3f977d;color:#8ee9c2}.connection-layout{position:relative}
.module:before{display:none}.module-input{position:absolute;left:-10px;top:28%;height:48%;width:10px;background:repeating-linear-gradient(#302a22 0 9px,#b89a6b 9px 12px);border-radius:3px 0 0 3px}.module-link-status{font-size:.85rem;color:#aab7c4;margin:-8px 0 16px}.linked .module-link-status{color:#8ee9c2}.unlinked .module{filter:saturate(.35)}button:disabled,input:disabled{cursor:not-allowed;opacity:.45}.board-lamp:disabled:hover{background:var(--off)}.module-key:disabled:hover{background:#bb8d40}
@media(max-width:520px){.connection-toolbar{align-items:flex-start;font-size:.85rem}.connection-toolbar button{flex-shrink:0}}
.unit-stage{height:450px;min-height:0;box-sizing:border-box}.unit-stage .main-unit,.unit-stage .module{margin:28px 0 35px}.module-input{top:50%;transform:translateY(-50%)}#module-1 .unit-stage{justify-content:flex-end}#module-2 .unit-stage{justify-content:flex-start}
@media(max-width:780px){.unit-stage{height:auto;padding-left:8px;padding-right:18px}#module-1 .unit-stage,#module-2 .unit-stage{justify-content:center}.unit-stage .main-unit,.unit-stage .module{margin-top:28px;margin-bottom:24px}}

.coupled-card{padding:24px;border-color:#3f977d;min-width:0}.coupled-card>h2{font-size:1.15rem;margin:0 0 18px}.assembly-stage{padding:36px 8px 26px;container-type:inline-size}.assembly-rig{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.5454545fr);gap:3.78007%;align-items:center;width:100%;max-width:1020px;margin:auto}.assembly-rig .main-unit,.assembly-rig .module{width:100%;margin:0;max-width:none;min-width:0}.assembly-rig .main-unit{container-type:inline-size}.assembly-rig .unit-number{font-size:26cqw}.assembly-rig .unit-oled{font-size:1.7cqw}.assembly-rig .module-input{width:3.235294%;left:-3.235294%;box-shadow:0 0 0 1px #80d2b4}.assembly-rig .expansion-socket{box-shadow:0 0 0 1px #80d2b4}.assembly-rig .module-label{font-size:clamp(5px,.9vw,12px)}.assembly-rig .module-key{font-size:clamp(6px,1vw,13px)}.assembly-rig .main-unit .module-key{font-size:0}.assembly-settings{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px}.assembly-settings>section{min-width:0}.assembly-settings>section>h3{color:#8ee9c2;margin-top:0}.assembly-settings .module-settings{min-height:0}
@media(max-width:780px){.coupled-card{padding:18px}.assembly-stage{padding:28px 0 20px}.assembly-settings{grid-template-columns:minmax(0,1fr)}}
.street-scene{position:relative;width:100%;max-width:900px;aspect-ratio:760/460;margin:16px auto 24px;overflow:hidden;border-radius:12px;background:radial-gradient(ellipse at 20% 20%,#75935c,#4b6c42);box-shadow:inset 0 0 45px #17392477;container-type:inline-size}.road{position:absolute;background:#414951;box-shadow:0 0 0 5px #bfc1b9,0 0 0 9px #6f7975}.road.horizontal{left:0;top:38%;width:100%;height:24%}.road.vertical{left:39%;top:0;width:22%;height:100%}.lane{position:absolute;opacity:.85}.lane.horizontal{left:0;top:49.5%;width:100%;height:1%;background:repeating-linear-gradient(90deg,#eee9ca 0 4%,transparent 4% 8%)}.lane.vertical{left:49.5%;top:0;height:100%;width:.7%;background:repeating-linear-gradient(0deg,#eee9ca 0 18px,transparent 18px 36px)}.junction{position:absolute;left:39%;top:38%;width:22%;height:24%;background:#414951}.crosswalk{position:absolute;background:repeating-linear-gradient(90deg,#f0eee3 0 9%,transparent 9% 17%)}.crosswalk.north{left:40%;top:29%;width:20%;height:5%}.crosswalk.south{left:40%;top:67%;width:20%;height:5%}.crosswalk.west{left:31%;top:39%;width:4%;height:22%;background:repeating-linear-gradient(0deg,#f0eee3 0 9%,transparent 9% 17%)}.crosswalk.east{left:65%;top:39%;width:4%;height:22%;background:repeating-linear-gradient(0deg,#f0eee3 0 9%,transparent 9% 17%)}
.street-signal{position:absolute;width:5.5%;z-index:2;filter:drop-shadow(5px 7px 4px #0006)}.street-signal:after{content:"";position:absolute;left:44%;top:100%;width:12%;height:35%;background:linear-gradient(90deg,#737a7e,#d2d7d6,#747c7c)}.signal-housing{padding:12% 15%;border:2px solid #444a4c;border-radius:10px;background:linear-gradient(90deg,#171d21,#30383b 55%,#13191c);display:grid;gap:7px}.street-lamp{position:relative;aspect-ratio:1;border-radius:50%;background:var(--dim);box-shadow:inset 0 4px 5px #000c;border-top:3px solid #0b1012}.street-lamp.red{--dim:#4b1b1f;--lit:#ff383d}.street-lamp.yellow{--dim:#504421;--lit:#ffd343}.street-lamp.green{--dim:#123b2c;--lit:#35ef88}.street-lamp.on{background:var(--lit);box-shadow:0 0 17px var(--lit),inset 0 0 7px #fff8}.street-lamp:after{content:"";position:absolute;inset:0;border-radius:50%;background:radial-gradient(#fff2 1px,transparent 1px) 0 0/3px 3px}.street-label{position:absolute;font-size:clamp(9px,1.3cqw,14px);font-weight:600;color:white;text-shadow:0 1px 3px #000;background:#16362b99;padding:5px 8px;border-radius:5px}.traffic-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.traffic-toolbar .phase{margin:0}.traffic-toolbar .buttons{margin:0}.street-scene.inactive{filter:saturate(.35)}
@media(max-width:520px){.signal-housing{border-width:1px;border-radius:4px;gap:2px}.street-lamp{border-top-width:1px}.street-label{font-size:8px;padding:3px}.traffic-toolbar .buttons{gap:5px}.traffic-toolbar button{padding:7px 9px}}
.street-signal.pedestrian{width:5.5%}.pedestrian .street-lamp{display:block;width:100%;padding:0;background:#11191b;color:var(--dim);border:0;border-top:3px solid #0b1012;box-shadow:inset 0 2px 5px #000c}.pedestrian .street-lamp:hover{background:#1a2427}.pedestrian .street-lamp.on{color:var(--lit);background:#11191b;box-shadow:0 0 10px color-mix(in srgb,var(--lit) 25%,transparent)}.pedestrian .street-lamp svg{display:block;width:90%;height:90%;margin:5%;fill:currentColor;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}.pedestrian .street-lamp.on svg{filter:drop-shadow(0 0 3px var(--lit))}.pedestrian .street-lamp:disabled{opacity:1;cursor:not-allowed}.pedestrian-note{display:block;margin:14px 0 0;color:#aab7c4;line-height:1.5}
.module-visual{position:relative;width:100%;max-width:560px;aspect-ratio:680/440;margin:28px 0 35px;min-width:0}.module-visual>.module{width:100%;margin:0!important}.visual-switch{position:absolute;right:0;top:-34px;display:flex;gap:3px;background:#111820;border:1px solid #526476;border-radius:6px;padding:2px;z-index:3}.visual-switch button{font-size:11px;padding:4px 9px;background:transparent;color:#aab7c4;border-radius:4px}.visual-switch button[aria-pressed=true]{background:#2878bd;color:white}.inline-traffic{width:100%;height:100%}.inline-traffic .street-scene{width:100%;height:100%;max-width:none;aspect-ratio:auto;margin:0;border-radius:6px}.inline-traffic .street-label{font-size:clamp(4px,1.5cqw,12px);padding:.7cqw 1cqw}.assembly-rig>.module-visual{width:100%;max-width:none;margin:0}.module-visual .module-input{z-index:2}.program-path,.main-controls input[type=text]{width:100%;box-sizing:border-box}.program-banner{color:#aab7c4;margin:0 0 14px;font-size:.9rem;overflow-wrap:anywhere}#program-status{white-space:pre-wrap;overflow-wrap:anywhere}.visual-switch button:focus-visible{outline:2px solid #8ed2ff;outline-offset:1px}.pedestrian .street-lamp{cursor:default}
@media(max-width:780px){.module-visual{margin-top:34px;margin-bottom:24px}.assembly-rig .visual-switch{top:-28px}.assembly-rig .visual-switch button{font-size:9px;padding:3px 6px}}
.direction-arrow{position:absolute;fill:none;stroke:#f4f0d9;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;opacity:.85}.direction-arrow.east{left:7%;top:53%;width:13%;height:5%}.direction-arrow.north{left:53%;top:82%;width:4%;height:12%}.stop-line{position:absolute;background:#f4f0d9}.stop-line.west{left:28.5%;top:51%;width:.7%;height:10%}.stop-line.south{left:51%;top:74%;width:9%;height:1%}
.street-signal.pair-highlight .signal-housing{outline:2px solid #b9dfff;outline-offset:3px}.street-signal:focus{outline:none}
.traffic-pair{position:absolute;width:12.5%;z-index:2}.traffic-pair:before{content:"";position:absolute;left:22%;top:38%;width:56%;height:4px;background:linear-gradient(#d2d7d6,#737a7e);box-shadow:0 2px 3px #0005;z-index:1}.traffic-pair>.street-signal.vehicle{position:relative;left:0;top:0;width:44%}.traffic-pair>.street-signal.pedestrian{left:56%;top:0;width:44%}.traffic-pair>.street-signal.pedestrian:after{display:none}
.main-unit{container-type:inline-size}.main-unit .unit-oled{left:16%;top:32%;width:54%;height:32%;padding:1px;border-width:1px;font-size:3.2cqw;line-height:1.1;cursor:zoom-in;text-align:left}.main-unit .unit-oled:focus-visible{outline:2px solid #8ed2ff;outline-offset:4px}#oled-zoom{background:#1c2732;color:#e8edf2;border:1px solid #526476;border-radius:12px;padding:20px;max-width:calc(100vw - 64px)}#oled-zoom::backdrop{background:#0009}.oled-zoom-header{display:flex;justify-content:space-between;align-items:center;gap:24px;margin-bottom:16px}.oled-zoom-header h2{font-size:1.1rem;margin:0}#oled-zoom-text{margin:0;padding:18px;background:#071016;color:#b7e6ff;border:2px solid #36434e;border-radius:4px;white-space:pre;font:clamp(12px,3.2vw,24px)/1.25 monospace;min-height:10em}
.slb-board{position:relative;width:min(100%,430px);aspect-ratio:3/4;border-radius:8px;background:linear-gradient(135deg,#a7adb1,#626b72 48%,#bbc0c3);box-shadow:inset 0 0 0 2px #d7dcdf,0 12px 0 #3d464d,0 17px 20px #0006;display:grid;grid-template-columns:1fr 1fr;gap:8%;align-items:center;padding:12% 17%;box-sizing:border-box}.slb-board:before{content:"SwitchLEDBoard";position:absolute;left:48%;top:50%;transform:translate(-50%,-50%) rotate(90deg);font-weight:800;letter-spacing:.1em;color:#3d2525;opacity:.8}.slb-column{display:grid;grid-template-rows:repeat(8,1fr);gap:8px;height:100%;align-items:center}.slb-led{width:28px;aspect-ratio:1;border-radius:50%;margin:auto;background:var(--dim);border:2px solid #d7d0be;box-shadow:inset 2px 2px 5px #000b}.slb-led.on{background:var(--lit);box-shadow:inset 1px 1px 3px #fff9,0 0 15px var(--lit)}.slb-led.red{--dim:#56171a;--lit:#ff3038}.slb-led.yellow{--dim:#70550d;--lit:#ffd12d}.slb-led.green{--dim:#153e27;--lit:#3aeb7c}.slb-led.blue{--dim:#174060;--lit:#42b7ff}.slb-switch{position:relative;width:34px;height:24px;margin:auto;padding:0;background:#252a2d;border:2px solid #c9c4b7;border-radius:12px;box-shadow:inset 0 2px 4px #000}.slb-switch:after{content:"";position:absolute;width:12px;height:12px;border-radius:50%;left:4px;top:4px;background:#ddd;transition:left .12s}.slb-switch[aria-pressed=true]:after{left:14px;background:#8ee9c2}.slb-switch:hover{background:#343b3f}.slb-labels{display:flex;justify-content:space-between;color:#aab7c4;font-size:.85rem;margin-top:12px}
.unlinked .slb-board,.unlinked .keypad-board{filter:saturate(.3)}.keypad-board{width:min(100%,390px);border-radius:9px;background:linear-gradient(145deg,#546370,#2e3942);box-shadow:inset 0 0 0 2px #82909a,0 12px 0 #202930,0 17px 20px #0006;padding:34px;box-sizing:border-box}.keypad-indicators{display:flex;justify-content:center;gap:30px;margin-bottom:24px}.keypad-indicator{width:24px;aspect-ratio:1;border-radius:50%;background:#232829;border:2px solid #9ea7a9}.keypad-indicator.red.on{background:#ff3840;box-shadow:0 0 14px #ff3840}.keypad-indicator.green.on{background:#3bea79;box-shadow:0 0 14px #3bea79}.keypad-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.keypad-key{aspect-ratio:1;border-radius:8px;background:#172027;border:1px solid #95a1a8;color:#edf5f7;font-weight:700;box-shadow:0 4px 0 #0b1014}.keypad-key[aria-pressed=true]{transform:translateY(3px);box-shadow:0 1px 0 #0b1014;background:#2878bd}.keypad-beeper{text-align:center;margin-top:20px;color:#aab7c4}.keypad-beeper.on{color:#ffd76b;text-shadow:0 0 8px #ffd76b}
</style></head><body>
<h1>MiniCtrlBox – digitaler Zwilling</h1>
<p id="program-banner" class="program-banner" role="status">Kein Anwenderprogramm läuft · Alle Ampeln aus</p>
<div class="buttons"><button id="twin-restart" onclick="restartTwin()" title="Twin und zuletzt geladenes Programm neu starten; EEPROM bleibt erhalten">Twin neu starten</button></div>
<p id="twin-status" class="status" role="status" aria-live="polite"></p>
<div class="connection-toolbar"><span id="connection-status" role="status">Modul 1 → Modul 2 · Getrennt</span><button id="connection-toggle" onclick="toggleConnection()">Verbinden</button></div>
<div class="connection-toolbar"><span id="slb-connection-status" role="status">Modul 1 → Modul 3 · Getrennt</span><button id="slb-connection-toggle" onclick="toggleSLBConnection()">Verbinden</button></div>
<div class="connection-toolbar"><span id="keypad-connection-status" role="status">Modul 1 → Modul 4 · Getrennt</span><button id="keypad-connection-toggle" onclick="toggleKeyPadConnection()">Verbinden</button></div>
<div id="connection-layout" class="connection-layout" role="group" aria-label="Module">

<article id="coupled-card" class="card coupled-card" hidden>
<h2 id="coupled-title">MiniCtrlBox + Kreuzungsmodul</h2>
<nav class="tabs" role="tablist" aria-labelledby="coupled-title">
<button id="tab-coupled-view" role="tab" aria-selected="true" aria-controls="panel-coupled-view" tabindex="0">Ansicht</button>
<button id="tab-coupled-settings" role="tab" aria-selected="false" aria-controls="panel-coupled-settings" tabindex="-1">Einstellungen</button>
</nav>
<div id="panel-coupled-view" role="tabpanel" aria-labelledby="tab-coupled-view">
<div class="assembly-stage"><div id="assembly-rig" class="assembly-rig" role="group" aria-label="Direkt zusammengesteckte Module 1 und 2"></div></div>
</div>
<div id="panel-coupled-settings" class="assembly-settings" role="tabpanel" aria-labelledby="tab-coupled-settings" hidden>
<section id="assembly-settings-1"><h3>Modul 1</h3></section><section id="assembly-settings-2"><h3>Modul 2</h3></section>
</div></article>
<div id="separate-modules" class="modules-grid">
<article id="module-1" class="card unit-card"><h2 id="module-1-title"><span class="module-badge">1</span> MiniCtrlBox</h2><p class="module-link-status">Erweiterungsanschluss rechts</p><nav class="tabs" role="tablist" aria-labelledby="module-1-title">
<button id="tab-1-view" role="tab" aria-selected="true" aria-controls="panel-1-view" tabindex="0">Ansicht</button>
<button id="tab-1-settings" role="tab" aria-selected="false" aria-controls="panel-1-settings" tabindex="-1">Einstellungen</button>
</nav>
<div id="panel-1-view" class="tab-panel" role="tabpanel" aria-labelledby="tab-1-view"><div class="unit-stage"><div class="main-unit" role="group" aria-label="MiniCtrlBox Modul 1 nach Hardwarevorlage">
<span class="can-socket first" title="CAN-Anschluss"></span><span class="can-socket second" title="CAN-Anschluss"></span><span id="module-1-socket" class="expansion-socket" title="Erweiterungsanschluss zu Modul 2"></span>
<span class="screw tl"></span><span class="screw tr"></span><span class="screw bl"></span><span class="screw br"></span>
<span class="unit-number">1</span><div id="oled" class="oled unit-oled" role="button" tabindex="0" aria-label="OLED-Display vergrößern" aria-haspopup="dialog" onclick="openOLED()"></div>
<div class="unit-rgb" id="unit-rgb-0" style="top:40%" role="img" aria-label="RGB-LED 0"></div>
<div class="unit-rgb" id="unit-rgb-1" style="top:54%" role="img" aria-label="RGB-LED 1"></div>
<button id="main-key-left" class="module-key key-left" aria-label="Linker Taster 2" aria-pressed="false" title="Linker Taster 2"></button>
<button id="main-key-right" class="module-key key-right" aria-label="Rechter Taster 1" aria-pressed="false" title="Rechter Taster 1"></button>
</div></div></div>
<div id="panel-1-settings" class="tab-panel module-settings" role="tabpanel" aria-labelledby="tab-1-settings" hidden><div class="main-controls"><h3>Anwenderprogramm</h3>
<label>Projektordner <input id="program-path" type="text" aria-label="Projektordner des C++-Programms"></label>
<div class="buttons"><button id="program-start" onclick="startProgram()">Programm starten</button><button id="program-stop" onclick="act('program_stop')">Programm stoppen</button></div>
<div id="program-status" class="status" role="status"></div>
</div><details><summary>EEPROM und CAN-Bus</summary><div class="extra-settings"><h3>EEPROM</h3>
<div class="buttons"><input id="project" type="text" placeholder="Projektname"><button onclick="textAct('eeprom','project')">EEPROM speichern</button></div><div id="projectState" class="status"></div>
<div id="eepromBytes" class="status"></div>
<h3>CAN-Bus</h3><div class="buttons"><label>CAN-ID <input id="canId" value="0x1A" aria-label="CAN-Identifier"></label><input id="canText" maxlength="8" value="Hallo"><button onclick="textAct('can','canText')">Senden</button></div><div id="canState" class="status"></div><p>Bei laufendem Programm wird an dessen CAN-Eingang gesendet. Empfang zeigt die Antwort des Programms.</p></div></details>
<details><summary>Weitere Simulatorfunktionen</summary><div class="extra-settings"><h3>Servo, Sensoren und Aktoren</h3>
<label>Servo: <input id="servo" type="range" min="0" max="180" value="90" oninput="act('servo',{angle:+this.value})"> <span id="servoState"></span></label>
<label>Temperatur °C <input id="temp" type="number" value="20" step="0.1"></label>
<label>Feuchte % <input id="hum" type="number" value="50" step="0.1"></label>
<label>CO₂ ppm <input id="co2" type="number" value="400"></label><button onclick="sensors()">Sensorwerte übernehmen</button><div id="sensorState" class="status"></div>
<div class="buttons"><label><input id="relais" type="checkbox" onchange="actor('relais',this.checked)"> Relais</label><label><input id="buzzer" type="checkbox" onchange="actor('buzzer',this.checked)"> Buzzer</label><label><input id="actorLed" type="checkbox" onchange="actor('led',this.checked)"> LED</label></div></div></details></div></article>
<article id="module-2" class="card unit-card"><h2 id="module-2-title"><span class="module-badge">2</span> Kreuzungsmodul</h2><p id="module-2-status" class="module-link-status">Nicht verbunden · inaktiv</p><nav class="tabs" role="tablist" aria-labelledby="module-2-title">
<button id="tab-2-view" role="tab" aria-selected="true" aria-controls="panel-2-view" tabindex="0">Ansicht</button>
<button id="tab-2-settings" role="tab" aria-selected="false" aria-controls="panel-2-settings" tabindex="-1">Einstellungen</button>
</nav>
<div id="panel-2-view" class="tab-panel" role="tabpanel" aria-labelledby="tab-2-view"><div class="unit-stage"><div id="module-2-visual" class="module-visual"><div class="visual-switch" role="group" aria-label="Ansicht von Modul 2">
<button id="visual-hardware" aria-pressed="true" onclick="chooseVisual('hardware')">Modul</button>
<button id="visual-traffic" aria-pressed="false" onclick="chooseVisual('traffic')">Ampeln</button>
</div><span id="module-2-socket" class="module-input" title="Erweiterungsanschluss zu Modul 1"></span><div class="module" role="group" aria-label="Kreuzungsmodul nach Hardwarevorlage">
<span class="screw tl"></span><span class="screw tr"></span><span class="screw bl"></span><span class="screw br"></span>
<div id="lamp-h-0" class="board-lamp red" style="left:30%;top:35%" role="img" aria-label="Fahrzeugampel waagerecht: Rot"></div>
<div id="lamp-h-1" class="board-lamp yellow" style="left:36.5%;top:35%" role="img" aria-label="Fahrzeugampel waagerecht: Gelb"></div>
<div id="lamp-h-2" class="board-lamp green" style="left:43%;top:35%" role="img" aria-label="Fahrzeugampel waagerecht: Grün"></div>
<div id="lamp-v-0" class="board-lamp red" style="left:30%;top:52%" role="img" aria-label="Fahrzeugampel senkrecht: Rot"></div>
<div id="lamp-v-1" class="board-lamp yellow" style="left:30%;top:62%" role="img" aria-label="Fahrzeugampel senkrecht: Gelb"></div>
<div id="lamp-v-2" class="board-lamp green" style="left:30%;top:72%" role="img" aria-label="Fahrzeugampel senkrecht: Grün"></div>
<div id="board-extras"></div><div id="board-keys"></div>
</div><div id="panel-2-traffic" class="inline-traffic" role="region" aria-label="Ampelansicht" hidden>
<div class="street-scene" id="street-scene" role="group" aria-label="Straßenkreuzung mit zwei Fahrzeugampeln und zwei Fußgängerampeln">
<div class="road horizontal"></div><div class="road vertical"></div><div class="lane horizontal"></div><div class="lane vertical"></div><div class="junction"></div>
<div class="crosswalk south"></div><div class="crosswalk west"></div>
<div class="stop-line west"></div><div class="stop-line south"></div>
<svg class="direction-arrow east" viewBox="0 0 40 12" role="img" aria-label="Fahrtrichtung nach rechts"><path d="M3 6H36M30 1L36 6L30 11"/></svg>
<svg class="direction-arrow north" viewBox="0 0 12 40" role="img" aria-label="Fahrtrichtung nach oben"><path d="M6 37V4M1 10L6 4L11 10"/></svg>
<div id="street-signals"></div></div>
</div>
</div></div></div>
<div id="panel-2-settings" class="tab-panel module-settings" role="tabpanel" aria-labelledby="tab-2-settings" hidden><div class="module-controls"><h3>Programmsteuerung</h3>
<p class="module-help">Die Ampeln zeigen nur die Ausgaben des laufenden Anwenderprogramms. Ohne Programm bleiben alle Lichter aus.</p>
<div id="phase" class="phase"></div><div id="interrupt" class="status" role="status"></div>
</div></div></article>
<article id="module-3" class="card unit-card"><h2><span class="module-badge">3</span> SwitchLEDBoard</h2><p id="module-3-status" class="module-link-status">Nicht verbunden · inaktiv</p>
<div class="unit-stage"><div><div class="slb-board" role="group" aria-label="SwitchLEDBoard mit acht LEDs und acht Schaltern"><div id="slb-leds" class="slb-column"></div><div id="slb-switches" class="slb-column"></div></div><div class="slb-labels"><span>LED 0–7</span><span>Schalter S0–S7</span></div></div></div>
<div id="slb-interrupt" class="status" role="status"></div><p class="module-help">Die LEDs werden ausschließlich über <code>CPortExpRem</code> vom laufenden Anwenderprogramm gesteuert.</p></article>
<article id="module-4" class="card unit-card"><h2><span class="module-badge">4</span> Tastaturmodul</h2><p id="module-4-status" class="module-link-status">Nicht verbunden · inaktiv</p>
<div class="unit-stage"><div class="keypad-board" role="group" aria-label="Tastaturmodul mit 16 Tasten"><div class="keypad-indicators"><div id="keypad-led-0" class="keypad-indicator red" role="img" aria-label="Rote Keypad-LED"></div><div id="keypad-led-1" class="keypad-indicator green" role="img" aria-label="Grüne Keypad-LED"></div></div><div id="keypad-grid" class="keypad-grid"></div><div id="keypad-beeper" class="keypad-beeper">Beeper</div></div></div>
<p class="module-help">Tasten, LEDs und Beeper werden über <code>CKeyPad</code> nach MiniCtrlBoxLib 6.12 simuliert.</p></article>
</div>
</div>
<dialog id="oled-zoom" aria-labelledby="oled-zoom-title"><div class="oled-zoom-header"><h2 id="oled-zoom-title">OLED-Display</h2><button onclick="document.getElementById('oled-zoom').close()">Schließen</button></div><pre id="oled-zoom-text" aria-label="OLED-Inhalt"></pre></dialog>
<script>
const $=id=>document.getElementById(id);let state={},actionQueue=Promise.resolve(),twinRestarting=false;
async function api(path,body){let o={};if(body)o={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)};let r=await fetch(path,o);if(!r.ok)throw Error(await r.text());return r.json()}
function act(action,extra={}){actionQueue=actionQueue.catch(()=>{}).then(async()=>{state=await api('/api/action',{action,...extra});render()});return actionQueue}
function textAct(action,id){act(action,{text:$(id).value,...(action==='can'?{identifier:$('canId').value}:{})})}function actor(name,v){act('actor',{name,state:v})}
function sensors(){act('sensors',{temperature:+$('temp').value,humidity:+$('hum').value,co2:+$('co2').value})}
async function restartTwin(){
 if(twinRestarting)return;
 twinRestarting=true;$('twin-restart').disabled=true;$('twin-status').textContent='Twin wird neu gestartet …';
 for(const i of [...heldKeys])setKey(i,false);for(const i of [...heldKeyPadKeys])setKeyPadKey(i,false);for(const side of [...heldMainKeys])setMainKey(side,false);
 try{await act('twin_restart');$('twin-status').textContent='Twin neu gestartet. EEPROM bleibt erhalten.'}
 catch(error){$('twin-status').textContent=error.message}
 finally{twinRestarting=false;$('twin-restart').disabled=!!state.program_debug}
}
async function startProgram(){
 $('program-start').disabled=true;$('program-status').textContent='C++-Programm wird gebaut …';
 try{await act('program_start',{path:$('program-path').value})}catch(error){$('program-status').textContent=error.message}finally{$('program-start').disabled=false}
}
function chooseVisual(mode){
 document.querySelector('#module-2-visual > .module').hidden=mode==='traffic';$('panel-2-traffic').hidden=mode!=='traffic';
 $('visual-hardware').setAttribute('aria-pressed',String(mode!=='traffic'));$('visual-traffic').setAttribute('aria-pressed',String(mode==='traffic'));
}
function openOLED(){$('oled-zoom-text').textContent=(state.oled||[]).join('\n');if(!$('oled-zoom').open)$('oled-zoom').showModal()}
$('oled').addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openOLED()}});
function toggleConnection(){for(const i of [...heldKeys])setKey(i,false);for(const i of [...heldKeyPadKeys])setKeyPadKey(i,false);return act('module_connection',{state:!state.module_connected})}
function toggleSLBConnection(){for(const i of [...heldKeys])setKey(i,false);for(const i of [...heldKeyPadKeys])setKeyPadKey(i,false);return act('slb_connection',{state:!state.slb_connected})}
function toggleKeyPadConnection(){for(const i of [...heldKeys])setKey(i,false);for(const i of [...heldKeyPadKeys])setKeyPadKey(i,false);return act('keypad_connection',{state:!state.keypad_connected})}
const hardwareNodes=[document.querySelector('.main-unit'),$('module-2-visual')];
const hardwareHomes=hardwareNodes.map(node=>node.parentElement);
const settingsNodes=[$('panel-1-settings'),$('panel-2-settings')];
const settingsHomes=settingsNodes.map(node=>node.parentElement);
let couplingLayout;
function syncCoupling(connected){
 if(couplingLayout===connected)return;couplingLayout=connected;
 if(connected){
  hardwareNodes.forEach(node=>$('assembly-rig').appendChild(node));
  settingsNodes.forEach((node,i)=>{$('assembly-settings-'+(i+1)).appendChild(node);node.hidden=false});
  selectTab($('tab-coupled-view'));
 }else{
  hardwareNodes.forEach((node,i)=>hardwareHomes[i].appendChild(node));
  settingsNodes.forEach((node,i)=>{settingsHomes[i].appendChild(node);node.hidden=$('tab-'+(i+1)+'-settings').getAttribute('aria-selected')!=='true'});
 }
 $('coupled-card').hidden=!connected;$('separate-modules').hidden=connected;
}
const extraLamps=[
 {color:'red',x:30,y:23,kind:'small'}, {color:'green',x:35.5,y:23,kind:'small'},
 {color:'red',x:37,y:52,kind:'small'}, {color:'green',x:37,y:61,kind:'small'},
 {color:'orange',x:72,y:22,kind:'indicator'}, {color:'orange',x:72,y:42,kind:'indicator'},
 {color:'blue',x:72,y:62,kind:'indicator'}, {color:'blue',x:72,y:82,kind:'indicator'}
];
const streetSignals=[{channel:'ew',x:25,y:34},{channel:'ns',x:64,y:43}];
const pedestrianSignals=[{leds:[0,1]},{leds:[2,3]}];
const pedestrianIcons=[`<circle cx="12" cy="4" r="2" stroke="none"/><path d="M9 9V14M15 9V14M12 8V15M10 9H14M12 15L9 21M12 15L15 21" fill="none"/>`,`<circle cx="14" cy="4" r="2" stroke="none"/><path d="M12 8L10 14L6 19M12 8L17 12L20 10M12 8L8 9L5 13M10 14L15 16L16 21" fill="none"/>`];
$('street-signals').innerHTML=streetSignals.map((signal,n)=>`<div class="traffic-pair" style="left:${signal.x}%;top:${signal.y}%" role="group" aria-label="Fahrzeug- und Fußgängerampel an einem gemeinsamen Mast"><div class="street-signal vehicle" data-pair="${n}" tabindex="0" title="Fahrzeugampel mit zugehöriger Fußgängerampel"><div class="signal-housing">${['red','yellow','green'].map((color,i)=>`<div id="street-${n}-${i}" class="street-lamp ${color}" role="img" aria-label="Fahrzeugampel ${n===0?'links':'rechts'}: ${['Rot','Gelb','Grün'][i]}"></div>`).join('')}</div></div><div class="street-signal pedestrian" data-pair="${n}" tabindex="0" title="Fußgängerampel am selben Mast"><div class="signal-housing">${['red','green'].map((color,i)=>`<div role="img" id="pedestrian-${n}-${i}" class="street-lamp ${color}" aria-label="Zugehörige Fußgängerampel: ${i===0?'Rot':'Grün'}"><svg viewBox="0 0 24 24" aria-hidden="true">${pedestrianIcons[i]}</svg></div>`).join('')}</div></div></div>`).join('');
$('board-extras').innerHTML=extraLamps.map((l,i)=>`<div role="img" id="extra-${i}" class="board-lamp ${l.color} ${l.kind}" style="left:${l.x}%;top:${l.y}%" aria-label="LED${i+6}" title="LED${i+6}" ></div>`).join('');
$('board-keys').innerHTML=Array.from({length:4},(_,i)=>`<button class="module-key" id="key-${i}" style="top:${22+i*20}%" aria-label="Taster ${i+1}" aria-pressed="false" title="Taster ${i+1}"></button>`).join('');
$('slb-leds').innerHTML=['red','yellow','green','blue','red','yellow','green','blue'].map((color,i)=>`<div id="slb-led-${i}" class="slb-led ${color}" role="img" aria-label="LED ${i}"></div>`).join('');
$('slb-switches').innerHTML=Array.from({length:8},(_,i)=>`<button id="slb-switch-${i}" class="slb-switch" aria-label="Schalter S${i}" aria-pressed="false" title="Schalter S${i}"></button>`).join('');
for(let i=0;i<8;i++)$('slb-switch-'+i).addEventListener('click',()=>act('slb_switch',{index:i,state:!state.slb_switch[i]}));
$('keypad-grid').innerHTML=['1','2','3','A','4','5','6','B','7','8','9','C','*','0','#','D'].map((label,i)=>`<button id="keypad-key-${i}" class="keypad-key" aria-label="Taste ${label}" aria-pressed="false">${label}</button>`).join('');
const heldKeys=new Set();
const heldKeyPadKeys=new Set();
function highlightPair(pair){for(const signal of document.querySelectorAll('.street-signal[data-pair]'))signal.classList.toggle('pair-highlight',signal.dataset.pair===pair)}
for(const signal of document.querySelectorAll('.street-signal[data-pair]')){
 signal.addEventListener('mouseenter',()=>highlightPair(signal.dataset.pair));signal.addEventListener('mouseleave',()=>highlightPair(null));
 signal.addEventListener('focus',()=>highlightPair(signal.dataset.pair));signal.addEventListener('blur',()=>highlightPair(null));
}
function setKey(i,pressed){if(heldKeys.has(i)===pressed)return;pressed?heldKeys.add(i):heldKeys.delete(i);$('key-'+i).setAttribute('aria-pressed',String(pressed));act('remote_switch',{index:i,state:pressed})}
function setKeyPadKey(i,pressed){if(heldKeyPadKeys.has(i)===pressed)return;pressed?heldKeyPadKeys.add(i):heldKeyPadKeys.delete(i);$('keypad-key-'+i).setAttribute('aria-pressed',String(pressed));act('keypad_key',{index:i,state:pressed})}
const heldMainKeys=new Set();
function setMainKey(side,pressed){if(heldMainKeys.has(side)===pressed)return;pressed?heldMainKeys.add(side):heldMainKeys.delete(side);$('main-key-'+side).setAttribute('aria-pressed',String(pressed));act('main_button',{side,state:pressed})}
function bindMomentary(key,setPressed){
 key.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();key.focus();key.setPointerCapture(e.pointerId);setPressed(true)});
 for(const event of ['pointerup','pointercancel','lostpointercapture','blur'])key.addEventListener(event,()=>setPressed(false));
 key.addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();setPressed(true)}});
 key.addEventListener('keyup',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();setPressed(false)}});
}
for(let i=0;i<4;i++)bindMomentary($('key-'+i),pressed=>setKey(i,pressed));
for(let i=0;i<16;i++)bindMomentary($('keypad-key-'+i),pressed=>setKeyPadKey(i,pressed));
for(const side of ['left','right'])bindMomentary($('main-key-'+side),pressed=>setMainKey(side,pressed));
window.addEventListener('blur',()=>{for(const i of [...heldKeys])setKey(i,false);for(const i of [...heldKeyPadKeys])setKeyPadKey(i,false);for(const side of [...heldMainKeys])setMainKey(side,false)});
function selectTab(tab){
 const card=tab.closest('.unit-card,.coupled-card'),viewTabs=[...tab.closest('[role=tablist]').querySelectorAll('[role=tab]')];
 if(card.id!=='module-2'){for(const side of [...heldMainKeys])setMainKey(side,false)}if(card.id!=='module-1'){for(const i of [...heldKeys])setKey(i,false)}
 for(const item of viewTabs){const selected=item===tab;item.setAttribute('aria-selected',String(selected));item.tabIndex=selected?0:-1;$(item.getAttribute('aria-controls')).hidden=!selected}
}
for(const tablist of document.querySelectorAll('[role=tablist]')){const viewTabs=[...tablist.querySelectorAll('[role=tab]')];for(const tab of viewTabs){
 tab.addEventListener('click',()=>selectTab(tab));
 tab.addEventListener('keydown',event=>{const index=viewTabs.indexOf(tab);let target;if(event.key==='ArrowRight')target=viewTabs[(index+1)%viewTabs.length];else if(event.key==='ArrowLeft')target=viewTabs[(index-1+viewTabs.length)%viewTabs.length];else if(event.key==='Home')target=viewTabs[0];else if(event.key==='End')target=viewTabs[viewTabs.length-1];if(target){event.preventDefault();selectTab(target);target.focus()}});
}}
function showLamp(id,on){const lamp=$(id);lamp.classList.toggle('on',on);lamp.setAttribute('title',lamp.getAttribute('aria-label')+(on?' · ein':' · aus'))}
function render(){
 syncCoupling(state.module_connected);$('connection-layout').classList.toggle('coupled',state.module_connected);$('connection-layout').setAttribute('aria-label',state.module_connected?'Gekoppelte Module 1 und 2':'Module');
 const connected=state.module_connected;$('connection-status').textContent=`Modul 1 → Modul 2 · ${connected?'Verbunden':'Getrennt'}`;$('connection-toggle').textContent=connected?'Trennen':'Verbinden';
 $('connection-toggle').closest('.connection-toolbar').classList.toggle('connected',connected);$('module-2').classList.toggle('linked',connected);$('module-2').classList.toggle('unlinked',!connected);$('module-2-status').textContent=connected?'Mit Modul 1 verbunden · betriebsbereit':'Nicht verbunden · inaktiv';
 const slbConnected=state.slb_connected;$('slb-connection-status').textContent=`Modul 1 → Modul 3 · ${slbConnected?'Verbunden':'Getrennt'}`;$('slb-connection-toggle').textContent=slbConnected?'Trennen':'Verbinden';$('slb-connection-toggle').closest('.connection-toolbar').classList.toggle('connected',slbConnected);$('module-3').classList.toggle('linked',slbConnected);$('module-3').classList.toggle('unlinked',!slbConnected);$('module-3-status').textContent=slbConnected?'Mit Modul 1 verbunden · betriebsbereit':'Nicht verbunden · inaktiv';
 state.slb_led.forEach((on,i)=>showLamp('slb-led-'+i,on));state.slb_switch.forEach((on,i)=>{const control=$('slb-switch-'+i);control.setAttribute('aria-pressed',String(on));control.disabled=!slbConnected});$('slb-interrupt').textContent='Interrupt: 0b'+state.slb_interrupt.toString(2).padStart(8,'0');
 const keypadConnected=state.keypad_connected;$('keypad-connection-status').textContent=`Modul 1 → Modul 4 · ${keypadConnected?'Verbunden':'Getrennt'}`;$('keypad-connection-toggle').textContent=keypadConnected?'Trennen':'Verbinden';$('keypad-connection-toggle').closest('.connection-toolbar').classList.toggle('connected',keypadConnected);$('module-4').classList.toggle('linked',keypadConnected);$('module-4').classList.toggle('unlinked',!keypadConnected);$('module-4-status').textContent=keypadConnected?'Mit Modul 1 verbunden · betriebsbereit':'Nicht verbunden · inaktiv';state.keypad_led.forEach((on,i)=>$('keypad-led-'+i).classList.toggle('on',on));for(let i=0;i<16;i++){const key=$('keypad-key-'+i);key.disabled=!keypadConnected;key.setAttribute('aria-pressed',String(state.keypad_key===i))}$('keypad-beeper').classList.toggle('on',state.keypad_beeper);
 for(const input of [...hardwareNodes[1].querySelectorAll('.module-key'),...settingsNodes[1].querySelectorAll('button,input')])input.disabled=!connected;
 $('street-scene').classList.toggle('inactive',!connected);
 streetSignals.forEach((signal,n)=>state[signal.channel].forEach((on,i)=>showLamp('street-'+n+'-'+i,on)));
 pedestrianSignals.forEach((signal,n)=>signal.leds.forEach((led,i)=>{const lamp=$('pedestrian-'+n+'-'+i);showLamp(lamp.id,state.remote_led[led]);lamp.setAttribute('aria-pressed',String(state.remote_led[led]))}));
 if(!connected){heldKeys.clear();for(let i=0;i<4;i++)$('key-'+i).setAttribute('aria-pressed','false')}
 const programText=state.program_running?'Anwenderprogramm läuft':'Kein Anwenderprogramm läuft';$('phase').textContent=programText;$('program-banner').textContent=programText+(state.program_running?' · '+state.program_path:' · Alle Ampeln aus');$('program-status').textContent=state.program_error||programText;$('program-stop').disabled=!state.program_running;
 $('twin-restart').disabled=twinRestarting||!!state.program_debug;
 if(!$('program-path').dataset.initialized){$('program-path').value=state.program_path;$('program-path').dataset.initialized='true'}
 state.ew.forEach((on,i)=>showLamp('lamp-h-'+i,on));state.ns.forEach((on,i)=>showLamp('lamp-v-'+i,on));
 state.remote_led.forEach((on,i)=>{$('extra-'+i).classList.toggle('on',on);$('extra-'+i).setAttribute('aria-pressed',String(on))});
 for(let i=0;i<2;i++){const channels=state.local.slice(i*3,i*3+3),color=`rgb(${channels.map(on=>on?255:0).join(',')})`,led=$('unit-rgb-'+i),on=channels.some(Boolean);led.style.setProperty('--rgb',on?color:'#262827');led.classList.toggle('on',on);led.setAttribute('aria-label',`RGB-LED ${i}: ${on?channels.map((v,j)=>v?['Rot','Grün','Blau'][j]:null).filter(Boolean).join(' + '):'aus'}`)}
 $('interrupt').textContent='Interrupt: 0b'+state.interrupt.toString(2).padStart(8,'0');$('oled').textContent=state.oled.join('\n');$('projectState').textContent='EEPROM: '+(state.project||'leer');$('canState').textContent='CAN empfangen: '+(state.can||'—');
 $('eepromBytes').textContent='EEPROM Bytes 0–15: '+state.eeprom_bytes.map(value=>value.toString(16).padStart(2,'0')).join(' ');
 $('oled-zoom-text').textContent=state.oled.join('\n');
 $('servoState').textContent=`${state.servo_angle}° / ${state.servo_us} µs`;$('sensorState').textContent=`${state.temperature} °C | ${state.humidity} % | ${state.co2} ppm`;
 $('relais').checked=state.actors.relais;$('buzzer').checked=state.actors.buzzer;$('actorLed').checked=state.actors.led;
}
async function poll(){try{state=await api('/api/state');render();}catch(e){console.error(e)}setTimeout(poll,250)}poll();
</script></body></html>"""


CONTROLLER = None
CONTROLLER_LOCK = RLock()


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/":
            self._send(200, HTML.encode(), "text/html; charset=utf-8")
        elif self.path == "/api/state":
            with CONTROLLER_LOCK:
                state = CONTROLLER.state()
            self._json(200, state)
        else:
            self._json(404, {"error": "Nicht gefunden"})

    def do_POST(self):
        if self.path != "/api/action":
            self._json(404, {"error": "Nicht gefunden"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            data = json.loads(self.rfile.read(length) or b"{}")
            with CONTROLLER_LOCK:
                CONTROLLER.action(data)
                state = CONTROLLER.state()
            self._json(200, state)
        except (ValueError, TypeError, json.JSONDecodeError) as error:
            self._json(400, {"error": str(error)})

    def _json(self, status: int, data: dict) -> None:
        self._send(status, json.dumps(data).encode(), "application/json")

    def _send(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        pass


def main() -> None:
    global CONTROLLER
    parser = argparse.ArgumentParser(description="MiniCtrlBox Digital Twin")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--project-root", default=str(Path.cwd()))
    args = parser.parse_args()
    CONTROLLER = SimulationController(args.project_root)
    address = (args.host, args.port)
    print(f"Simulation laeuft auf http://{address[0]}:{address[1]}")
    print("Beenden mit Strg+C")
    server = ThreadingHTTPServer(address, Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nSimulation beendet")
    finally:
        CONTROLLER.program.stop()
        server.server_close()


if __name__ == "__main__":
    main()
