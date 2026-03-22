# 🚗 Car Wash API Documentation

## 📌 Base URL
**Local:** `http://localhost:3000`  
**Production:** `https://carwash-api-aygz.onrender.com`

---

## 🔌 ESP8266 APIs (เฉพาะ ESP8266 ใช้)

### 1. ดึงคำสั่ง (ESP8266 polling ทุก 2-3 วิ)
```
GET /api/bay/{machine_id}/command
```

**Response:**
```json
{
  "command": "WATER_ON"
}
```

**ค่า command ที่เป็นไปได้:**
- `WATER_ON` - เปิดน้ำ
- `FOAM_ON` - เปิดฟอม
- `AIR_ON` - เปิดลม
- `WAX_ON` - เปิดเคลือบ
- `TYRE_ON` - เปิดทำความสะอาดล้อ
- `STOP` - ปิดทั้งหมด
- `null` - ไม่มีคำสั่งใหม่

**ตัวอย่าง cURL:**
```bash
curl http://localhost:3000/api/bay/1/command
```

---

### 2. ส่งสถานะ (ESP8266 ส่งหลังจากรับคำสั่ง)
```
POST /api/bay/{machine_id}/status
```

**Request Body:**
```json
{
  "status": "BUSY"
}
```

**Status ที่ส่งได้:**
- `BUSY` - กำลังใช้งาน
- `IDLE` - ว่าง

**Response:**
```json
{
  "message": "✅ อัปเดตสถานะ Bay 1 → BUSY"
}
```

**ตัวอย่าง cURL:**
```bash
curl -X POST http://localhost:3000/api/bay/1/status \
  -H "Content-Type: application/json" \
  -d '{"status":"BUSY"}'
```

---

## 👤 Authentication APIs (สำหรับ Frontend)

### 1. Login ด้วย Email & Password
```
POST /auth/login
```

**Request:**
```json
{
  "identifier": "user@email.com",
  "password": "Password123",
  "machine_id": 1
}
```

**Response:**
```json
{
  "message": "✅ เข้าสู่ระบบสำเร็จ! สวัสดี John",
  "token": "abc123xyz789...",
  "refreshToken": "def456uvw123...",
  "user": {
    "id": 1,
    "name": "John",
    "email": "user@email.com",
    "balance": 500
  }
}
```

---

### 2. ขอ OTP สำหรับ Login (โทรศัพท์/อีเมล)
```
POST /auth/login/request-otp
```

**Request:**
```json
{
  "identifier": "0812345678"
}
```

**Response:**
```json
{
  "message": "✅ ระบบได้ส่ง OTP ไปที่ 0812345678 แล้ว"
}
```

---

### 3. ยืนยัน OTP สำหรับ Login
```
POST /auth/login/verify-otp
```

**Request:**
```json
{
  "identifier": "0812345678",
  "otp": "123456",
  "machine_id": 1
}
```

**Response:**
```json
{
  "message": "✅ เข้าสู่ระบบสำเร็จ!",
  "token": "abc123xyz789...",
  "refreshToken": "def456uvw123...",
  "user": {
    "id": 1,
    "name": "สมชาย",
    "balance": 500
  }
}
```

---

### 4. ขอ OTP สำหรับสมัครสมาชิก
```
POST /auth/register/request-otp
```

**Request:**
```json
{
  "identifier": "0812345678"
}
```

---

### 5. ยืนยัน OTP สำหรับสมัครสมาชิก
```
POST /auth/register/verify-otp
```

**Request:**
```json
{
  "identifier": "0812345678",
  "otp": "123456",
  "name": "สมชาย",
  "password": "Password123",
  "machine_id": 1
}
```

**Password ต้องมี:**
- อย่างน้อย 6 ตัวอักษร
- มีพิมพ์เล็ก (a-z)
- มีพิมพ์ใหญ่ (A-Z)
- มีตัวเลข (0-9)

---

### 6. Refresh Token
```
POST /auth/refresh
```

**Request:**
```json
{
  "refreshToken": "def456uvw123..."
}
```

**Response:**
```json
{
  "token": "new_token_abc...",
  "refreshToken": "new_refresh_token..."
}
```

---

### 7. Logout
```
POST /auth/logout
```

**Header:**
```
Authorization: Bearer {token}
```

**Response:**
```json
{
  "message": "✅ ออกจากระบบเรียบร้อย"
}
```

---

### 8. ข้อมูลผู้ใช้ปัจจุบัน
```
GET /me
```

**Header:**
```
Authorization: Bearer {token}
```

**Response:**
```json
{
  "message": "✅ ข้อมูลบัญชีของคุณ",
  "user": {
    "id": 1,
    "name": "สมชาย",
    "email": "user@email.com",
    "phone": "0812345678",
    "balance": 500,
    "status": "active",
    "role": "user",
    "joined": "2024-01-15T10:30:00Z"
  }
}
```

---

## 💰 Wallet & Payment APIs

### 1. เติมเงิน (Manual - โดยไม่ผ่าน QR)
```
POST /topup
```

**Header:**
```
Authorization: Bearer {token}
```

**Request:**
```json
{
  "amount": 100
}
```

**Response:**
```json
{
  "message": "✅ เติมเงิน ฿100 สำเร็จ!",
  "balance": 600
}
```

---

### 2. สร้าง QR Code สำหรับจ่ายเงิน (SCB)
```
POST /api/qr/create
```

**Header:**
```
Authorization: Bearer {token}
```

**Request:**
```json
{
  "amount": 100
}
```

**Response:**
```json
{
  "qrImage": "base64_encoded_image...",
  "qrRef": "CW1704067200000"
}
```

---

### 3. ประวัติการเงิน
```
GET /wallet/history
```

**Header:**
```
Authorization: Bearer {token}
```

**Response:**
```json
{
  "message": "✅ ประวัติการเงิน",
  "history": [
    {
      "id": 1,
      "user_id": 1,
      "action_type": "topup",
      "amount": 100,
      "machine_id": null,
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

---

## 🚿 Service Control APIs (เปิด/ปิดเครื่อง)

### 1. เริ่มบริการ (เปิดเครื่อง + หักเงิน)
```
POST /service/start
```

**Header:**
```
Authorization: Bearer {token}
```

**Request:**
```json
{
  "machine_id": 1,
  "command": "WATER_ON",
  "reserve_amount": 50
}
```

**Response:**
```json
{
  "message": "✅ เริ่มบริการสำเร็จ (WATER_ON)",
  "session_id": 123,
  "balance": 450,
  "reserved": 50
}
```

---

### 2. หยุดบริการ (ปิดเครื่อง + คำนวณเงิน)
```
POST /service/stop
```

**Header:**
```
Authorization: Bearer {token}
```

**Request:**
```json
{
  "session_id": 123,
  "actual_amount": 45
}
```

**Response:**
```json
{
  "message": "✅ หยุดบริการเรียบร้อย!",
  "used": 45,
  "refund": 5,
  "balance": 455
}
```

---

## 🏪 Machine/Dashboard APIs

### 1. ดูรายชื่อตู้ทั้งหมด (ไม่ต้อง Token)
```
GET /machines
```

**Response:**
```json
{
  "message": "success",
  "data": [
    {
      "id": 1,
      "name": "Bay 1",
      "status": "idle",
      "session_id": null,
      "start_time": null,
      "reserved_amount": null,
      "user_name": null,
      "user_phone": null,
      "user_email": null,
      "user_balance": null
    }
  ]
}
```

---

## 🎛️ Admin APIs (สำหรับ Dashboard Admin)

### 1. ส่งคำสั่งไปยังตู้ (ไม่ต้อง Token)
```
POST /admin/command
```

**Request:**
```json
{
  "machine_id": 1,
  "command": "WATER_ON"
}
```

**Response:**
```json
{
  "message": "✅ ส่งคำสั่ง WATER_ON ไปที่ Bay 1 เรียบร้อย!"
}
```

---

### 2. Reset ตู้ (เคลียร์ session กำลังใช้งาน)
```
POST /admin/reset-bay
```

**Request:**
```json
{
  "machine_id": 1
}
```

**Response:**
```json
{
  "message": "✅ Reset Bay 1 เรียบร้อย"
}
```

---

### 3. ดูรายชื่อผู้ใช้ทั้งหมด
```
GET /admin/users
```

**Response:**
```json
{
  "message": "✅ รายชื่อสมาชิก",
  "users": [
    {
      "id": 1,
      "name": "สมชาย",
      "phone": "0812345678",
      "email": "user@email.com",
      "balance": 450,
      "status": "active",
      "role": "user",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

---

### 4. เติมเงินให้ผู้ใช้
```
POST /admin/topup
```

**Request:**
```json
{
  "user_id": 1,
  "amount": 100
}
```

**Response:**
```json
{
  "message": "✅ เติมเงิน ฿100 ให้ สมชาย สำเร็จ!",
  "balance": 550
}
```

---

### 5. หักเงินจากผู้ใช้
```
POST /admin/deduct
```

**Request:**
```json
{
  "user_id": 1,
  "amount": 50
}
```

**Response:**
```json
{
  "message": "✅ ลดเงิน ฿50 จาก สมชาย สำเร็จ!",
  "balance": 400
}
```

---

### 6. รายงานการเงิน
```
GET /admin/finance
```

**Response:**
```json
{
  "message": "success",
  "data": {
    "daily": [...],
    "weekly": [...],
    "monthly": [...],
    "summary": {
      "today": 5000,
      "week": 25000,
      "month": 100000,
      "alltime": 500000
    }
  }
}
```

---

## 🔒 Headers & Authentication

ทุก API ที่ต้องการ Token ให้ส่ง Header:
```
Authorization: Bearer {token}
```

**ตัวอย่าง:**
```bash
curl http://localhost:3000/me \
  -H "Authorization: Bearer abc123xyz789..."
```

---

## ❌ Error Responses

### Invalid Token
```
Status: 401
{
  "message": "❌ Token ไม่ถูกต้อง"
}
```

### Insufficient Balance
```
Status: 400
{
  "message": "❌ ยอดเงินไม่เพียงพอ ยอดเงินคงเหลือ ฿500"
}
```

### Machine Not Found
```
Status: 404
{
  "message": "❌ ไม่พบตู้นี้"
}
```

### Rate Limit Exceeded
```
Status: 429
{
  "message": "❌ เกินขีดจำกัดการใช้งาน"
}
```

---

## 📊 API Summary by User Type

| ผู้ใช้ | API ที่ใช้ |
|------|---------|
| **ESP8266** | GET /api/bay/{id}/command, POST /api/bay/{id}/status |
| **Frontend (User)** | Login, Register, /me, /topup, /service/start, /service/stop, /machines, /wallet/history |
| **Dashboard (Admin)** | /admin/command, /admin/reset-bay, /admin/users, /admin/topup, /admin/deduct, /admin/finance |

---

## 🚀 Ready to Deploy

ทุก API พร้อมใช้ได้ ตอนนี้เอาไปใช้กับ ESP8266 / Frontend ได้เลยครับ
