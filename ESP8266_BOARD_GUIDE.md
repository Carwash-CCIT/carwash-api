# 🚗 ESP8266 Board — Full API Integration Guide

ไฟล์ `ESP8266_BOARD_FULL.ino` คือโค้ดสำหรับ Board ล้างรถที่เชื่อมต่อ API ครบทุกปุ่ม

---

## 📌 การต่อวงจร (Pin Map)

| NodeMCU Pin | GPIO | ต่อกับ | หน้าที่ |
|---|---|---|---|
| D5 | GPIO14 | Relay 1 | น้ำ (WATER) |
| D6 | GPIO12 | Relay 2 | โฟม (FOAM) |
| D7 | GPIO13 | Relay 3 | ลม (AIR) |
| D0 | GPIO16 | Relay 4 | เคลือบสี (WAX) |
| D8 | GPIO15 | Relay 5 | ยางดำ (TYRE) |
| D1 | GPIO5  | Sensor | Water Level |
| D2 | GPIO4  | Sensor | Motion |
| D3 | GPIO0  | Sensor | Fault |
| A0 | ADC    | Sensor | Coin |

---

## ⚙️ ตั้งค่าก่อนอัปโหลด

เปิดไฟล์ `ESP8266_BOARD_FULL.ino` แก้ไขส่วน CONFIG:

```cpp
const char* WIFI_SSID     = "YOUR_WIFI_SSID";         // ชื่อ WiFi
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";     // รหัส WiFi
const char* SERVER_URL    = "http://192.168.1.100:3000"; // IP Server
const int   BAY_ID        = 1;                          // หมายเลข Bay (1-6)
```

---

## 📦 Library ที่ต้องติดตั้ง

เปิด Arduino IDE → Tools → Manage Libraries แล้วติดตั้ง:

| Library | เวอร์ชัน |
|---|---|
| `ArduinoJson` | 6.x |
| `ESP8266WiFi` | built-in (NodeMCU board) |
| `ESP8266HTTPClient` | built-in |

> Board URL: `http://arduino.esp8266.com/stable/package_esp8266com_index.json`

---

## 🌐 API Endpoints ที่ Board ใช้

### Board → Server (Board ดึง/ส่งเอง)

| Method | Endpoint | หน้าที่ |
|---|---|---|
| GET | `/api/bay/:id/command` | ดึง command ที่รอการทำงาน |
| POST | `/api/bay/:id/status` | รายงานสถานะ IDLE/BUSY |
| POST | `/api/bay/:id/sensors/report` | รายงานค่า sensor |

### App → Server → Board (ผู้ใช้กดปุ่ม)

| Method | Endpoint | คำสั่ง | หน้าที่ |
|---|---|---|---|
| POST | `/api/bay/1/relay/water/on` | `WATER_ON` | เปิดน้ำ |
| POST | `/api/bay/1/relay/water/off` | `WATER_OFF` | ปิดน้ำ |
| POST | `/api/bay/1/relay/foam/on` | `FOAM_ON` | เปิดโฟม |
| POST | `/api/bay/1/relay/foam/off` | `FOAM_OFF` | ปิดโฟม |
| POST | `/api/bay/1/relay/air/on` | `AIR_ON` | เปิดลม |
| POST | `/api/bay/1/relay/air/off` | `AIR_OFF` | ปิดลม |
| POST | `/api/bay/1/relay/wax/on` | `WAX_ON` | เปิดเคลือบสี |
| POST | `/api/bay/1/relay/wax/off` | `WAX_OFF` | ปิดเคลือบสี |
| POST | `/api/bay/1/relay/tyre/on` | `TYRE_ON` | เปิดยางดำ |
| POST | `/api/bay/1/relay/tyre/off` | `TYRE_OFF` | ปิดยางดำ |
| POST | `/api/bay/1/relay/emergency-stop` | `EMERGENCY_STOP` | หยุดฉุกเฉิน |

---

## 🔄 Flow การทำงาน

```
ผู้ใช้กดปุ่ม "น้ำ" บน App
        │
        ▼
POST /api/bay/1/relay/water/on
        │
        ▼
Server บันทึก pending_command = "WATER_ON" ลง DB
+ Push ไป Firebase (realtime)
        │
        ▼
ESP8266 poll GET /api/bay/1/command ทุก 2 วินาที
        │
        ▼
ได้รับ { command: "WATER_ON" }
        │
        ▼
เปิด Relay D5 (GPIO14) → น้ำพ่นออก 💦
        │
        ▼
รายงาน POST /api/bay/1/status { status: "BUSY" }
```

---

## 🧪 ทดสอบด้วย cURL

```bash
# ส่งคำสั่งเปิดน้ำ Bay 1
curl -X POST http://localhost:3000/api/bay/1/relay/water/on

# ส่งคำสั่งปิดน้ำ
curl -X POST http://localhost:3000/api/bay/1/relay/water/off

# ส่งคำสั่งหยุดทั้งหมด
curl -X POST http://localhost:3000/api/bay/1/relay/emergency-stop

# ดูคำสั่งที่ Board จะดึง (จำลองเป็น ESP8266)
curl http://localhost:3000/api/bay/1/command

# จำลอง ESP8266 รายงาน sensor
curl -X POST http://localhost:3000/api/bay/1/sensors/report \
  -H "Content-Type: application/json" \
  -d '{"waterLevel":true,"motionDetected":false,"faultDetected":false,"coinValue":0}'
```

---

## ⚡ ขั้นตอนอัปโหลด

1. เปิด Arduino IDE
2. เลือก Board: `NodeMCU 1.0 (ESP-12E Module)`
3. เลือก Port ที่ตรงกับ Board
4. แก้ค่า CONFIG (WiFi SSID, Password, Server URL, Bay ID)
5. กด Upload
6. เปิด Serial Monitor @ 115200 baud ดู log
