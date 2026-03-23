# ESP8266 Relay ทดสอบง่ายๆ - Local Testing

## 🚀 ขั้นตอนการทดสอบ

### 1️⃣ Upload Sketch ทดสอบ

1. เปิด Arduino IDE
2. ไฟล์ → เปิด `ESP8266_TEST_SIMPLE.ino`
3. Tools → ตั้งค่าเดิมเหมือนเดิม:
   - Board: NodeMCU 1.0
   - Upload Speed: 115200
   - Port: COM3 (ของคุณ)
4. **Upload** (ปุ่มลูกศร)
5. รอ Upload สำเร็จ

### 2️⃣ เปิด Serial Monitor

1. Tools → Serial Monitor
2. ที่ด้านล่าง ตั้ง Baud Rate = **115200**
3. ตั้ง "Line ending" = **Both NL & CR**

### 3️⃣ ดูหน้าต่างตอนต้นเครื่อง

ควรเห็นข้อมูลแบบนี้:

```
╔════════════════════════════════════════╗
║   ESP8266 RELAY TEST - STARTING UP     ║
╚════════════════════════════════════════╝

╔════════════════════════════════════════╗
║      ESP8266 RELAY TEST - COMMANDS     ║
╚════════════════════════════════════════╝

🔧 Relay Control:
  water_on     - Turn ON water relay
  water_off    - Turn OFF water relay
  foam_on      - Turn ON foam relay
  foam_off     - Turn OFF foam relay
  air_on       - Turn ON air relay
  air_off      - Turn OFF air relay
  wax_on       - Turn ON wax relay
  wax_off      - Turn OFF wax relay
  tyre_on      - Turn ON tyre relay
  tyre_off     - Turn OFF tyre relay
  stop         - Stop ALL relays

📊 Status:
  status       - Show relay status
  sensors      - Show sensor readings
  help         - Show this menu

✅ Setup complete! Ready for testing.
```

---

## 🧪 ทดสอบ Commands

### ทดสอบ 1: เปิด - ปิด น้ำ

1. ในช่อง Serial Monitor พิมพ์: `water_on` แล้วกด ENTER
   ```
   >>> Command: water_on
   ✅ [ON]  WATER
   ```
   
   **💡 ผลที่คาดหวัง:** ควรเห็น Relay 1 ใจการ (มีเสียง "click")

2. พิมพ์: `water_off` แล้ว ENTER
   ```
   >>> Command: water_off
   ❌ [OFF] WATER
   ```
   
   **💡 ผลที่คาดหวัง:** Relay 1 ปิด (มีเสียง "click")

### ทดสอบ 2: ดูสถานะ Relay ทั้งหมด

พิมพ์: `status` แล้ว ENTER

```
═══════════════════════════════════
📊 RELAY STATUS
═══════════════════════════════════
WATER  : 🔴 OFF
FOAM   : 🔴 OFF
AIR    : 🔴 OFF
WAX    : 🔴 OFF
TYRE   : 🔴 OFF
═══════════════════════════════════
```

### ทดสอบ 3: เปิดทุก Relay

ลองพิมพ์ คำสั่งเหล่านี้ ทีละคำ:

```
foam_on
air_on
wax_on
tyre_on
```

พิมพ์ `status` เพื่อดูผลลัพธ์:

```
═══════════════════════════════════
📊 RELAY STATUS
═══════════════════════════════════
WATER  : 🔴 OFF
FOAM   : 🟢 ON
AIR    : 🟢 ON
WAX    : 🟢 ON
TYRE   : 🟢 ON
═══════════════════════════════════
```

### ทดสอบ 4: ปิดทั้งหมด

พิมพ์: `stop` แล้ว ENTER

```
>>> Command: stop
❌ [OFF] WATER
❌ [OFF] FOAM
❌ [OFF] AIR
❌ [OFF] WAX
❌ [OFF] TYRE

🛑 [STOP] All relays OFF
```

---

## 📊 ตรวจสอบเซนเซอร์

พิมพ์: `sensors` แล้ว ENTER

```
═══════════════════════════════════
📡 SENSOR STATUS
═══════════════════════════════════
Water Level : ✅ OK
Motion      : 😴 None
Fault       : ✅ No
Coin Value  : 234
═══════════════════════════════════
```

---

## 📋 Commands ทั้งหมด

| Command | ผลลัพธ์ |
|---------|--------|
| `water_on` | เปิด Relay น้ำ |
| `water_off` | ปิด Relay น้ำ |
| `foam_on` | เปิด Relay โฟม |
| `foam_off` | ปิด Relay โฟม |
| `air_on` | เปิด Relay ลม |
| `air_off` | ปิด Relay ลม |
| `wax_on` | เปิด Relay เคลือบสี |
| `wax_off` | ปิด Relay เคลือบสี |
| `tyre_on` | เปิด Relay ยางดำ |
| `tyre_off` | ปิด Relay ยางดำ |
| `stop` | ปิดทั้งหมด |
| `status` | ดูสถานะ Relay |
| `sensors` | ดูข้อมูลเซนเซอร์ |
| `help` | ดูเมนูคำสั่ง |

---

## 🔗 GPIO Pin Mapping (ตรวจสอบ Wiring)

| Relay | Pin | GPIO |
|-------|-----|------|
| WATER | D6 | GPIO12 |
| FOAM | D5 | GPIO14 |
| AIR | D7 | GPIO13 |
| WAX | D0 | GPIO16 |
| TYRE | D8 | GPIO15 |

| Sensor | Pin | GPIO |
|--------|-----|------|
| Coin | A0 | ADC |
| Water Level | D1 | GPIO5 |
| Motion | D2 | GPIO4 |
| Fault | D3 | GPIO0 |

---

## 🔧 Troubleshooting

### ❌ Serial Monitor ไม่แสดงอะไร

```
วิธีแก้:
1. ลองเปลี่ยน Baud Rate เป็น 115200
2. กด Reset บนบอร์ด ESP8266
3. ลองพอร์ตอื่น
```

### ❌ Relay ไม่ขยับเมื่อพิมพ์คำสั่ง

```
วิธีแก้:
1. เช็ค GPIO pins ต่อถูกต้องหรือไม่
2. เช็ค Power Supply (5V 2A ขึ้นไป)
3. ลองต่อ LED แทน Relay ดู
4. ทดสอบ Relay ด้วยตรง Power
```

### ❌ Serial Monitor ได้เสียงแปลก หรือข้อความยุ่ง

```
วิธีแก้:
1. เปลี่ยน Baud Rate
2. ลบโปรแกรม → Upload ใหม่
3. ลองอีก USB port
```

---

## ✅ เมื่อทำสำเร็จแล้ว

1. ✅ Relay ทั้ง 5 ตัว ใจการได้
2. ✅ ปิดได้ด้วยคำสั่ง
3. ✅ Serial Monitor แสดงสถานะถูกต้อง
4. ✅ เซนเซอร์อ่านค่าได้

**ตอนนี้พร้อมที่จะเชื่อมต่อ Server แล้ว!** 🎉

---

## 🔜 ขั้นต่อไป

เมื่อทดสอบเสร็จแล้ว:

1. ลบ Sketch นี้
2. Upload Sketch ที่เชื่อมต่อ Server (BOARD_SETUP.md)
3. เปลี่ยนเป็น WiFi mode
4. ทดสอบผ่าน API
5. ทดสอบผ่าน Mobile App

---

**หากมีปัญหา** ดูที่ Serial Monitor output
