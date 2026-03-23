# ESP8266 บอร์ด - ขั้นตอนการตั้งค่า

## 📋 ส่วนประกอบที่ต้องเตรียม

### Hardware
- ✅ ESP8266 NodeMCU (D1 Mini หรือ NodeMCU V3)
- ✅ Relay Module 5 ช่อง (5V)
- ✅ Sensors:
  - Coin Sensor (ADC)
  - Water Level Sensor (Digital)
  - Motion Sensor (Digital)
  - Fault Sensor (Digital)
- ✅ Power Supply (5V 2A ขึ้นไป)
- ✅ USB Cable (สำหรับ Upload)
- ✅ Breadboard + Jumper Wires

### Software
- ✅ Arduino IDE (ดาวน์โหลด: https://www.arduino.cc/en/software)
- ✅ ESP8266 Board Package
- ✅ ArduinoJson Library
- ✅ Server API (Node.js)

---

## 🔧 ขั้นตอนที่ 1: ติดตั้ง Arduino IDE

1. ดาวน์โหลด Arduino IDE
2. ติดตั้งแล้วเปิดโปรแกรม
3. ไปที่ **File > Preferences**
4. ใน **Additional Board Manager URLs** เพิ่ม:
   ```
   https://arduino.esp8266.com/stable/package_esp8266com_index.json
   ```
5. กด OK

---

## 🔩 ขั้นตอนที่ 2: ติดตั้ง ESP8266 Board

1. ไปที่ **Tools > Board > Boards Manager**
2. ค้นหา `ESP8266`
3. ติดตั้ง `esp8266 by ESP8266 Community`
4. รอให้ดาวน์โหลดเสร็จ (ใช้เวลาประมาณ 2-3 นาที)

---

## 📦 ขั้นตอนที่ 3: ติดตั้ง Libraries ที่ต้องใช้

ไปที่ **Tools > Manage Libraries** และติดตั้ง:

1. **ArduinoJson** (v6.x ขึ้นไป)
   - ค้นหา: `ArduinoJson`
   - ติดตั้งโดย: Benoit Blanchon

2. **ESP8266WiFi** (มาพร้อม ESP8266 Board Package)

---

## 🔌 ขั้นตอนที่ 4: Wiring Diagram (การต่อสายไฟ)

### Relay Module Connections
```
ESP8266 Pin    →  Relay Module
GPIO12 (D6)    →  Relay 1 (WATER)
GPIO14 (D5)    →  Relay 2 (FOAM)
GPIO13 (D7)    →  Relay 3 (AIR)
GPIO16 (D0)    →  Relay 4 (WAX)
GPIO15 (D8)    →  Relay 5 (TYRE)

GND           →  Relay GND
5V (จาก PSU)  →  Relay VCC
```

### Sensor Connections
```
Sensor Type          ESP8266 Pin   Type
─────────────────────────────────────────────
Coin Sensor          A0 (ADC)      Analog
Water Level Sensor   D1 (GPIO5)    Digital
Motion Sensor        D2 (GPIO4)    Digital
Fault Sensor         D3 (GPIO0)    Digital

GND                  GND
5V (Sensors)         5V
```

---

## 💻 ขั้นตอนที่ 5: Upload Code to ESP8266

### 5.1 ใน Arduino IDE ไปที่ Tools เซ็ตค่า:
```
Board: NodeMCU 1.0 (ESP-12E Module)
Upload Speed: 115200
CPU Frequency: 80 MHz
Flash Size: 4M (3M SPIFFS)
Port: COM3 (หรือพอร์ตที่ ESP8266 ใช้)
```

### 5.2 คัดลอก Code นี้ไป Arduino IDE

```cpp
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <ArduinoJson.h>

// ─── GPIO Pin Mapping ───────────────────────────────────────
#define RELAY_WATER   D6  // GPIO12
#define RELAY_FOAM    D5  // GPIO14
#define RELAY_AIR     D7  // GPIO13
#define RELAY_WAX     D0  // GPIO16
#define RELAY_TYRE    D8  // GPIO15

#define SENSOR_COIN   A0  // ADC
#define SENSOR_WATER  D1  // GPIO5
#define SENSOR_MOTION D2  // GPIO4
#define SENSOR_FAULT  D3  // GPIO0

// ─── WiFi & Server Config ───────────────────────────────────
const char* ssid = "YOUR_WIFI_SSID";           // ⬅️ เปลี่ยนเป็น WiFi ของคุณ
const char* password = "YOUR_WIFI_PASSWORD";   // ⬅️ เปลี่ยนเป็น Password ของคุณ
const char* serverUrl = "http://192.168.1.100:3000"; // ⬅️ เปลี่ยนเป็น IP Server
const int bayId = 1;  // ⬅️ เปลี่ยนเป็นเลข Bay ที่ต่อกับบอร์ดนี้ (1-6)

// ─── Timers ─────────────────────────────────────────────────
unsigned long pollTimer = 0;
unsigned long statusTimer = 0;
const unsigned long pollInterval = 2000;      // Poll command every 2 seconds
const unsigned long statusInterval = 5000;    // Report status every 5 seconds

// ─── Relay Control Function ─────────────────────────────────
void setRelay(int pin, boolean state) {
    digitalWrite(pin, state ? HIGH : LOW);
    Serial.printf("[RELAY] Pin %d set to %s\n", pin, state ? "ON" : "OFF");
}

// ─── Stop All Relays ────────────────────────────────────────
void stopAllRelays() {
    setRelay(RELAY_WATER, false);
    setRelay(RELAY_FOAM, false);
    setRelay(RELAY_AIR, false);
    setRelay(RELAY_WAX, false);
    setRelay(RELAY_TYRE, false);
    Serial.println("[RELAY] All relays STOPPED");
}

// ─── Poll for Command from Server ──────────────────────────
void pollCommand() {
    if (millis() - pollTimer < pollInterval) return;
    pollTimer = millis();
    
    if (!WiFi.isConnected()) {
        Serial.println("[WiFi] Not connected, skipping poll");
        return;
    }

    HTTPClient http;
    String url = String(serverUrl) + "/api/bay/" + bayId + "/command";
    
    http.begin(url);
    int httpCode = http.GET();
    
    if (httpCode == 200) {
        String payload = http.getString();
        DynamicJsonDocument doc(256);
        deserializeJson(doc, payload);
        
        String command = doc["command"];
        if (command.length() > 0) {
            executeCommand(command);
            Serial.printf("[CMD] Executed: %s\n", command.c_str());
        }
    } else if (httpCode != 200) {
        Serial.printf("[HTTP] Error: %d\n", httpCode);
    }
    http.end();
}

// ─── Execute Command on Hardware ───────────────────────────
void executeCommand(String cmd) {
    if (cmd == "WATER_ON") setRelay(RELAY_WATER, true);
    else if (cmd == "WATER_OFF") setRelay(RELAY_WATER, false);
    else if (cmd == "FOAM_ON") setRelay(RELAY_FOAM, true);
    else if (cmd == "FOAM_OFF") setRelay(RELAY_FOAM, false);
    else if (cmd == "AIR_ON") setRelay(RELAY_AIR, true);
    else if (cmd == "AIR_OFF") setRelay(RELAY_AIR, false);
    else if (cmd == "WAX_ON") setRelay(RELAY_WAX, true);
    else if (cmd == "WAX_OFF") setRelay(RELAY_WAX, false);
    else if (cmd == "TYRE_ON") setRelay(RELAY_TYRE, true);
    else if (cmd == "TYRE_OFF") setRelay(RELAY_TYRE, false);
    else if (cmd == "STOP" || cmd == "EMERGENCY_STOP") stopAllRelays();
}

// ─── Report Status to Server ───────────────────────────────
void reportStatus() {
    if (millis() - statusTimer < statusInterval) return;
    statusTimer = millis();
    
    if (!WiFi.isConnected()) return;

    HTTPClient http;
    String url = String(serverUrl) + "/api/bay/" + bayId + "/sensors/report";
    
    DynamicJsonDocument doc(256);
    doc["waterLevel"] = digitalRead(SENSOR_WATER) == HIGH;
    doc["motionDetected"] = digitalRead(SENSOR_MOTION) == HIGH;
    doc["faultDetected"] = digitalRead(SENSOR_FAULT) == HIGH;
    doc["coinValue"] = analogRead(SENSOR_COIN);
    
    String payload;
    serializeJson(doc, payload);
    
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    int httpCode = http.POST(payload);
    
    if (httpCode == 200) {
        Serial.println("[STATUS] Reported to server");
    } else {
        Serial.printf("[STATUS] Error: %d\n", httpCode);
    }
    http.end();
}

// ─── Setup ──────────────────────────────────────────────────
void setup() {
    Serial.begin(115200);
    delay(100);
    
    // Initialize Relay Pins
    pinMode(RELAY_WATER, OUTPUT);
    pinMode(RELAY_FOAM, OUTPUT);
    pinMode(RELAY_AIR, OUTPUT);
    pinMode(RELAY_WAX, OUTPUT);
    pinMode(RELAY_TYRE, OUTPUT);
    stopAllRelays();
    
    // Initialize Sensor Pins
    pinMode(SENSOR_WATER, INPUT);
    pinMode(SENSOR_MOTION, INPUT);
    pinMode(SENSOR_FAULT, INPUT);
    
    Serial.println("\n\n[SETUP] Car Wash Bay #" + String(bayId) + " Starting...");
    Serial.println("[SETUP] Connecting to WiFi: " + String(ssid));
    
    // WiFi Connection
    WiFi.begin(ssid, password);
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(500);
        Serial.print(".");
        attempts++;
    }
    
    Serial.println();
    if (WiFi.isConnected()) {
        Serial.println("[WiFi] ✅ Connected!");
        Serial.println("[WiFi] IP: " + WiFi.localIP().toString());
        Serial.println("[WiFi] Server: " + String(serverUrl));
    } else {
        Serial.println("[WiFi] ❌ Failed to connect (will retry in loop)");
    }
}

// ─── Main Loop ──────────────────────────────────────────────
void loop() {
    // Reconnect WiFi if disconnected
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[WiFi] Reconnecting...");
        WiFi.reconnect();
    }
    
    // Poll for commands
    pollCommand();
    
    // Report status
    reportStatus();
    
    // Monitor fault sensor
    if (digitalRead(SENSOR_FAULT) == HIGH) {
        stopAllRelays();
        Serial.println("[FAULT] ⚠️ Detected! Emergency stop activated");
        delay(5000);
    }
    
    delay(100); // Small delay to avoid overwhelming
}
```

### 5.3 แก้ไข 3 ค่า สำคัญ:
```cpp
const char* ssid = "YOUR_WIFI_SSID";           // ⬅️ WiFi ชื่อ
const char* password = "YOUR_WIFI_PASSWORD";   // ⬅️ WiFi Password
const char* serverUrl = "http://192.168.1.100:3000"; // ⬅️ Server IP
const int bayId = 1;  // ⬅️ Bay Number (1-6)
```

### 5.4 Upload Code
1. คลิก **Verify** (✓) เพื่อตรวจสอบ Syntax
2. ต่อ USB กับ ESP8266
3. คลิก **Upload** (→) เพื่ออัปโหลด
4. รอสักครู่ แล้ว Upload สำเร็จ

---

## 🧪 ขั้นตอนที่ 6: Testing

### 6.1 ดูผลลัพธ์ใน Serial Monitor
1. ไปที่ **Tools > Serial Monitor**
2. Set Baud Rate เป็น **115200**
3. ควรเห็นข้อมูลแบบนี้:
```
[SETUP] Car Wash Bay #1 Starting...
[SETUP] Connecting to WiFi: YOUR_WIFI_SSID
..................
[WiFi] ✅ Connected!
[WiFi] IP: 192.168.1.50
[WiFi] Server: http://192.168.1.100:3000
```

### 6.2 ทดสอบคำสั่ง Relay ผ่าน API

เปิด Command Line/Terminal แล้วรันคำสั่ง:

```bash
# ทดสอบเชื่อมต่อ
curl http://192.168.1.100:3000/health

# เปิด Relay น้ำ (Bay 1)
curl -X POST http://192.168.1.100:3000/api/bay/1/relay/water/on

# ปิด Relay น้ำ
curl -X POST http://192.168.1.100:3000/api/bay/1/relay/water/off

# เปิด Relay โฟม
curl -X POST http://192.168.1.100:3000/api/bay/1/relay/foam/on

# Emergency Stop
curl -X POST http://192.168.1.100:3000/api/bay/1/relay/emergency-stop
```

### 6.3 ดูผลลัพธ์ใน Serial Monitor
```
[CMD] Executed: WATER_ON
[RELAY] Pin 12 set to ON
[STATUS] Reported to server
```

---

## 🚀 ขั้นตอนที่ 7: ใส่ให้ทำงาน

1. **ปิด Serial Monitor**
2. **ดำเนินการกับโปรแกรมอื่น** - บอร์ดจะทำงานอยู่เรื่อยๆ
3. **ทดสอบจากมือถือ** - เปิด App Car Wash แล้วคลิกปุ่มน้ำ/โฟม
4. **ตรวจสอบ** - ควรเห็น Relay ใช้งาน

---

## 🔍 Troubleshooting

### ❌ ไม่สามารถ Upload ได้
```
ปัญหา: "Failed to open COM3"
แก้: 
  1. ลองเปลี่ยน USB Cable
  2. ลองพอร์ตอื่น (COM4, COM5)
  3. ติดตั้ง CH340 Driver
  4. Restart Arduino IDE
```

### ❌ ไม่ได้เชื่อมต่อ WiFi
```
ปัญหา: "[WiFi] Reconnecting..."
แก้:
  1. ตรวจสอบ SSID/Password ให้ถูกต้อง
  2. เช็ค 2.4GHz WiFi (ESP8266 ไม่รองรับ 5GHz)
  3. เช็ค Signal Strength
```

### ❌ Relay ไม่ขยับ
```
ปัญหา: "[RELAY] Pin 12 set to ON" แต่ Relay ไม่ทำงาน
แก้:
  1. เช็ค Relay Wiring
  2. เช็ค Power Supply (5V 2A ขั้นต่ำ)
  3. ทดสอบ Relay ด้วยตรง Power
  4. เช็ค IN Pin เชื่อม GPIO ถูกต้อง
```

### ❌ Serial Monitor ไม่แสดงข้อมูล
```
ปัญหา: Serial Monitor ว่างเปล่า
แก้:
  1. เปลี่ยน Baud Rate เป็น 115200
  2. ลองพอร์ตอื่น
  3. กด Reset บนบอร์ด ESP8266
```

---

## 📱 API Endpoints (จากบอร์ด)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/bay/:id/command` | GET | ดึงคำสั่งถัดไป |
| `/api/bay/:id/sensors/report` | POST | ส่งข้อมูลเซนเซอร์ |
| `/api/bay/:id/relay/water/on` | POST | เปิดน้ำ |
| `/api/bay/:id/relay/foam/on` | POST | เปิดโฟม |
| `/api/bay/:id/relay/air/on` | POST | เปิดลม |
| `/api/bay/:id/relay/wax/on` | POST | เปิดเคลือบสี |
| `/api/bay/:id/relay/tyre/on` | POST | เปิดยางดำ |
| `/api/bay/:id/relay/emergency-stop` | POST | ปุ่ม Emergency Stop |

---

## 🎯 Next Steps

✅ บอร์ด setup เสร็จแล้ว!

1. ทดสอบกับระบบเต็ม
2. ปรับ pollInterval ถ้าต้องการความเร็ว
3. ตั้งค่า Sensors ให้เหมาะสม
4. ทดสอบ Emergency Stop ให้แน่ใจ

---

**หากมีปัญหา** ดูที่ Serial Monitor output และเช็ค IP ว่าถูกต้อง
