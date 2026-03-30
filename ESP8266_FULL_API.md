# 🔌 ESP8266 API Reference — Smart Car Wash

เอกสาร API ทั้งหมดสำหรับเชื่อมต่อ ESP8266 กับระบบตู้ล้างรถ

> **Base URL**: `http://<SERVER_IP>:3000`
> **Protocol**: HTTP REST API
> **Data Format**: JSON

---

## 📑 สารบัญ

1. [Command Polling (หลัก)](#1-command-polling)
2. [Status Report](#2-status-report)
3. [Relay Control](#3-relay-control)
4. [Sensor Report](#4-sensor-report)
5. [Session Info](#5-session-info)
6. [Pricing](#6-pricing)
7. [Health Check](#7-health-check)
8. [Firebase Real-time (ทางเลือก)](#8-firebase-real-time)
9. [Arduino Code สำหรับ ESP8266](#9-arduino-code)

---

## 1. Command Polling

> **ESP8266 ใช้ API นี้เป็นหลัก** — ดึงคำสั่งจาก server ทุกๆ 2 วินาที

```
GET /api/bay/:id/command
```

| Param | Type | Description |
|-------|------|-------------|
| `id`  | int  | หมายเลข Bay (1-6) |

**Response** (มีคำสั่ง):
```json
{ "command": "WATER_ON" }
```

**Response** (ไม่มีคำสั่ง):
```json
{ "command": null }
```

### Commands ที่เป็นไปได้ทั้งหมด:

| Command | คำสั่ง | GPIO ที่ต้องควบคุม |
|---------|--------|-------------------|
| `WATER_ON` | เปิดน้ำ | Relay 1 (D6/GPIO12) |
| `FOAM_ON` | เปิดโฟม | Relay 2 (D5/GPIO14) |
| `AIR_DRY` | เป่าลม | Relay 3 (D7/GPIO13) |
| `AIR_FILL` | เติมลมยาง | Relay 4 (D2/GPIO4) |
| `VACUUM` | ดูดฝุ่น | Relay 5 (D1/GPIO5) |
| `WAX_ON` | เคลือบเงา | Relay 6 (D0/GPIO16) |
| `TYRE_ON` | ยางดำ | Relay 7 (D8/GPIO15) |
| `HAND_WASH` | ล้างมือ | Relay 8 (D3/GPIO0) |
| `STOP` | หยุดทั้งหมด | ปิดทุก Relay |

> ⚠️ **สำคัญ**: หลัง ESP8266 ดึงคำสั่งแล้ว server จะลบ pending_command ออกอัตโนมัติ (ดึงได้ครั้งเดียว)

**ทดสอบ (curl)**:
```bash
curl http://localhost:3000/api/bay/1/command
```

---

## 2. Status Report

ESP8266 รายงานสถานะกลับไปที่ server

```
POST /api/bay/:id/status
```

**Body**:
```json
{
  "status": "BUSY"
}
```

| Field | Type | Values |
|-------|------|--------|
| `status` | string | `"IDLE"` หรือ `"BUSY"` |

**Response**:
```json
{ "message": "✅ อัปเดตสถานะ Bay 1 → BUSY" }
```

**ทดสอบ**:
```bash
curl -X POST http://localhost:3000/api/bay/1/status \
  -H "Content-Type: application/json" \
  -d "{\"status\": \"BUSY\"}"
```

---

## 3. Relay Control

สั่งเปิด/ปิด Relay โดยตรงผ่าน REST API

### เปิด Relay
```
POST /api/bay/:id/relay/:type/on
```

### ปิด Relay
```
POST /api/bay/:id/relay/:type/off
```

### Emergency Stop
```
POST /api/bay/:id/relay/emergency-stop
```

| Param | Type | Values |
|-------|------|--------|
| `id` | int | หมายเลข Bay (1-6) |
| `type` | string | `water`, `foam`, `air`, `wax`, `tyre`, `air_dry`, `air_fill`, `vacuum`, `hand_wash` |

**Response**:
```json
{
  "message": "✅ เปิด Relay WATER",
  "command": "WATER_ON",
  "bayId": 1
}
```

**ทดสอบ**:
```bash
# เปิดน้ำ Bay 1
curl -X POST http://localhost:3000/api/bay/1/relay/water/on

# เปิดดูดฝุ่น Bay 2
curl -X POST http://localhost:3000/api/bay/2/relay/vacuum/on

# Emergency Stop Bay 1
curl -X POST http://localhost:3000/api/bay/1/relay/emergency-stop
```

---

## 4. Sensor Report

ESP8266 ส่งข้อมูล sensor กลับมายัง server

### ส่งข้อมูล Sensor
```
POST /api/bay/:id/sensors/report
```

**Body**:
```json
{
  "waterLevel": true,
  "motionDetected": false,
  "faultDetected": false,
  "coinValue": 0,
  "relayStates": [1, 0, 0, 0, 0, 0, 0, 0]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `waterLevel` | bool | `true` = น้ำพอ, `false` = น้ำน้อย |
| `motionDetected` | bool | ตรวจจับการเคลื่อนไหว |
| `faultDetected` | bool | ตรวจจับความผิดปกติ (⚠️ ถ้า true → server จะสั่ง EMERGENCY_STOP) |
| `coinValue` | int | ค่าเหรียญ (ADC value) |
| `relayStates` | array | สถานะ relay ทั้งหมด |

### ดึงข้อมูล Sensor
```
GET /api/bay/:id/sensors
```

**ทดสอบ**:
```bash
curl -X POST http://localhost:3000/api/bay/1/sensors/report \
  -H "Content-Type: application/json" \
  -d "{\"waterLevel\":true,\"motionDetected\":false,\"faultDetected\":false,\"coinValue\":0}"
```

---

## 5. Session Info

ดึงข้อมูล session ปัจจุบันของ Bay (ใครกำลังใช้อยู่)

```
GET /api/bay/:id/session
```

**Response** (มี session):
```json
{
  "session": {
    "id": 5,
    "user_id": 12,
    "user_name": "สมชาย",
    "user_balance": 500,
    "user_phone": "0891234567",
    "reserved_amount": 100,
    "status": "active"
  },
  "message": "✅ Session found"
}
```

**Response** (ไม่มี session):
```json
{
  "session": null,
  "message": "ไม่มี session ที่กำลังใช้งาน"
}
```

---

## 6. Pricing

ดึงราคาบริการแต่ละประเภท

```
GET /api/pricing
```

**Response**:
```json
{
  "pricing": {
    "WATER_ON": 5,
    "FOAM_ON": 8,
    "AIR_ON": 3,
    "WAX_ON": 15,
    "TYRE_ON": 10
  },
  "minimum_balance": 10,
  "currency": "THB"
}
```

---

## 7. Health Check

ตรวจสอบว่า server ทำงานอยู่หรือไม่

```
GET /health
```

**Response**:
```json
{ "status": "ok", "timestamp": "2026-03-26T09:00:00.000Z" }
```

---

## 8. Firebase Real-time

คำสั่งจะถูก push ไปที่ Firebase Realtime Database ด้วย (ถ้า config แล้ว)

**Firebase Path Structure**:
```
/bays/{bayId}/
  ├── command/
  │   ├── action: "WATER_ON"
  │   └── timestamp: 1711432800000
  └── status/
      └── state: "BUSY"
```

ESP8266 สามารถ listen ที่ `/bays/{bayId}/command` แทนการ poll HTTP ได้

---

## 9. Arduino Code สำหรับ ESP8266

โค้ด Arduino ที่รองรับ **ทุกคำสั่ง** (9 commands) พร้อมใช้งาน:

```cpp
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <ArduinoJson.h>
#include <WiFiClient.h>

// ═══════════════════════════════════════════════
//  CONFIG — แก้ไขตรงนี้
// ═══════════════════════════════════════════════
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* SERVER_URL    = "http://192.168.1.100:3000";  // IP ของ server
const int   BAY_ID        = 1;  // หมายเลข Bay (1-6)

// ═══════════════════════════════════════════════
//  GPIO PIN MAPPING — 8 Relays
// ═══════════════════════════════════════════════
#define RELAY_WATER     D6   // GPIO12 — ฉีดน้ำ
#define RELAY_FOAM      D5   // GPIO14 — ฉีดโฟม
#define RELAY_AIR_DRY   D7   // GPIO13 — เป่าลม
#define RELAY_AIR_FILL  D2   // GPIO4  — เติมลม
#define RELAY_VACUUM    D1   // GPIO5  — ดูดฝุ่น
#define RELAY_WAX       D0   // GPIO16 — เคลือบเงา
#define RELAY_TYRE      D8   // GPIO15 — ยางดำ
#define RELAY_HANDWASH  D3   // GPIO0  — ล้างมือ

// Sensor Pins
#define SENSOR_COIN     A0   // ADC — เซ็นเซอร์เหรียญ
#define SENSOR_WATER    D4   // GPIO2 — ระดับน้ำ

// ═══════════════════════════════════════════════
//  TIMERS
// ═══════════════════════════════════════════════
unsigned long lastPoll   = 0;
unsigned long lastStatus = 0;
const unsigned long POLL_INTERVAL   = 2000;  // poll ทุก 2 วินาที
const unsigned long STATUS_INTERVAL = 5000;  // report สถานะทุก 5 วินาที

WiFiClient wifiClient;

// ═══════════════════════════════════════════════
//  RELAY CONTROL
// ═══════════════════════════════════════════════
void setRelay(int pin, bool state) {
    digitalWrite(pin, state ? HIGH : LOW);
    Serial.printf("[RELAY] Pin %d → %s\n", pin, state ? "ON" : "OFF");
}

void stopAllRelays() {
    setRelay(RELAY_WATER, false);
    setRelay(RELAY_FOAM, false);
    setRelay(RELAY_AIR_DRY, false);
    setRelay(RELAY_AIR_FILL, false);
    setRelay(RELAY_VACUUM, false);
    setRelay(RELAY_WAX, false);
    setRelay(RELAY_TYRE, false);
    setRelay(RELAY_HANDWASH, false);
    Serial.println("[RELAY] ✋ ALL RELAYS STOPPED");
}

// ═══════════════════════════════════════════════
//  EXECUTE COMMAND — รองรับทุกคำสั่ง
// ═══════════════════════════════════════════════
void executeCommand(String cmd) {
    Serial.printf("[CMD] Executing: %s\n", cmd.c_str());

    if      (cmd == "WATER_ON")   { stopAllRelays(); setRelay(RELAY_WATER, true); }
    else if (cmd == "FOAM_ON")    { stopAllRelays(); setRelay(RELAY_FOAM, true); }
    else if (cmd == "AIR_DRY")    { stopAllRelays(); setRelay(RELAY_AIR_DRY, true); }
    else if (cmd == "AIR_FILL")   { stopAllRelays(); setRelay(RELAY_AIR_FILL, true); }
    else if (cmd == "VACUUM")     { stopAllRelays(); setRelay(RELAY_VACUUM, true); }
    else if (cmd == "WAX_ON")     { stopAllRelays(); setRelay(RELAY_WAX, true); }
    else if (cmd == "TYRE_ON")    { stopAllRelays(); setRelay(RELAY_TYRE, true); }
    else if (cmd == "HAND_WASH")  { stopAllRelays(); setRelay(RELAY_HANDWASH, true); }
    else if (cmd == "STOP" || cmd == "EMERGENCY_STOP") { stopAllRelays(); }
    else { Serial.printf("[CMD] ⚠️ Unknown command: %s\n", cmd.c_str()); }

    // Report status back
    reportStatus(cmd == "STOP" || cmd == "EMERGENCY_STOP" ? "IDLE" : "BUSY");
}

// ═══════════════════════════════════════════════
//  POLL COMMAND FROM SERVER
// ═══════════════════════════════════════════════
void pollCommand() {
    if (millis() - lastPoll < POLL_INTERVAL) return;
    lastPoll = millis();

    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[WiFi] ❌ Not connected");
        return;
    }

    HTTPClient http;
    String url = String(SERVER_URL) + "/api/bay/" + BAY_ID + "/command";

    http.begin(wifiClient, url);
    int httpCode = http.GET();

    if (httpCode == 200) {
        String payload = http.getString();
        StaticJsonDocument<256> doc;
        deserializeJson(doc, payload);

        const char* command = doc["command"];
        if (command != nullptr && strlen(command) > 0) {
            Serial.printf("[POLL] ✅ Got command: %s\n", command);
            executeCommand(String(command));
        }
    } else if (httpCode > 0) {
        Serial.printf("[POLL] ⚠️ HTTP %d\n", httpCode);
    } else {
        Serial.printf("[POLL] ❌ Connection failed: %s\n", http.errorToString(httpCode).c_str());
    }
    http.end();
}

// ═══════════════════════════════════════════════
//  REPORT STATUS TO SERVER
// ═══════════════════════════════════════════════
void reportStatus(String status) {
    if (WiFi.status() != WL_CONNECTED) return;

    HTTPClient http;
    String url = String(SERVER_URL) + "/api/bay/" + BAY_ID + "/status";

    StaticJsonDocument<128> doc;
    doc["status"] = status;

    String payload;
    serializeJson(doc, payload);

    http.begin(wifiClient, url);
    http.addHeader("Content-Type", "application/json");
    int httpCode = http.POST(payload);

    if (httpCode == 200) {
        Serial.printf("[STATUS] ✅ Reported: %s\n", status.c_str());
    }
    http.end();
}

// ═══════════════════════════════════════════════
//  REPORT SENSOR DATA
// ═══════════════════════════════════════════════
void reportSensors() {
    if (millis() - lastStatus < STATUS_INTERVAL) return;
    lastStatus = millis();

    if (WiFi.status() != WL_CONNECTED) return;

    HTTPClient http;
    String url = String(SERVER_URL) + "/api/bay/" + BAY_ID + "/sensors/report";

    StaticJsonDocument<256> doc;
    doc["waterLevel"]      = digitalRead(SENSOR_WATER) == HIGH;
    doc["motionDetected"]  = false;
    doc["faultDetected"]   = false;
    doc["coinValue"]       = analogRead(SENSOR_COIN);

    JsonArray relays = doc.createNestedArray("relayStates");
    relays.add(digitalRead(RELAY_WATER));
    relays.add(digitalRead(RELAY_FOAM));
    relays.add(digitalRead(RELAY_AIR_DRY));
    relays.add(digitalRead(RELAY_AIR_FILL));
    relays.add(digitalRead(RELAY_VACUUM));
    relays.add(digitalRead(RELAY_WAX));
    relays.add(digitalRead(RELAY_TYRE));
    relays.add(digitalRead(RELAY_HANDWASH));

    String payload;
    serializeJson(doc, payload);

    http.begin(wifiClient, url);
    http.addHeader("Content-Type", "application/json");
    http.POST(payload);
    http.end();
}

// ═══════════════════════════════════════════════
//  WIFI CONNECT
// ═══════════════════════════════════════════════
void connectWiFi() {
    Serial.printf("\n[WiFi] Connecting to %s", WIFI_SSID);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 30) {
        delay(500);
        Serial.print(".");
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("\n[WiFi] ✅ Connected! IP: %s\n", WiFi.localIP().toString().c_str());
    } else {
        Serial.println("\n[WiFi] ❌ Failed to connect (will retry in loop)");
    }
}

// ═══════════════════════════════════════════════
//  SETUP
// ═══════════════════════════════════════════════
void setup() {
    Serial.begin(115200);
    delay(100);

    Serial.println("\n══════════════════════════════");
    Serial.printf("  Smart Car Wash — Bay %d\n", BAY_ID);
    Serial.println("══════════════════════════════");

    // Initialize all relay pins as OUTPUT
    int relayPins[] = {
        RELAY_WATER, RELAY_FOAM, RELAY_AIR_DRY, RELAY_AIR_FILL,
        RELAY_VACUUM, RELAY_WAX, RELAY_TYRE, RELAY_HANDWASH
    };
    for (int i = 0; i < 8; i++) {
        pinMode(relayPins[i], OUTPUT);
        digitalWrite(relayPins[i], LOW);
    }
    Serial.println("[INIT] ✅ All 8 relay pins initialized (OFF)");

    // Initialize sensor pins
    pinMode(SENSOR_WATER, INPUT);
    Serial.println("[INIT] ✅ Sensor pins initialized");

    // Connect WiFi
    connectWiFi();

    // Report initial IDLE status
    reportStatus("IDLE");
}

// ═══════════════════════════════════════════════
//  MAIN LOOP
// ═══════════════════════════════════════════════
void loop() {
    // Reconnect WiFi if disconnected
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[WiFi] ⚠️ Disconnected, reconnecting...");
        connectWiFi();
    }

    // Core functions
    pollCommand();
    reportSensors();

    delay(10);
}
```

---

## 🧪 ทดสอบ API ทั้งหมด (curl)

```bash
# ─── 1. Health Check ───────────────────────────
curl http://localhost:3000/health

# ─── 2. ดูสถานะ Bay ทั้งหมด ───────────────────
curl http://localhost:3000/machines

# ─── 3. ส่งคำสั่งจาก Admin Dashboard ──────────
# ฉีดน้ำ
curl -X POST http://localhost:3000/admin/command \
  -H "Content-Type: application/json" \
  -d "{\"machine_id\": 1, \"command\": \"WATER_ON\"}"

# ฉีดโฟม
curl -X POST http://localhost:3000/admin/command \
  -H "Content-Type: application/json" \
  -d "{\"machine_id\": 1, \"command\": \"FOAM_ON\"}"

# เป่าลม
curl -X POST http://localhost:3000/admin/command \
  -H "Content-Type: application/json" \
  -d "{\"machine_id\": 1, \"command\": \"AIR_DRY\"}"

# เติมลม
curl -X POST http://localhost:3000/admin/command \
  -H "Content-Type: application/json" \
  -d "{\"machine_id\": 1, \"command\": \"AIR_FILL\"}"

# ดูดฝุ่น
curl -X POST http://localhost:3000/admin/command \
  -H "Content-Type: application/json" \
  -d "{\"machine_id\": 1, \"command\": \"VACUUM\"}"

# เคลือบเงา
curl -X POST http://localhost:3000/admin/command \
  -H "Content-Type: application/json" \
  -d "{\"machine_id\": 1, \"command\": \"WAX_ON\"}"

# ยางดำ
curl -X POST http://localhost:3000/admin/command \
  -H "Content-Type: application/json" \
  -d "{\"machine_id\": 1, \"command\": \"TYRE_ON\"}"

# ล้างมือ
curl -X POST http://localhost:3000/admin/command \
  -H "Content-Type: application/json" \
  -d "{\"machine_id\": 1, \"command\": \"HAND_WASH\"}"

# หยุด
curl -X POST http://localhost:3000/admin/command \
  -H "Content-Type: application/json" \
  -d "{\"machine_id\": 1, \"command\": \"STOP\"}"

# ─── 4. ESP8266 ดึงคำสั่ง ─────────────────────
curl http://localhost:3000/api/bay/1/command

# ─── 5. ESP8266 รายงานสถานะ ───────────────────
curl -X POST http://localhost:3000/api/bay/1/status \
  -H "Content-Type: application/json" \
  -d "{\"status\": \"BUSY\"}"

# ─── 6. ESP8266 ส่งข้อมูล Sensor ──────────────
curl -X POST http://localhost:3000/api/bay/1/sensors/report \
  -H "Content-Type: application/json" \
  -d "{\"waterLevel\":true,\"motionDetected\":false,\"faultDetected\":false,\"coinValue\":0}"

# ─── 7. Relay Control โดยตรง ──────────────────
curl -X POST http://localhost:3000/api/bay/1/relay/water/on
curl -X POST http://localhost:3000/api/bay/1/relay/vacuum/on
curl -X POST http://localhost:3000/api/bay/1/relay/emergency-stop

# ─── 8. ดูข้อมูล Session ──────────────────────
curl http://localhost:3000/api/bay/1/session

# ─── 9. ดูราคาบริการ ──────────────────────────
curl http://localhost:3000/api/pricing
```

---

## 📊 Flow การทำงาน

```
┌──────────────────────────────────┐
│     Admin Dashboard / App        │
│  [น้ำ][โฟม][ลม][ดูดฝุ่น][หยุด]  │
└───────────┬──────────────────────┘
            │ POST /admin/command
            │ { machine_id: 1, command: "WATER_ON" }
            ▼
┌──────────────────────────────────┐
│         Node.js Server           │
│  1. บันทึก pending_command       │
│  2. Push ไป Firebase             │
│  3. ตอบกลับ Dashboard ✅         │
└───────────┬──────────────────────┘
            │
            ▼
┌──────────────────────────────────┐
│     ESP8266 (Poll ทุก 2 วิ)      │
│  GET /api/bay/1/command          │
│  → ได้ "WATER_ON"               │
│  → เปิด Relay GPIO12            │
│  → Report status "BUSY"          │
└──────────────────────────────────┘
```
