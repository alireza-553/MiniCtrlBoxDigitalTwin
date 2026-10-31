"""Run the project's original setup()/loop() with a small desktop hardware adapter."""

import json
import hashlib
import os
from pathlib import Path
from queue import Empty, Queue
import shutil
import subprocess
import tempfile
from threading import RLock, Thread
import time
from uuid import uuid4

try:
    from .desktop_peripherals import STORAGE, EEPROM, TWAI, MINICTRLBOX_PERIPHERALS
except ImportError:
    from desktop_peripherals import STORAGE, EEPROM, TWAI, MINICTRLBOX_PERIPHERALS


ARDUINO = r'''
#pragma once
#include <cstdint>
#include <array>
#include <chrono>
#include <thread>
constexpr int OUTPUT=1, INPUT=0, INPUT_PULLUP=2, HIGH=1, LOW=0;
using gpio_num_t=int;
inline std::array<int,32> twinPins{};
inline std::array<bool,32> twinDown{}, twinPressed{}, twinReleased{};
inline std::array<int,6> twinRGB{};
inline int twinRemote=0, twinSwitches=0;
inline void pinMode(int,int) {}
inline void digitalWrite(int pin,int value) { if(pin>=0&&pin<32)twinPins[pin]=value!=0; }
inline int digitalRead(int pin) { return pin>=0&&pin<32?twinPins[pin]:0; }
inline unsigned long millis() {
 static auto start=std::chrono::steady_clock::now();
 return (unsigned long)std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now()-start).count();
}
inline void (*twinDuringDelay)()=nullptr;
inline void delay(unsigned long ms) {
 const auto end=std::chrono::steady_clock::now()+std::chrono::milliseconds(ms);
 while(std::chrono::steady_clock::now()<end){
  if(twinDuringDelay)twinDuringDelay();
  const auto remaining=end-std::chrono::steady_clock::now();
  if(remaining<=std::chrono::steady_clock::duration::zero())break;
  std::this_thread::sleep_for(remaining<std::chrono::milliseconds(100)?remaining:std::chrono::milliseconds(100));
 }
}
using TaskFunction_t=void (*)(void*);
using TaskHandle_t=void*;
using BaseType_t=int;
using UBaseType_t=unsigned;
constexpr BaseType_t pdPASS=1, pdFAIL=0;
inline void vTaskDelay(unsigned long ms) {
 std::this_thread::sleep_for(std::chrono::milliseconds(ms));
}
inline BaseType_t xTaskCreate(TaskFunction_t function,const char*,uint32_t,void* parameter,UBaseType_t,TaskHandle_t* handle) {
 if(!function)return pdFAIL;
 try {
  std::thread(function,parameter).detach();
  if(handle)*handle=nullptr;
  return pdPASS;
 } catch(...) {
  return pdFAIL;
 }
}
'''

MINICTRLBOX = r'''
#pragma once
#include "Arduino.h"
#include <string>
#include <cstdio>
#include <cstdarg>
#include "driver/twai.h"
inline std::array<std::string,8> twinOLED;
namespace nspMiniCtrlBox {
constexpr int PIN_BUTTON_LEFT=0, PIN_BUTTON_RIGHT=3, PIN_BUTTON_1=3, PIN_BUTTON_2=0;
class COLed {
public:
 bool begin() {return true;}
 void printLine(int row,const char* text) {if(row>=0&&row<8)twinOLED[row]=std::string(text).substr(0,21);}
 void printfLine(int row,const char* format,...) {char text[256];va_list args;va_start(args,format);vsnprintf(text,sizeof(text),format,args);va_end(args);printLine(row,text);}
 void clear() {for(auto& row:twinOLED)row.clear();}
};
class CButton {
 int pin;
public:
 CButton(int p,unsigned=30):pin(p) {}
 bool hasButtonPressed(bool reset=true) {bool flag=twinPressed.at(pin);if(reset)twinPressed.at(pin)=false;return flag;}
 bool hasButtonReleased(bool reset=true) {bool flag=twinReleased.at(pin);if(reset)twinReleased.at(pin)=false;return flag;}
 void resetPressedFlag(){twinPressed.at(pin)=false;}
 void resetReleasedFlag(){twinReleased.at(pin)=false;}
 void updateFlags(){}
};
class CPortExpLoc {
public:
 enum RGBLEDColor {RED0=1,GREEN0=2,BLUE0=4,RED1=8,GREEN1=16,BLUE1=32};
 bool begin(){return true;}
 void setColor(int index,bool on){if(index>=0&&index<6)twinRGB[index]=on;}
 void setColor(RGBLEDColor mask,bool on){for(int i=0;i<6;i++)if(int(mask)&(1<<i))twinRGB[i]=on;}
};
class CPortExpOOPExp {
public:
 bool begin(){return true;}
 void setLED(unsigned char index,bool on){if(index<8){if(on)twinRemote|=1<<index;else twinRemote&=~(1<<index);}}
 void setLEDPort(unsigned char value){twinRemote=value;}
 unsigned char getLEDPortState(){return (unsigned char)twinRemote;}
 unsigned char getSwitchState(){return (unsigned char)twinSwitches;}
 bool getSwitchState(unsigned char index){return (twinSwitches&(1<<index))!=0;}
};
}
'''

MINICTRLBOX = MINICTRLBOX.rsplit("}", 1)[0] + MINICTRLBOX_PERIPHERALS + "}\n"

RUNNER = r'''
#include "MiniCtrlBox.h"
#include <iostream>
extern void setup();
extern void loop();
void quoted(const std::string& value){
 std::cout<<'"';for(unsigned char c:value){if(c=='"'||c=='\\')std::cout<<'\\'<<c;else if(c>=32&&c<127)std::cout<<c;else{char escaped[7];snprintf(escaped,sizeof(escaped),"\\u%04x",c);std::cout<<escaped;}}std::cout<<'"';
}
void snapshot(bool waiting=false){
 std::cout<<"{\"waiting\":"<<(waiting?"true":"false")<<",\"pins\":[";for(int i=0;i<8;i++){if(i)std::cout<<',';std::cout<<twinPins[i];}
 std::cout<<"],\"rgb\":[";for(int i=0;i<6;i++){if(i)std::cout<<',';std::cout<<twinRGB[i];}
 std::cout<<"],\"remote\":"<<twinRemote<<",\"oled\":[";for(int i=0;i<8;i++){if(i)std::cout<<',';quoted(twinOLED[i]);}std::cout<<"]";
 if(twinStorageDirty){
  std::cout<<",\"storage\":{\"project\":";quoted(twinProjectName);std::cout<<",\"memory\":[";
  for(size_t i=0;i<twinEEPROM.size();i++){if(i)std::cout<<',';std::cout<<unsigned(twinEEPROM[i]);}
  std::cout<<"]}";twinStorageDirty=false;
 }
 std::cout<<",\"can_tx\":[";bool first=true;
 while(!twinCANOutgoing.empty()){auto frame=twinCANOutgoing.front();twinCANOutgoing.pop_front();if(!first)std::cout<<',';first=false;
  std::cout<<"{\"id\":"<<frame.id<<",\"extended\":"<<(frame.extended?"true":"false")<<",\"data\":[";
  for(int i=0;i<frame.size;i++){if(i)std::cout<<',';std::cout<<unsigned(frame.data[i]);}std::cout<<"]}";
 }
 std::cout<<"]}"<<std::endl;
}
std::string unhex(const std::string& text){std::string result;if(text=="-")return result;for(size_t i=0;i+1<text.size();i+=2)result+=char(std::stoul(text.substr(i,2),nullptr,16));return result;}
void button(int pin,bool down){if(down!=twinDown[pin]){if(down)twinPressed[pin]=true;else twinReleased[pin]=true;twinDown[pin]=down;}}
int main(int argc,char** argv){
 std::string memory,project;if(!(std::cin>>memory>>project))return 0;
 auto bytes=unhex(memory);std::copy_n(bytes.begin(),std::min(bytes.size(),twinEEPROM.size()),twinEEPROM.begin());twinProjectName=unhex(project);
 std::cin.ignore(100000,'\n');
 if(argc>1&&std::string(argv[1])=="--debug-wait"){std::string gate;if(!std::getline(std::cin,gate)||gate!="go")return 0;}
 twinDuringDelay=[](){snapshot(true);};
 setup();snapshot();int left,right,switches,connected;
 unsigned count;
 while(std::cin>>left>>right>>switches>>connected>>project>>count){
  button(0,left!=0);button(3,right!=0);twinSwitches=connected?switches:0;twinProjectName=unhex(project);
  for(unsigned n=0;n<count;n++){TwinCANFrame frame;unsigned size;std::string payload;std::cin>>frame.id>>frame.extended>>size>>payload;auto data=unhex(payload);if(size<=8&&data.size()==size&&twinCANIncoming.size()<256&&twinCANStarted){frame.size=size;std::copy_n(data.begin(),size,frame.data);twinCANIncoming.push_back(frame);}}
  loop();snapshot();
 }
}
'''


def _storage_directory():
    base = os.environ.get("LOCALAPPDATA") if os.name == "nt" else os.environ.get("XDG_DATA_HOME")
    return (Path(base) if base else Path.home() / ".local" / "share") / "MiniCtrlBoxDigitalTwin" / "eeprom"


def _compiler():
    for name in ("g++", "clang++"):
        if binary := shutil.which(name):
            return binary, os.environ.copy(), False
    if os.name == "nt":
        locator = Path(os.environ.get("ProgramFiles(x86)", "C:/Program Files (x86)")) / "Microsoft Visual Studio/Installer/vswhere.exe"
        if locator.exists():
            installation = subprocess.run([str(locator), "-latest", "-products", "*", "-requires", "Microsoft.VisualStudio.Component.VC.Tools.x86.x64", "-property", "installationPath"], capture_output=True, text=True, check=True).stdout.strip()
            if installation:
                setup = Path(installation) / "VC/Auxiliary/Build/vcvars64.bat"
                result = subprocess.run(f'cmd /d /c call "{setup}" >nul && set', capture_output=True, text=True, check=True)
                environment = dict(line.split("=", 1) for line in result.stdout.splitlines() if "=" in line and not line.startswith("="))
                search_path = next((value for key, value in environment.items() if key.lower() == "path"), "")
                if compiler := shutil.which("cl.exe", path=search_path):
                    return compiler, environment, True
    if os.name == "nt":
        raise ValueError("Kein Desktop-C++-Compiler gefunden. Visual Studio C++ Build Tools mit der Komponente ‚Desktopentwicklung mit C++‘ installieren.")
    raise ValueError("Kein Desktop-C++-Compiler gefunden. Unter Ubuntu/Debian mit ‚sudo apt update‘ und ‚sudo apt install build-essential‘ installieren; alternativ clang++ im PATH bereitstellen.")


def find_project(path):
    root = Path(path).expanduser().resolve()
    if (root / "src/main.cpp").is_file():
        return root
    candidates = [child for child in root.iterdir() if child.is_dir() and (child / "src/main.cpp").is_file()] if root.is_dir() else []
    if len(candidates) == 1:
        return candidates[0]
    raise ValueError("Kein eindeutiges C++-Projekt mit src/main.cpp gefunden.")


class NativeProgram:
    def __init__(self):
        self.process = None
        self.snapshot = None
        self.error = ""
        self.project = ""
        self.buttons = [False, False]
        self.switches = 0
        self.connected = False
        self.lock = RLock()
        self.peripheral_lock = RLock()
        self.lifecycle = RLock()
        self.worker = None
        self.build = None
        self.debug = None
        self.debug_waiting = False
        self.waiting = False
        self.eeprom_project = ""
        self.eeprom_memory = [0] * 4096
        self.storage_path = None
        self.can_pending = []
        self.last_can = ""

    def select_storage(self, project):
        """Load the board's EEPROM even when no native program is running."""
        root = Path(project).expanduser().resolve()
        try:
            root = find_project(root)
        except ValueError:
            # The browser also supports EEPROM without a C++ exercise.
            pass
        with self.lifecycle, self.peripheral_lock:
            if self.running:
                raise ValueError("EEPROM-Projekt kann nicht bei laufendem Programm gewechselt werden.")
            self._load_storage(root)
        return root

    def _load_storage(self, root):
        key = hashlib.sha256(os.path.normcase(str(root)).encode("utf-8")).hexdigest()
        storage_path = _storage_directory() / (key + ".json")
        if self.storage_path and self.storage_path != storage_path:
            self.eeprom_project = ""
        self.storage_path = storage_path
        self.eeprom_memory = [0] * 4096
        if self.storage_path.exists():
            data = json.loads(self.storage_path.read_text(encoding="utf-8"))
            memory = data.get("memory", [])
            if len(memory) != 4096 or any(type(value) is not int or not 0 <= value <= 255 for value in memory):
                raise ValueError("Ungueltiger gespeicherter EEPROM-Inhalt")
            self.eeprom_memory = memory
            self.eeprom_project = str(data.get("project", ""))

    def _save_storage(self):
        if self.storage_path is None:
            return
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.storage_path.with_suffix("." + uuid4().hex + ".tmp")
        temporary.write_text(json.dumps({"memory": self.eeprom_memory, "project": self.eeprom_project}), encoding="utf-8")
        os.replace(temporary, self.storage_path)

    def write_project_name(self, value):
        with self.peripheral_lock:
            self.eeprom_project = str(value)
            self._save_storage()

    def send_can(self, identifier, payload):
        payload = bytes(payload)
        if not 0 <= identifier <= 0x1fffffff or len(payload) > 8:
            raise ValueError("Ungueltiger CAN-Frame")
        with self.peripheral_lock:
            if len(self.can_pending) >= 256:
                raise ValueError("CAN-Empfangspuffer ist voll")
            self.can_pending.append((identifier, payload))

    def _peripheral_output(self, snapshot):
        storage = snapshot.pop("storage", None)
        if storage is not None:
            with self.peripheral_lock:
                self.eeprom_memory = storage["memory"]
                # quoted() encodes individual UTF-8 bytes as JSON code points.
                self.eeprom_project = storage["project"].encode("latin1").decode("utf-8", errors="replace")
                self._save_storage()
        for frame in snapshot.pop("can_tx", []):
            self.last_can = bytes(frame["data"]).decode("utf-8", errors="replace")

    @property
    def running(self):
        return self.process is not None and self.process.poll() is None

    def start(self, project, debug=False):
        with self.lifecycle:
            try:
                self._start(project, debug)
            except Exception:
                self.stop()
                raise

    def _start(self, project, debug):
        self.stop()
        root = find_project(project)
        self.project = str(root)
        self._load_storage(root)
        self.last_can = ""
        self.error = ""
        self.build_parent = Path(tempfile.gettempdir()).resolve()
        self.build = self.build_parent / ("mcb-native-" + uuid4().hex)
        self.build.mkdir()
        build = self.build
        (build / "Arduino.h").write_text(ARDUINO, encoding="utf-8")
        (build / "MiniCtrlBox.h").write_text(MINICTRLBOX, encoding="utf-8")
        (build / "TwinStorage.h").write_text(STORAGE, encoding="utf-8")
        (build / "EEPROM.h").write_text(EEPROM, encoding="utf-8")
        (build / "driver").mkdir()
        (build / "driver/twai.h").write_text(TWAI, encoding="utf-8")
        runner = build / "runner.cpp"
        runner.write_text(RUNNER, encoding="utf-8")
        executable = build / ("program.exe" if os.name == "nt" else "program")
        compiler, environment, msvc = _compiler()
        debugger = None if msvc else shutil.which("gdb")
        if debug and not msvc and not debugger:
            raise ValueError("C++-Debugging mit diesem Compiler benötigt GDB im PATH. Unter Windows alternativ Visual Studio C++ Build Tools verwenden.")
        sources = [str(runner)] + [str(source) for source in sorted((root / "src").rglob("*.cpp"))]
        flags = ["/nologo", "/EHsc", "/std:c++17", "/utf-8", f"/Fe:{executable}", f"/I{build}", f"/I{root / 'include'}"] if msvc else ["-std=c++17", "-pthread", "-o", str(executable), "-I", str(build), "-I", str(root / "include")]
        if debug:
            flags += ["/Zi", "/Od", f"/Fd:{build / 'compiler.pdb'}"] if msvc else ["-g", "-O0"]
        link_flags = ["/link", "/DEBUG:FULL", f"/PDB:{build / 'program.pdb'}"] if debug and msvc else []
        result = subprocess.run([compiler, *flags, *sources, *link_flags], cwd=build, env=environment, capture_output=True, text=True, errors="replace", timeout=60)
        if result.returncode:
            raise ValueError("Anwenderprogramm konnte mit dem Desktop-Adapter nicht gebaut werden:\n" + (result.stdout + result.stderr)[-6000:])
        self.messages = Queue()
        self.process = subprocess.Popen([str(executable), *(["--debug-wait"] if debug else [])], cwd=build, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        process = self.process
        process.stdin.write(bytes(self.eeprom_memory).hex() + " " + (self.eeprom_project.encode("utf-8").hex() or "-") + "\n")
        process.stdin.flush()
        self.debug_waiting = debug
        self.debug = {"type": "cppvsdbg" if msvc else "cppdbg", "processId": str(process.pid),
                      "program": str(executable), "miDebuggerPath": debugger} if debug else None
        messages = self.messages
        def read():
            for line in process.stdout:
                messages.put(line)
        Thread(target=read, daemon=True).start()
        initial_pending = debug
        if not debug:
            try:
                initial = self._receive(process, messages, allow_wait=True)
                initial_pending = initial is None
                if initial is not None:
                    self.snapshot = initial
            except Exception:
                self.stop()
                raise
        def run():
            if initial_pending:
                try:
                    self.snapshot = self._receive(process, messages)
                except Exception as error:
                    if process is self.process:
                        self.error = str(error)
                        if process.poll() is None:
                            process.terminate()
                    return
            while process.poll() is None:
                try:
                    with self.lock:
                        if process is not self.process:
                            break
                        self._tick()
                except Exception as error:
                    if process is self.process:
                        self.error = str(error)
                        process.terminate()
                    break
                time.sleep(.02)
        self.worker = Thread(target=run, daemon=True)
        self.worker.start()

    def _receive(self, process, messages, allow_wait=False):
        deadline = None if self.debug else time.monotonic() + 2
        while process is self.process and process.poll() is None:
            try:
                snapshot = json.loads(messages.get(timeout=.1))
                self._peripheral_output(snapshot)
                self.waiting = snapshot.pop("waiting", False)
                if self.waiting:
                    self.snapshot = snapshot
                    if deadline is not None:
                        deadline = time.monotonic() + 2
                    if allow_wait:
                        return None
                    continue
                return snapshot
            except Empty:
                if deadline is not None and time.monotonic() >= deadline:
                    break
            except json.JSONDecodeError as error:
                raise ValueError("Anwenderprogramm liefert keine gültigen Zustände.") from error
        raise ValueError("Anwenderprogramm liefert keine gültigen Zustände (setup/loop blockiert oder Prozess beendet).")

    def release_debug(self):
        if not self.running or not self.debug or not self.debug_waiting:
            raise ValueError("Kein Anwenderprogramm wartet auf den Debugger.")
        self.process.stdin.write("go\n")
        self.process.stdin.flush()
        self.debug_waiting = False

    def _tick(self):
        if self.running:
            with self.peripheral_lock:
                pending, self.can_pending = self.can_pending, []
                project = self.eeprom_project.encode('utf-8').hex() or '-'
            frames = " ".join(f"{identifier} {int(identifier > 0x7ff)} {len(payload)} {payload.hex() or '-'}" for identifier, payload in pending)
            self.process.stdin.write(f"{int(self.buttons[0])} {int(self.buttons[1])} {self.switches} {int(self.connected)} {project} {len(pending)} {frames}\n")
            self.process.stdin.flush()
            self.snapshot = self._receive(self.process, self.messages)

    def inputs(self, left, right, switches, connected):
        self.buttons = [left, right]
        self.switches = switches
        self.connected = connected
        if self.debug or self.waiting:
            # A delay or breakpoint must not block browser requests.
            return
        if not self.lock.acquire(timeout=.05):
            return
        try:
            self._tick()
        finally:
            self.lock.release()

    def stop(self):
        with self.lifecycle:
            self._stop()

    def _stop(self):
        process = self.process
        self.process = None
        if process is not None and process.poll() is None:
            process.terminate()
            process.wait(timeout=5)
        if self.worker is not None and self.worker.is_alive():
            self.worker.join(timeout=3)
        self.worker = None
        if process is not None:
            process.stdin.close()
            process.stdout.close()
        self.snapshot = None
        self.debug = None
        self.debug_waiting = False
        self.waiting = False
        self.buttons = [False, False]
        self.can_pending.clear()
        if self.build is not None:
            target = self.build.resolve()
            if target.parent != self.build_parent or not target.name.startswith("mcb-native-"):
                raise ValueError("Ungültiger temporärer Buildpfad")
            shutil.rmtree(target)
            self.build = None
