"""Python-Abbild der Klassen CSignal, CAmpel und CKreuzung."""

from __future__ import annotations

from enum import Enum, IntEnum, auto
from typing import Callable, Optional


class SignalPort(IntEnum):
    GPIO_0 = 0
    GPIO_1 = 1
    GPIO_2 = 4
    GPIO_3 = 5
    GPIO_4 = 6
    GPIO_5 = 7


class CSignal:
    def __init__(self, signalPort: SignalPort, on_change: Optional[Callable[[], None]] = None):
        self.signalPort = signalPort
        self._is_on = False
        self._on_change = on_change

    def turnOn(self) -> None:
        self._set(True)

    def turnOff(self) -> None:
        self._set(False)

    def isOn(self) -> bool:
        return self._is_on

    def _set(self, state: bool) -> None:
        changed = self._is_on != state
        self._is_on = state
        if changed and self._on_change:
            self._on_change()


class AmpelPhase(Enum):
    RED = auto()
    RED_YELLOW = auto()
    GREEN = auto()
    YELLOW = auto()
    OFF = auto()


class CAmpel:
    EPhase = AmpelPhase

    def __init__(self, redPort: SignalPort, yellowPort: SignalPort,
                 greenPort: SignalPort, initialPhase: AmpelPhase = AmpelPhase.RED,
                 on_change: Optional[Callable[[], None]] = None):
        self._on_change = on_change
        self.pSignalRed = CSignal(redPort)
        self.pSignalYellow = CSignal(yellowPort)
        self.pSignalGreen = CSignal(greenPort)
        self.currentPhase = initialPhase
        self._setPhase()

    def nextPhase(self) -> None:
        transitions = {
            AmpelPhase.RED: AmpelPhase.RED_YELLOW,
            AmpelPhase.RED_YELLOW: AmpelPhase.GREEN,
            AmpelPhase.GREEN: AmpelPhase.YELLOW,
            AmpelPhase.YELLOW: AmpelPhase.RED,
        }
        if self.currentPhase in transitions:
            self.currentPhase = transitions[self.currentPhase]
            self._setPhase()

    def on(self) -> None:
        if self.currentPhase == AmpelPhase.OFF:
            self.currentPhase = AmpelPhase.RED
            self._setPhase()

    def off(self) -> None:
        self.currentPhase = AmpelPhase.OFF
        self._setPhase()

    def getCurrentPhase(self) -> AmpelPhase:
        return self.currentPhase

    def getLights(self) -> tuple[bool, bool, bool]:
        return (
            self.pSignalRed.isOn(),
            self.pSignalYellow.isOn(),
            self.pSignalGreen.isOn(),
        )

    def _setPhase(self) -> None:
        red = self.currentPhase in (AmpelPhase.RED, AmpelPhase.RED_YELLOW)
        yellow = self.currentPhase in (AmpelPhase.RED_YELLOW, AmpelPhase.YELLOW)
        green = self.currentPhase == AmpelPhase.GREEN

        self.pSignalRed._set(red)
        self.pSignalYellow._set(yellow)
        self.pSignalGreen._set(green)
        if self._on_change:
            self._on_change()


class KreuzungPhase(Enum):
    NSR_EWR = auto()
    NSR_EWRY = auto()
    NSR_EWG = auto()
    NSR_EWY = auto()
    EWR_NSR = auto()
    EWR_NSRY = auto()
    EWR_NSG = auto()
    EWR_NSY = auto()
    OFF = auto()


class CKreuzung:
    EPhase = KreuzungPhase

    def __init__(self, on_change: Optional[Callable[[], None]] = None):
        self._on_change = on_change
        self.pAmpelNS = CAmpel(
            SignalPort.GPIO_0, SignalPort.GPIO_1, SignalPort.GPIO_2,
            AmpelPhase.OFF,
        )
        self.pAmpelEW = CAmpel(
            SignalPort.GPIO_3, SignalPort.GPIO_4, SignalPort.GPIO_5,
            AmpelPhase.OFF,
        )
        self.currentPhase = KreuzungPhase.OFF

    def nextPhase(self) -> None:
        if self.currentPhase == KreuzungPhase.OFF:
            return

        if self.currentPhase == KreuzungPhase.NSR_EWR:
            self.pAmpelEW.nextPhase()
            self.currentPhase = KreuzungPhase.NSR_EWRY
        elif self.currentPhase == KreuzungPhase.NSR_EWRY:
            self.pAmpelEW.nextPhase()
            self.currentPhase = KreuzungPhase.NSR_EWG
        elif self.currentPhase == KreuzungPhase.NSR_EWG:
            self.pAmpelEW.nextPhase()
            self.currentPhase = KreuzungPhase.NSR_EWY
        elif self.currentPhase == KreuzungPhase.NSR_EWY:
            self.pAmpelEW.nextPhase()
            self.currentPhase = KreuzungPhase.EWR_NSR
        elif self.currentPhase == KreuzungPhase.EWR_NSR:
            self.pAmpelNS.nextPhase()
            self.currentPhase = KreuzungPhase.EWR_NSRY
        elif self.currentPhase == KreuzungPhase.EWR_NSRY:
            self.pAmpelNS.nextPhase()
            self.currentPhase = KreuzungPhase.EWR_NSG
        elif self.currentPhase == KreuzungPhase.EWR_NSG:
            self.pAmpelNS.nextPhase()
            self.currentPhase = KreuzungPhase.EWR_NSY
        elif self.currentPhase == KreuzungPhase.EWR_NSY:
            self.pAmpelNS.nextPhase()
            self.currentPhase = KreuzungPhase.NSR_EWR

        self._notify()

    def on(self) -> None:
        if self.currentPhase == KreuzungPhase.OFF:
            self.pAmpelNS.on()
            self.pAmpelEW.on()
            self.currentPhase = KreuzungPhase.NSR_EWR
            self._notify()

    def off(self) -> None:
        self.pAmpelNS.off()
        self.pAmpelEW.off()
        self.currentPhase = KreuzungPhase.OFF
        self._notify()

    def getCurrentPhase(self) -> KreuzungPhase:
        return self.currentPhase

    def _notify(self) -> None:
        if self._on_change:
            self._on_change()
