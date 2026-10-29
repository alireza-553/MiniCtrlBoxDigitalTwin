"""Desktop substitutes for Arduino EEPROM and the ESP32 classic CAN API.

No physical bus timings, arbitration or electrical errors are emulated.
"""

STORAGE = r'''
#pragma once
#include <algorithm>
#include <array>
#include <cstdint>
#include <deque>
#include <string>
#include <cstring>
inline std::array<uint8_t,4096> twinEEPROM{};
inline std::string twinProjectName;
inline bool twinStorageDirty=false;
struct TwinCANFrame { uint32_t id=0; bool extended=false; uint8_t size=0; uint8_t data[8]{}; };
inline std::deque<TwinCANFrame> twinCANIncoming, twinCANOutgoing;
inline bool twinCANStarted=false;
'''

EEPROM = r'''
#pragma once
#include "TwinStorage.h"
class EEPROMClass {
 size_t size_=0;
public:
 bool begin(size_t size){if(!size||size>twinEEPROM.size())return false;size_=size;return true;}
 size_t length() const{return size_;}
 uint8_t read(int address) const{return address>=0&&size_t(address)<size_?twinEEPROM[address]:0;}
 void write(int address,uint8_t value){if(address>=0&&size_t(address)<size_)twinEEPROM[address]=value;}
 bool commit(){if(!size_)return false;twinStorageDirty=true;return true;}
 void end(){if(size_)commit();size_=0;}
 template<class T> T& get(int address,T& value){if(address>=0&&size_t(address)+sizeof(T)<=size_)std::memcpy(&value,twinEEPROM.data()+address,sizeof(T));return value;}
 template<class T> const T& put(int address,const T& value){if(address>=0&&size_t(address)+sizeof(T)<=size_)std::memcpy(twinEEPROM.data()+address,&value,sizeof(T));return value;}
};
inline EEPROMClass EEPROM;
'''

TWAI = r'''
#pragma once
#include "Arduino.h"
#include "TwinStorage.h"
using esp_err_t=int;
using TickType_t=unsigned;
constexpr esp_err_t ESP_OK=0, ESP_FAIL=-1, ESP_ERR_INVALID_ARG=0x102, ESP_ERR_INVALID_STATE=0x103, ESP_ERR_NOT_SUPPORTED=0x106, ESP_ERR_TIMEOUT=0x107;
constexpr gpio_num_t GPIO_NUM_20=20, GPIO_NUM_21=21;
#define pdMS_TO_TICKS(ms) (ms)
constexpr int TWAI_MODE_NORMAL=0, TWAI_MODE_NO_ACK=1;
struct twai_general_config_t{int tx_io;int rx_io;int mode;};
struct twai_timing_config_t{unsigned bitrate;};
struct twai_filter_config_t{uint32_t acceptance_code=0,acceptance_mask=0xffffffff;bool single_filter=true;};
struct twai_message_t{uint32_t identifier=0;uint8_t data_length_code=0;uint8_t data[8]{};bool extd=false,rtr=false;};
#define TWAI_GENERAL_CONFIG_DEFAULT(tx,rx,mode) twai_general_config_t{tx,rx,mode}
#define TWAI_TIMING_CONFIG_500KBITS() twai_timing_config_t{500000}
#define TWAI_FILTER_CONFIG_ACCEPT_ALL() twai_filter_config_t{}
inline bool twinCANInstalled=false;
inline esp_err_t twai_driver_install(const twai_general_config_t* general,const twai_timing_config_t* timing,const twai_filter_config_t* filter){
 if(!general||!timing||!filter)return ESP_ERR_INVALID_ARG;
 if(twinCANInstalled)return ESP_ERR_INVALID_STATE;
 if(timing->bitrate!=500000||filter->acceptance_code!=0||filter->acceptance_mask!=0xffffffff||!filter->single_filter)return ESP_ERR_NOT_SUPPORTED;
 if(general->mode!=TWAI_MODE_NORMAL&&general->mode!=TWAI_MODE_NO_ACK)return ESP_ERR_NOT_SUPPORTED;
 twinCANInstalled=true;return ESP_OK;
}
inline esp_err_t twai_start(){if(!twinCANInstalled||twinCANStarted)return ESP_ERR_INVALID_STATE;twinCANStarted=true;return ESP_OK;}
inline esp_err_t twai_stop(){if(!twinCANStarted)return ESP_ERR_INVALID_STATE;twinCANStarted=false;return ESP_OK;}
inline esp_err_t twai_driver_uninstall(){if(twinCANStarted||!twinCANInstalled)return ESP_ERR_INVALID_STATE;twinCANInstalled=false;twinCANIncoming.clear();return ESP_OK;}
inline esp_err_t twai_transmit(const twai_message_t* message,TickType_t){
 if(!twinCANStarted)return ESP_ERR_INVALID_STATE;
 if(!message||message->rtr||message->data_length_code>8||message->identifier>(message->extd?0x1fffffffU:0x7ffU))return ESP_ERR_INVALID_ARG;
 if(twinCANOutgoing.size()>=256)return ESP_ERR_TIMEOUT;
 TwinCANFrame frame;frame.id=message->identifier;frame.extended=message->extd;frame.size=message->data_length_code;
 std::copy_n(message->data,frame.size,frame.data);twinCANOutgoing.push_back(frame);return ESP_OK;
}
inline esp_err_t twai_receive(twai_message_t* message,TickType_t){
 if(!twinCANStarted)return ESP_ERR_INVALID_STATE;
 if(!message)return ESP_ERR_INVALID_ARG;
 if(twinCANIncoming.empty())return ESP_ERR_TIMEOUT;
 const auto frame=twinCANIncoming.front();twinCANIncoming.pop_front();*message={};
 message->identifier=frame.id;message->extd=frame.extended;message->data_length_code=frame.size;std::copy_n(frame.data,frame.size,message->data);return ESP_OK;
}
'''

MINICTRLBOX_PERIPHERALS = r'''
class CEeprom {
 unsigned address_;
public:
 CEeprom(unsigned address=0x50):address_(address){}
 bool isPresent()const{return true;}
 unsigned getAddress()const{return address_;}
 unsigned getFreeSpace()const{return 4096;}
 std::string readProjectName()const{return twinProjectName;}
 void writeProjectName(const std::string& value){twinProjectName=value;twinStorageDirty=true;}
 bool writeUserData(const uint8_t* data,size_t size){if(size>twinEEPROM.size()||(!data&&size))return false;if(size)std::copy_n(data,size,twinEEPROM.begin());twinStorageDirty=true;return true;}
 bool readUserData(uint8_t* data,size_t size)const{if(size>twinEEPROM.size()||(!data&&size))return false;if(size)std::copy_n(twinEEPROM.begin(),size,data);return true;}
};
class CCanBus {
public:
 struct Frame{uint32_t canIdentifier=0;uint8_t dlc=0;uint8_t data[8]{};};
 CCanBus(int=21,int=20,unsigned=500000){}
 bool start(){twinCANInstalled=true;twinCANStarted=true;return true;}
 void stop(){twinCANStarted=false;}
 void restart(){stop();start();}
 bool busOffDetected()const{return false;}
 void setCANTermination(bool){}
 bool transmit(const Frame& frame,unsigned timeoutMs=100){twai_message_t message{};message.identifier=frame.canIdentifier;message.extd=frame.canIdentifier>0x7ff;message.data_length_code=frame.dlc;if(frame.dlc>8)return false;std::copy_n(frame.data,frame.dlc,message.data);return twai_transmit(&message,timeoutMs)==ESP_OK;}
 bool receive(Frame& frame,unsigned timeoutMs=100){twai_message_t message{};if(twai_receive(&message,timeoutMs)!=ESP_OK)return false;frame.canIdentifier=message.identifier;frame.dlc=message.data_length_code;std::copy_n(message.data,frame.dlc,frame.data);return true;}
};
'''
