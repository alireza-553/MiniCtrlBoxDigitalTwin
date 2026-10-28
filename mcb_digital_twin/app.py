"""Grafische Python-Simulation der MiniCtrlBox und der Kreuzung."""

from __future__ import annotations

import tkinter as tk
from tkinter import ttk

try:
    from .crossing import CKreuzung
    from .mcb_simulation import (
        CANFrame,
        CASBActors,
        CASBSensors,
        CCanBus,
        CEeprom,
        COLed,
        CPortExpLoc,
        CPortExpOOPExp,
        CServo,
        SimulatedCANNetwork,
    )
except ImportError:  # Direkter Start: python3 mcb_digital_twin/app.py
    from crossing import CKreuzung
    from mcb_simulation import (
        CANFrame,
        CASBActors,
        CASBSensors,
        CCanBus,
        CEeprom,
        COLed,
        CPortExpLoc,
        CPortExpOOPExp,
        CServo,
        SimulatedCANNetwork,
    )


class MCBSimulationApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("MiniCtrlBox – digitaler Zwilling")
        self.geometry("1000x720")
        self.minsize(900, 650)

        self.kreuzung = CKreuzung(self._refresh_crossing)
        self.local_expander = CPortExpLoc()
        self.remote_expander = CPortExpOOPExp()
        self.display = COLed()
        self.eeprom = CEeprom()
        self.servo = CServo()
        self.servo.setMicroseconds(CServo.SERVO1, self.servo.angleToMicroseconds(90))
        self.actors = CASBActors()
        self.sensors = CASBSensors()

        network = SimulatedCANNetwork()
        self.can_sender = CCanBus(network=network)
        self.can_receiver = CCanBus(network=network)
        self.can_sender.start()
        self.can_receiver.start()

        self.auto_enabled = tk.BooleanVar(value=False)
        self.auto_interval = tk.IntVar(value=1500)
        self.phase_text = tk.StringVar()
        self.interrupt_text = tk.StringVar(value="Interrupt: keiner")

        notebook = ttk.Notebook(self)
        notebook.pack(fill="both", expand=True, padx=8, pady=8)

        self.crossing_tab = ttk.Frame(notebook)
        self.expander_tab = ttk.Frame(notebook)
        self.system_tab = ttk.Frame(notebook)
        notebook.add(self.crossing_tab, text="Kreuzung")
        notebook.add(self.expander_tab, text="Portexpander")
        notebook.add(self.system_tab, text="Weitere Hardware")

        self._build_crossing_tab()
        self._build_expander_tab()
        self._build_system_tab()
        self._refresh_crossing()
        self._refresh_expanders()
        self.after(50, self._auto_tick)

    def _build_crossing_tab(self) -> None:
        controls = ttk.Frame(self.crossing_tab)
        controls.pack(fill="x", padx=10, pady=8)
        ttk.Button(controls, text="EIN", command=self.kreuzung.on).pack(side="left", padx=4)
        ttk.Button(controls, text="AUS", command=self.kreuzung.off).pack(side="left", padx=4)
        ttk.Button(controls, text="Nächste Phase", command=self.kreuzung.nextPhase).pack(side="left", padx=4)
        ttk.Checkbutton(controls, text="Automatik", variable=self.auto_enabled).pack(side="left", padx=20)
        ttk.Label(controls, text="Intervall (ms):").pack(side="left")
        ttk.Spinbox(controls, from_=200, to=10000, increment=100,
                    textvariable=self.auto_interval, width=8).pack(side="left", padx=4)

        ttk.Label(self.crossing_tab, textvariable=self.phase_text,
                  font=("TkDefaultFont", 15, "bold")).pack(pady=4)

        self.crossing_canvas = tk.Canvas(self.crossing_tab, width=900, height=520,
                                         bg="#d7d7d7", highlightthickness=0)
        self.crossing_canvas.pack(fill="both", expand=True, padx=10, pady=10)
        self.crossing_canvas.create_rectangle(0, 205, 900, 335, fill="#555555", outline="")
        self.crossing_canvas.create_rectangle(385, 0, 515, 520, fill="#555555", outline="")
        self.crossing_canvas.create_text(300, 185, text="EW", font=("TkDefaultFont", 14, "bold"))
        self.crossing_canvas.create_text(535, 105, text="NS", font=("TkDefaultFont", 14, "bold"))

        self.ns_lights = self._make_traffic_light(535, 120)
        self.ew_lights = self._make_traffic_light(275, 345)

    def _make_traffic_light(self, x: int, y: int) -> tuple[int, int, int]:
        canvas = self.crossing_canvas
        canvas.create_rectangle(x, y, x + 90, y + 250, fill="#202020", outline="#000000", width=3)
        return tuple(
            canvas.create_oval(x + 15, y + 12 + index * 78,
                               x + 75, y + 72 + index * 78,
                               fill="#404040", outline="#101010", width=2)
            for index in range(3)
        )

    def _refresh_crossing(self) -> None:
        if not hasattr(self, "crossing_canvas"):
            return
        self.phase_text.set(f"Phase: {self.kreuzung.getCurrentPhase().name}")
        self._paint_lights(self.ns_lights, self.kreuzung.pAmpelNS.getLights())
        self._paint_lights(self.ew_lights, self.kreuzung.pAmpelEW.getLights())

    def _paint_lights(self, items: tuple[int, int, int], states: tuple[bool, bool, bool]) -> None:
        colors_on = ("#ff2020", "#ffd21f", "#1fc94c")
        for item, state, color in zip(items, states, colors_on):
            self.crossing_canvas.itemconfigure(item, fill=color if state else "#404040")

    def _auto_tick(self) -> None:
        if self.auto_enabled.get():
            self.kreuzung.nextPhase()
        interval = max(200, self.auto_interval.get())
        self.after(interval, self._auto_tick)

    def _build_expander_tab(self) -> None:
        local = ttk.LabelFrame(self.expander_tab, text="CPortExpLoc – RGB-LEDs")
        local.pack(fill="x", padx=10, pady=10)
        self.local_led_canvases = []
        for led in range(2):
            frame = ttk.Frame(local)
            frame.pack(side="left", padx=35, pady=10)
            ttk.Label(frame, text=f"RGB-LED {led}").pack()
            canvas = tk.Canvas(frame, width=90, height=90, highlightthickness=0)
            canvas.pack()
            circle = canvas.create_oval(10, 10, 80, 80, fill="#202020")
            self.local_led_canvases.append((canvas, circle))
            buttons = ttk.Frame(frame)
            buttons.pack()
            for offset, name in enumerate(("R", "G", "B")):
                channel = led * 3 + offset
                ttk.Button(buttons, text=name, width=3,
                           command=lambda c=channel: self._toggle_local_channel(c)).pack(side="left")

        remote = ttk.LabelFrame(self.expander_tab, text="CPortExpOOPExp – 8 LEDs und 8 Eingänge")
        remote.pack(fill="both", expand=True, padx=10, pady=10)
        self.remote_expander.setInterruptMask(0xFF)
        self.remote_expander.enableInterrupts(self._remote_interrupt)
        self.remote_leds: list[tuple[tk.Canvas, int]] = []
        self.remote_switch_vars: list[tk.BooleanVar] = []

        for index in range(8):
            row = ttk.Frame(remote)
            row.pack(fill="x", padx=12, pady=3)
            ttk.Label(row, text=f"Port {index}", width=8).pack(side="left")
            canvas = tk.Canvas(row, width=35, height=35, highlightthickness=0)
            circle = canvas.create_oval(5, 5, 30, 30, fill="#303030")
            canvas.pack(side="left", padx=8)
            self.remote_leds.append((canvas, circle))
            ttk.Button(row, text="LED umschalten",
                       command=lambda i=index: self._toggle_remote_led(i)).pack(side="left", padx=8)
            variable = tk.BooleanVar()
            self.remote_switch_vars.append(variable)
            ttk.Checkbutton(row, text=f"Eingang S{index}", variable=variable,
                            command=lambda i=index, v=variable: self._set_remote_switch(i, v.get())).pack(side="left")

        ttk.Label(remote, textvariable=self.interrupt_text).pack(anchor="w", padx=12, pady=6)

    def _toggle_local_channel(self, channel: int) -> None:
        self.local_expander.setColor(channel, not self.local_expander.getColorState(channel))
        self._refresh_expanders()

    def _toggle_remote_led(self, index: int) -> None:
        state = bool(self.remote_expander.getLEDPortState() & (1 << index))
        self.remote_expander.setLED(index, not state)
        self._refresh_expanders()

    def _set_remote_switch(self, index: int, state: bool) -> None:
        self.remote_expander.simulateSwitch(index, state)

    def _remote_interrupt(self) -> None:
        self.interrupt_text.set(f"Interrupt-Flags: 0b{self.remote_expander.getInterruptFlag():08b}")

    def _refresh_expanders(self) -> None:
        if not hasattr(self, "local_led_canvases"):
            return
        for led, (canvas, circle) in enumerate(self.local_led_canvases):
            channels = [self.local_expander.getColorState(led * 3 + i) for i in range(3)]
            color = "#%02x%02x%02x" % tuple(255 if state else 0 for state in channels)
            canvas.itemconfigure(circle, fill=color if any(channels) else "#202020")
        for index, (canvas, circle) in enumerate(self.remote_leds):
            state = bool(self.remote_expander.getLEDPortState() & (1 << index))
            canvas.itemconfigure(circle, fill="#28d75f" if state else "#303030")

    def _build_system_tab(self) -> None:
        left = ttk.Frame(self.system_tab)
        right = ttk.Frame(self.system_tab)
        left.pack(side="left", fill="both", expand=True, padx=8, pady=8)
        right.pack(side="left", fill="both", expand=True, padx=8, pady=8)

        oled_frame = ttk.LabelFrame(left, text="COLed")
        oled_frame.pack(fill="x", pady=5)
        self.oled_label = tk.Label(oled_frame, text="\n".join(self.display.getLines()),
                                   font=("Courier", 11), bg="#071407", fg="#8cff8c",
                                   justify="left", anchor="nw", width=24, height=8)
        self.oled_label.pack(padx=8, pady=8)
        self.oled_entry = ttk.Entry(oled_frame)
        self.oled_entry.pack(side="left", fill="x", expand=True, padx=5, pady=5)
        ttk.Button(oled_frame, text="Zeile 1 schreiben", command=self._write_oled).pack(side="left", padx=5)

        eeprom_frame = ttk.LabelFrame(left, text="CEeprom")
        eeprom_frame.pack(fill="x", pady=5)
        ttk.Label(eeprom_frame, text="Projektname:").pack(side="left", padx=5)
        self.eeprom_entry = ttk.Entry(eeprom_frame)
        self.eeprom_entry.pack(side="left", fill="x", expand=True, padx=5, pady=8)
        ttk.Button(eeprom_frame, text="Speichern", command=self._save_eeprom).pack(side="left", padx=5)
        self.eeprom_status = ttk.Label(left, text="EEPROM: leer")
        self.eeprom_status.pack(anchor="w")

        can_frame = ttk.LabelFrame(left, text="CCanBus")
        can_frame.pack(fill="x", pady=5)
        self.can_entry = ttk.Entry(can_frame)
        self.can_entry.insert(0, "Hallo")
        self.can_entry.pack(side="left", fill="x", expand=True, padx=5, pady=8)
        ttk.Button(can_frame, text="Frame senden", command=self._send_can).pack(side="left", padx=5)
        self.can_status = ttk.Label(left, text="CAN: bereit")
        self.can_status.pack(anchor="w")

        servo_frame = ttk.LabelFrame(right, text="CServo")
        servo_frame.pack(fill="x", pady=5)
        self.servo_value = tk.DoubleVar(value=90)
        ttk.Scale(servo_frame, from_=0, to=180, variable=self.servo_value,
                  command=self._set_servo).pack(fill="x", padx=8, pady=8)
        self.servo_status = ttk.Label(servo_frame, text="Servo 1: 90° / 1500 µs")
        self.servo_status.pack()

        sensor_frame = ttk.LabelFrame(right, text="CASBSensors")
        sensor_frame.pack(fill="x", pady=5)
        self.temperature = tk.DoubleVar(value=20)
        self.humidity = tk.DoubleVar(value=50)
        self.co2 = tk.IntVar(value=400)
        self._add_scale(sensor_frame, "Temperatur °C", self.temperature, -20, 60)
        self._add_scale(sensor_frame, "Feuchte %", self.humidity, 0, 100)
        self._add_scale(sensor_frame, "CO₂ ppm", self.co2, 300, 3000)
        ttk.Button(sensor_frame, text="Sensorwerte übernehmen",
                   command=self._apply_sensors).pack(pady=4)
        self.sensor_status = ttk.Label(sensor_frame, text="")
        self.sensor_status.pack(pady=4)
        self._apply_sensors()

        actor_frame = ttk.LabelFrame(right, text="CASBActors")
        actor_frame.pack(fill="x", pady=5)
        self.relais_var = tk.BooleanVar()
        self.buzzer_var = tk.BooleanVar()
        self.actor_led_var = tk.BooleanVar()
        for text, variable, setter in (
            ("Relais", self.relais_var, self.actors.setRelais),
            ("Buzzer", self.buzzer_var, self.actors.setBuzzer),
            ("LED", self.actor_led_var, self.actors.setLED),
        ):
            ttk.Checkbutton(actor_frame, text=text, variable=variable,
                            command=lambda v=variable, s=setter: s(v.get())).pack(side="left", padx=12, pady=8)

    def _add_scale(self, parent, text, variable, minimum, maximum) -> None:
        row = ttk.Frame(parent)
        row.pack(fill="x", padx=5)
        ttk.Label(row, text=text, width=15).pack(side="left")
        ttk.Scale(row, from_=minimum, to=maximum, variable=variable).pack(side="left", fill="x", expand=True)

    def _write_oled(self) -> None:
        self.display.printLine(1, self.oled_entry.get())
        self.oled_label.configure(text="\n".join(self.display.getLines()))

    def _save_eeprom(self) -> None:
        self.eeprom.writeProjectName(self.eeprom_entry.get())
        self.eeprom_status.configure(text=f"EEPROM: {self.eeprom.readProjectName()}")

    def _send_can(self) -> None:
        data = self.can_entry.get().encode("utf-8")[:8]
        sent = self.can_sender.transmit(CANFrame(0x1A, data))
        frame = self.can_receiver.receive(10)
        if sent and frame:
            self.can_status.configure(text=f"CAN empfangen: {frame.data.decode('utf-8', errors='replace')}")
        else:
            self.can_status.configure(text="CAN-Übertragung fehlgeschlagen")

    def _set_servo(self, _value=None) -> None:
        angle = self.servo_value.get()
        microseconds = self.servo.angleToMicroseconds(angle)
        self.servo.setMicroseconds(CServo.SERVO1, microseconds)
        self.servo_status.configure(text=f"Servo 1: {angle:.0f}° / {microseconds} µs")

    def _apply_sensors(self) -> None:
        self.sensors.simulateAHT20(self.temperature.get(), self.humidity.get())
        self.sensors.simulateSCD4x(self.co2.get(), self.temperature.get(), self.humidity.get())
        self.sensor_status.configure(
            text=f"AHT20: {self.sensors.getAHT20Temperature():.1f} °C, "
                 f"{self.sensors.getAHT20Humidity():.1f} % | "
                 f"SCD4x: {self.sensors.getSCD4xData().ui16CO2} ppm"
        )


def main() -> None:
    app = MCBSimulationApp()
    app.mainloop()


if __name__ == "__main__":
    main()
