# 🔌 ESP8266 API Reference (แบบสั้น)

## 📌 Base URL
```
http://localhost:3000
```
หรือ
```
https://carwash-api-aygz.onrender.com
```

---

## API #1: ดึงคำสั่ง (Polling)

**เรียก:** ทุก 2-3 วิ เท่านั้น

```
GET /api/bay/{machine_id}/command
```

### ตัวอย่าง:
```bash
GET /api/bay/1/command
```

### Response:
```json
{
  "command": "WATER_ON"
}
```

### ค่า command ที่เป็นไปได้:
```
WATER_ON  → เปิดน้ำ (PIN HIGH)
FOAM_ON   → เปิดฟอม (PIN HIGH)
AIR_ON    → เปิดลม (PIN HIGH)
WAX_ON    → เปิดเคลือบ (PIN HIGH)
TYRE_ON   → เปิดล้อ (PIN HIGH)
STOP      → ปิดทั้งหมด (PIN LOW)
null      → ไม่มีคำสั่ง
```

---

## API #2: ส่งสถานะ (Report Status)

**เรียก:** ทุกครั้งที่เปลี่ยนสถานะ หรือทุก 5-10 วิ

```
POST /api/bay/{machine_id}/status
Content-Type: application/json

{
  "status": "BUSY"
}
```

### ตัวอย่าง cURL:
```bash
curl -X POST http://localhost:3000/api/bay/1/status \
  -H "Content-Type: application/json" \
  -d '{"status":"BUSY"}'
```

### ค่า status:
```
BUSY  → กำลังใช้งาน
IDLE  → ว่าง/ปิด
```

### Response:
```json
{
  "message": "✅ อัปเดตสถานะ Bay 1 → BUSY"
}
```

---

## 📝 Flow ที่ควรเกิดขึ้น

```
1. ESP8266 ขึ้นมา → เชื่อมต่อ WiFi

2. Loop ทุก 2-3 วิ:
   GET /api/bay/1/command
   
3. ถ้าได้ command:
   - WATER_ON  → digitalWrite(PIN_WATER, HIGH)
   - FOAM_ON   → digitalWrite(PIN_FOAM, HIGH)
   - STOP      → digitalWrite(ALL_PINS, LOW)
   
4. ทันทีหลังจากเปลี่ยน:
   POST /api/bay/1/status
   {"status": "BUSY"} (ถ้าเปิด)
   {"status": "IDLE"} (ถ้าปิด)

5. กลับไป step 2
```

---

## 🔌 GPIO Pin Map (ตัวอย่าง ESP32)

```
PIN 13 → WATER (ฉีดน้ำ)
PIN 12 → FOAM  (ฟอม)
PIN 14 → AIR   (ลม)
PIN 27 → WAX   (เคลือบ)
PIN 26 → TYRE  (ล้อ)
PIN 25 → STOP  (ปุ่มหยุด manual)
```

ปรับตามที่คุณต้องการ

---

## 💡 Arduino Code Template

```cpp
#include <WiFi.h>
#include <HTTPClient.h>

const char* API_URL = "http://localhost:3000";
const int BAY_ID = 1;
const unsigned long CHECK_INTERVAL = 3000; // 3 วิ

void setup() {
  // เชื่อมต่อ WiFi
  // ตั้ง GPIO pins
}

void loop() {
  if (millis() - lastCheck >= CHECK_INTERVAL) {
    checkCommand();
    lastCheck = millis();
  }
}

void checkCommand() {
  HTTPClient http;
  String url = String(API_URL) + "/api/bay/" + BAY_ID + "/command";
  http.begin(url);
  
  if (http.GET() == 200) {
    String response = http.getString();
    
    if (response.indexOf("WATER_ON") != -1) {
      digitalWrite(PIN_WATER, HIGH);
      reportStatus("BUSY");
    }
    // เพิ่มคำสั่งอื่นๆ...
  }
  http.end();
}

void reportStatus(String status) {
  HTTPClient http;
  String url = String(API_URL) + "/api/bay/" + BAY_ID + "/status";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  String payload = "{\"status\":\"" + status + "\"}";
  http.POST(payload);
  http.end();
}
```

---

## ✅ Test ด้วย cURL

### Test API #1:
```bash
curl "http://localhost:3000/api/bay/1/command"
```

### Test API #2:
```bash
curl -X POST "http://localhost:3000/api/bay/1/status" \
  -H "Content-Type: application/json" \
  -d '{"status":"BUSY"}'
```

---

## 🔗 ส่วนที่เกี่ยวข้องใน server.js

```javascript
// ─── ESP8266 HTTP Polling API ──────────────────────────────────

app.get('/api/bay/:id/command', (req, res) => {
    const machine_id = parseInt(req.params.id);
    db.get("SELECT pending_command FROM machines WHERE id = ?", [machine_id], (err, row) => {
        if (err || !row) return res.status(404).json({ command: null, message: '❌ ไม่พบตู้นี้' });
        const cmd = row.pending_command;
        if (!cmd) return res.json({ command: null });
        db.run("UPDATE machines SET pending_command = NULL WHERE id = ?", [machine_id]);
        console.log(`📲 [ESP ${machine_id}] ดึงคำสั่ง: ${cmd}`);
        res.json({ command: cmd });
    });
});

app.post('/api/bay/:id/status', (req, res) => {
    const machine_id = parseInt(req.params.id);
    const { status } = req.body;
    if (!['IDLE', 'BUSY'].includes(status)) {
        return res.status(400).json({ message: '❌ status ต้องเป็น IDLE หรือ BUSY' });
    }
    const dbStatus = status === 'IDLE' ? 'idle' : 'busy';
    db.run("UPDATE machines SET status = ? WHERE id = ?", [dbStatus, machine_id], function (err) {
        if (err || this.changes === 0) return res.status(404).json({ message: '❌ ไม่พบตู้นี้' });
        console.log(`📡 [ESP ${machine_id}] รายงานสถานะ: ${status}`);
        res.json({ message: `✅ อัปเดตสถานะ Bay ${machine_id} → ${status}` });
    });
});
```

---

## 📋 Checklist ESP8266

- [ ] เชื่อมต่อ WiFi สำเร็จ
- [ ] ทดสอบ GET /api/bay/{id}/command
- [ ] ทดสอบ POST /api/bay/{id}/status
- [ ] ปรับ PIN ให้ตรงกับ hardware
- [ ] Loop polling ทำงานถูกต้อง
- [ ] ทดสอบเปิด/ปิด ตัวจริง

---

**ดีไหมครับ? ใช้ API นี้ 2 อันเท่านั้นแหละ!** 🎯
