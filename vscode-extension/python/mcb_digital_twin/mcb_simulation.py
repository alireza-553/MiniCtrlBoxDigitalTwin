"""Verhaltenssimulation der in MiniCtrlBoxLib dokumentierten Schnittstellen.

Die Klassen bilden die oeffentlichen Hardwarefunktionen im Arbeitsspeicher nach.
Sie sind kein registergenauer ESP32- oder MCP23017-Emulator.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum, IntFlag
from queue import Empty, Queue
from threading import Lock, Timer
from typing import Callable, Optional


class CEeprom:
    def __init__(self, deviceAddress: int = 0x50, size: int = 256):
        self._address = deviceAddress
        self._memory = bytearray(size)
        self._device_info = {
            "id": 0,
            "projectName": "",
            "boardName": "MiniCtrlBox",
            "swVersion": "",
            "hwVersion": "",
        }

    def isPresent(self) -> bool:
        return True

    def getAddress(self) -> int:
        return self._address

    def writeDeviceInfo(self, deviceInfo: dict) -> None:
        self._device_info.update(deviceInfo)

    def readDeviceInfo(self) -> dict:
        return dict(self._device_info)

    def readID(self) -> int:
        return int(self._device_info["id"])

    def readProjectName(self) -> str:
        return str(self._device_info["projectName"])

    def readBoardName(self) -> str:
        return str(self._device_info["boardName"])

    def readSWVersion(self) -> str:
        return str(self._device_info["swVersion"])

    def readHWVersion(self) -> str:
        return str(self._device_info["hwVersion"])

    def getFreeSpace(self) -> int:
        return len(self._memory)

    def writeID(self, value: int) -> None:
        self._device_info["id"] = value & 0xFF

    def writeProjectName(self, value: str) -> None:
        self._device_info["projectName"] = value

    def writeBoardName(self, value: str) -> None:
        self._device_info["boardName"] = value

    def writeHWVersion(self, value: str) -> None:
        self._device_info["hwVersion"] = value

    def writeSWVersion(self, value: str) -> None:
        self._device_info["swVersion"] = value

    def writeUserData(self, data: bytes) -> bool:
        if len(data) > len(self._memory):
            return False
        self._memory[: len(data)] = data
        return True

    def readUserData(self, length: int) -> bytes:
        if length < 0 or length > len(self._memory):
            raise ValueError("Ungueltige Datenlaenge")
        return bytes(self._memory[:length])


class COLed:
    def __init__(self, rows: int = 8, cols: int = 21):
        self._rows = rows
        self._cols = cols
        self._lines = [" " * cols for _ in range(rows)]

    def begin(self) -> bool:
        return True

    def isPresent(self) -> bool:
        return True

    def printAt(self, row: int, col: int, text: str) -> None:
        self._check_row(row)
        if not 0 <= col < self._cols:
            raise IndexError("Spalte ausserhalb des Displays")
        line = list(self._lines[row])
        for index, char in enumerate(str(text)[: self._cols - col]):
            line[col + index] = char
        self._lines[row] = "".join(line)

    def printLine(self, row: int, text: str) -> None:
        self._check_row(row)
        self._lines[row] = str(text)[: self._cols].ljust(self._cols)

    def printfAt(self, row: int, col: int, template: str, *args) -> None:
        self.printAt(row, col, template % args if args else template)

    def printfLine(self, row: int, template: str, *args) -> None:
        self.printLine(row, template % args if args else template)

    def clear(self) -> None:
        self._lines = [" " * self._cols for _ in range(self._rows)]

    def clearLine(self, row: int) -> None:
        self._check_row(row)
        self._lines[row] = " " * self._cols

    def getRows(self) -> int:
        return self._rows

    def getCols(self) -> int:
        return self._cols

    def getLines(self) -> list[str]:
        return list(self._lines)

    def _check_row(self, row: int) -> None:
        if not 0 <= row < self._rows:
            raise IndexError("Zeile ausserhalb des Displays")


class CButton:
    def __init__(self, interruptPin: int, debounceMs: int = 30):
        self.interruptPin = interruptPin
        self.debounceMs = debounceMs
        self._pressed = False
        self._released = False
        self.state = False

    def simulatePress(self) -> None:
        if not self.state:
            self.state = True
            self._pressed = True

    def simulateRelease(self) -> None:
        if self.state:
            self.state = False
            self._released = True

    def hasButtonPressed(self, resetFlag: bool = True) -> bool:
        result = self._pressed
        if result and resetFlag:
            self._pressed = False
        return result

    def hasButtonReleased(self, resetFlag: bool = True) -> bool:
        result = self._released
        if result and resetFlag:
            self._released = False
        return result

    def resetPressedFlag(self) -> None:
        self._pressed = False

    def resetReleasedFlag(self) -> None:
        self._released = False

    def updateFlags(self) -> None:
        pass


class RGBLEDColor(IntFlag):
    RED0 = 1 << 0
    GREEN0 = 1 << 1
    BLUE0 = 1 << 2
    RED1 = 1 << 3
    GREEN1 = 1 << 4
    BLUE1 = 1 << 5


class CPortExpLoc:
    RED0 = RGBLEDColor.RED0
    GREEN0 = RGBLEDColor.GREEN0
    BLUE0 = RGBLEDColor.BLUE0
    RED1 = RGBLEDColor.RED1
    GREEN1 = RGBLEDColor.GREEN1
    BLUE1 = RGBLEDColor.BLUE1

    def __init__(self, mcpAddress: int = 0x20):
        self.address = mcpAddress
        self.port_state = 0

    def begin(self) -> bool:
        return True

    def isPresent(self) -> bool:
        return True

    def setColor(self, color: RGBLEDColor | int, state: bool) -> None:
        mask = int(color) if isinstance(color, RGBLEDColor) else 1 << int(color)
        if mask & ~0x3F:
            raise ValueError("Farbkanal muss zwischen 0 und 5 liegen")
        self.port_state = (self.port_state | mask) if state else (self.port_state & ~mask)

    def getColorState(self, channel: int) -> bool:
        return bool(self.port_state & (1 << channel))


class CTimer:
    def __init__(self, hwTimer: int, triggerIntervalUs: int,
                 callback: Optional[Callable[[], None]] = None,
                 autoReload: bool = True):
        if hwTimer not in range(4):
            raise ValueError("Hardware-Timer muss zwischen 0 und 3 liegen")
        self.hwTimer = hwTimer
        self.interval = triggerIntervalUs / 1_000_000
        self.callback = callback
        self.autoReload = autoReload
        self._timer: Optional[Timer] = None
        self._running = False
        self._lock = Lock()

    def start(self) -> None:
        with self._lock:
            if self._running:
                return
            self._running = True
            self._schedule()

    def restart(self) -> None:
        self.stop()
        self.start()

    def stop(self) -> None:
        with self._lock:
            self._running = False
            if self._timer:
                self._timer.cancel()
                self._timer = None

    def setTimerCallbackFunction(self, callback: Callable[[], None]) -> None:
        self.callback = callback

    def _schedule(self) -> None:
        self._timer = Timer(self.interval, self._fire)
        self._timer.daemon = True
        self._timer.start()

    def _fire(self) -> None:
        if self.callback:
            self.callback()
        with self._lock:
            if self._running and self.autoReload:
                self._schedule()
            else:
                self._running = False


@dataclass(frozen=True)
class CANFrame:
    canIdentifier: int
    data: bytes = b""

    @property
    def dlc(self) -> int:
        return len(self.data)

    def __post_init__(self) -> None:
        if not 0 <= self.canIdentifier <= 0x1FFFFFFF:
            raise ValueError("Ungueltiger CAN-Identifier")
        if len(self.data) > 8:
            raise ValueError("Ein klassischer CAN-Frame hat maximal 8 Datenbytes")


class SimulatedCANNetwork:
    def __init__(self):
        self.nodes: list[CCanBus] = []

    def attach(self, node: "CCanBus") -> None:
        if node not in self.nodes:
            self.nodes.append(node)

    def detach(self, node: "CCanBus") -> None:
        if node in self.nodes:
            self.nodes.remove(node)

    def send(self, sender: "CCanBus", frame: CANFrame) -> bool:
        receivers = [n for n in self.nodes if n is not sender and n.started and n.bitrate == sender.bitrate]
        for receiver in receivers:
            receiver._rx.put(frame)
        return bool(receivers)


class CCanBus:
    Frame = CANFrame

    def __init__(self, txPin: int = 21, rxPin: int = 20, bitrate: int = 500_000,
                 network: Optional[SimulatedCANNetwork] = None):
        self.txPin = txPin
        self.rxPin = rxPin
        self.bitrate = bitrate
        self.network = network or SimulatedCANNetwork()
        self.started = False
        self.termination = False
        self._bus_off = False
        self._rx: Queue[CANFrame] = Queue()

    def start(self) -> bool:
        self.started = True
        self._bus_off = False
        self.network.attach(self)
        return True

    def stop(self) -> None:
        self.started = False
        self.network.detach(self)

    def restart(self) -> None:
        self.stop()
        self.start()

    def busOffDetected(self) -> bool:
        return self._bus_off

    def transmit(self, frame: CANFrame, timeoutMs: int = 100) -> bool:
        if not self.started:
            return False
        success = self.network.send(self, frame)
        self._bus_off = not success
        return success

    def receive(self, timeoutMs: int = 100) -> Optional[CANFrame]:
        if not self.started:
            return None
        try:
            return self._rx.get(timeout=max(0, timeoutMs) / 1000)
        except Empty:
            return None

    def setCANTermination(self, termination: bool) -> None:
        self.termination = termination

    def setBitrate(self, bitrate: int) -> None:
        allowed = {25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000}
        if bitrate not in allowed:
            raise ValueError("Nicht unterstuetzte CAN-Bitrate")
        self.bitrate = bitrate


class LEDColor(IntFlag):
    LEDRD0 = 1 << 0
    LEDYE0 = 1 << 1
    LEDGN0 = 1 << 2
    LEDBU0 = 1 << 3
    LEDRD1 = 1 << 4
    LEDYE1 = 1 << 5
    LEDGN1 = 1 << 6
    LEDBU1 = 1 << 7


class CPortExpRem:
    LEDRD0 = LEDColor.LEDRD0
    LEDYE0 = LEDColor.LEDYE0
    LEDGN0 = LEDColor.LEDGN0
    LEDBU0 = LEDColor.LEDBU0
    LEDRD1 = LEDColor.LEDRD1
    LEDYE1 = LEDColor.LEDYE1
    LEDGN1 = LEDColor.LEDGN1
    LEDBU1 = LEDColor.LEDBU1

    def __init__(self, mcpAddress: int = 0x21):
        self.address = mcpAddress
        self.led_state = 0
        self.switch_state = 0
        self.interrupt_mask = 0
        self.interrupt_flag = 0
        self._interrupt_callback: Optional[Callable[[], None]] = None

    def begin(self) -> bool:
        return True

    def isPresent(self) -> bool:
        return True

    def setLED(self, led: LEDColor | int, state: bool) -> None:
        mask = int(led) if isinstance(led, LEDColor) else 1 << int(led)
        if mask & ~0xFF:
            raise ValueError("LED muss zwischen 0 und 7 liegen")
        self.led_state = (self.led_state | mask) if state else (self.led_state & ~mask)

    def setLEDPort(self, state: int) -> None:
        self.led_state = state & 0xFF

    def setLEDPortRemain(self, state: int) -> None:
        self.led_state |= state & 0xFF

    def resetLEDPortRemain(self, state: int) -> None:
        self.led_state &= ~(state & 0xFF)

    def toggleLEDPortRemain(self, state: int) -> None:
        self.led_state ^= state & 0xFF

    def getSwitchState(self, switchNo: Optional[int] = None) -> int | bool:
        if switchNo is None:
            return self.switch_state
        if not 0 <= switchNo <= 7:
            raise ValueError("Schalter muss zwischen 0 und 7 liegen")
        return bool(self.switch_state & (1 << switchNo))

    def getLEDPortState(self) -> int:
        return self.led_state

    def setInterruptMask(self, mask: int) -> None:
        self.interrupt_mask = mask & 0xFF

    def enableInterrupts(self, callback: Callable[[], None]) -> None:
        self._interrupt_callback = callback

    def disableInterrupts(self) -> None:
        self._interrupt_callback = None

    def getInterruptFlag(self) -> int:
        return self.interrupt_flag

    def simulateSwitch(self, switchNo: int, state: bool) -> None:
        if not 0 <= switchNo <= 7:
            raise ValueError("Schalter muss zwischen 0 und 7 liegen")
        mask = 1 << switchNo
        old_state = bool(self.switch_state & mask)
        self.switch_state = (self.switch_state | mask) if state else (self.switch_state & ~mask)
        if old_state != state and self.interrupt_mask & mask:
            self.interrupt_flag |= mask
            if self._interrupt_callback:
                self._interrupt_callback()


class CPortExpOOPExp(CPortExpRem):
    """Portexpander des Verkehrskreuzungsmoduls."""


class PWMChannel(IntEnum):
    RED0 = 0
    GREEN0 = 1
    BLUE0 = 2
    RED1 = 3
    GREEN1 = 4
    BLUE1 = 5
    SERVO1 = 6
    SERVO2 = 7


class SensorPin(IntEnum):
    SENSOR1 = 0
    SENSOR2 = 1


class CServo:
    RED0 = PWMChannel.RED0
    GREEN0 = PWMChannel.GREEN0
    BLUE0 = PWMChannel.BLUE0
    RED1 = PWMChannel.RED1
    GREEN1 = PWMChannel.GREEN1
    BLUE1 = PWMChannel.BLUE1
    SERVO1 = PWMChannel.SERVO1
    SERVO2 = PWMChannel.SERVO2
    SENSOR1 = SensorPin.SENSOR1
    SENSOR2 = SensorPin.SENSOR2

    def __init__(self, baseAddress: int = 0x40):
        self.address = baseAddress
        self.channels = [0] * 8
        self.microseconds = [0] * 8
        self.frequency = 1000.0
        self.output_enabled = True
        self.min_us = 500
        self.max_us = 2500
        self.reference_voltage = 3.3
        self.poti_digital = 0
        self.sensor_voltage = [0.0, 0.0]

    def begin(self) -> bool:
        return True

    def isPresent(self) -> bool:
        return True

    def setPWM(self, channel: PWMChannel | int, valueOn: int, valueOff=None,
               invert: bool = False) -> None:
        index = int(channel)
        if isinstance(valueOff, bool):
            invert = valueOff
            valueOff = None
        value = valueOn if valueOff is None else (int(valueOff) - int(valueOn)) % 4096
        value = max(0, min(4095, int(value)))
        self.channels[index] = 4095 - value if invert else value

    def setPWMPercent(self, channel: PWMChannel | int, percent: int,
                      invert: bool = False) -> None:
        if not 0 <= percent <= 100:
            raise ValueError("Prozentwert muss zwischen 0 und 100 liegen")
        self.setPWM(channel, round(percent * 4095 / 100), invert)

    def setPWMFreq(self, frequency: float) -> None:
        if frequency <= 0:
            raise ValueError("Frequenz muss positiv sein")
        self.frequency = float(frequency)

    def setMicroseconds(self, channel: PWMChannel | int, microseconds: int) -> None:
        self.microseconds[int(channel)] = int(microseconds)

    def angleToMicroseconds(self, angle: float) -> int:
        angle = max(0.0, min(180.0, float(angle)))
        return round(self.min_us + (self.max_us - self.min_us) * angle / 180)

    def setMinMaxServoMicroseconds(self, minimum: int, maximum: int) -> None:
        if minimum >= maximum:
            raise ValueError("Minimalwert muss kleiner als Maximalwert sein")
        self.min_us, self.max_us = minimum, maximum

    def allChannelsOff(self) -> None:
        self.channels = [0] * 8
        self.microseconds = [0] * 8

    def outputEnable(self, enable: bool) -> None:
        self.output_enabled = enable

    def getPotiVoltageDigital(self) -> int:
        return self.poti_digital

    def getPotiVoltageAnalog(self) -> float:
        return self.poti_digital / 4095 * self.reference_voltage

    def getPotiVoltagePercent(self) -> float:
        return self.poti_digital / 4095 * 100

    def setReferenceVoltage(self, voltage: float) -> None:
        self.reference_voltage = float(voltage)

    def getServoSensorDigital(self, sensorPin: SensorPin | int) -> bool:
        return self.sensor_voltage[int(sensorPin)] >= self.reference_voltage / 2

    def getServoSensorAnalog(self, sensorPin: SensorPin | int) -> float:
        return self.sensor_voltage[int(sensorPin)]

    def simulatePoti(self, percent: float) -> None:
        self.poti_digital = round(max(0.0, min(100.0, percent)) * 4095 / 100)

    def simulateServoSensor(self, sensorPin: SensorPin | int, voltage: float) -> None:
        self.sensor_voltage[int(sensorPin)] = max(0.0, min(self.reference_voltage, voltage))


class CASBActors:
    def __init__(self):
        self.relais = False
        self.buzzer = False
        self.led = False

    def setRelais(self, state: bool) -> None:
        self.relais = state

    def setBuzzer(self, state: bool) -> None:
        self.buzzer = state

    def setLED(self, state: bool) -> None:
        self.led = state


@dataclass
class TMLX90393Data:
    x: float
    y: float
    z: float


@dataclass
class TSCD4xData:
    ui16CO2: int
    fTemperature: float
    fHumidity: float


class CASBSensors:
    def __init__(self):
        self.aht_temperature = 20.0
        self.aht_humidity = 50.0
        self.magnetic = TMLX90393Data(0.0, 0.0, 0.0)
        self.magnetic_gain = 0
        self.scd = TSCD4xData(400, 20.0, 50.0)
        self.reference_voltage = 3.3
        self.voltage_digital = 0

    def initAHT20(self) -> bool:
        return True

    def getAHT20Temperature(self) -> float:
        return self.aht_temperature

    def getAHT20Humidity(self) -> float:
        return self.aht_humidity

    def initMLX90393(self) -> bool:
        return True

    def getMLX90393Data(self) -> TMLX90393Data:
        return self.magnetic

    def setMLX90393Gain(self, gain: int) -> None:
        self.magnetic_gain = gain

    def initSCD4x(self) -> bool:
        return True

    def getSCD4xData(self) -> TSCD4xData:
        return self.scd

    def getVoltageDigital(self) -> int:
        return self.voltage_digital

    def getVoltageAnalog(self) -> float:
        return self.voltage_digital / 4095 * self.reference_voltage

    def getVoltagePercent(self) -> float:
        return self.voltage_digital / 4095 * 100

    def setReferenceVoltage(self, voltage: float) -> None:
        self.reference_voltage = float(voltage)

    def simulateAHT20(self, temperature: float, humidity: float) -> None:
        self.aht_temperature = float(temperature)
        self.aht_humidity = float(humidity)

    def simulateMLX90393(self, x: float, y: float, z: float) -> None:
        self.magnetic = TMLX90393Data(float(x), float(y), float(z))

    def simulateSCD4x(self, co2: int, temperature: float, humidity: float) -> None:
        self.scd = TSCD4xData(int(co2), float(temperature), float(humidity))

    def simulateVoltagePercent(self, percent: float) -> None:
        self.voltage_digital = round(max(0.0, min(100.0, percent)) * 4095 / 100)
