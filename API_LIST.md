# 📚 API Complete List (ทั้งหมด)

## 🔑 Authentication (สมัครสมาชิก + เข้าสู่ระบบ)

| Method | Endpoint | ตัวอักษร | ทำหน้าที่ |
|--------|----------|------|---------|
| POST | /auth/register/request-otp | ขอ OTP สำหรับสมัครสมาชิก (โทร/อีเมล) |
| POST | /auth/register/verify-otp | ยืนยัน OTP และสมัครสมาชิก |
| POST | /auth/login | เข้าสู่ระบบด้วย Email + Password |
| POST | /auth/login/request-otp | ขอ OTP สำหรับเข้าสู่ระบบ |
| POST | /auth/login/verify-otp | ยืนยัน OTP และเข้าสู่ระบบ |
| POST | /auth/google | เข้าสู่ระบบด้วย Google ID Token |
| GET | /auth/google/callback | Google OAuth Callback (Redirect) |
| POST | /auth/refresh | รีเฟรช Token |
| POST | /auth/logout | ออกจากระบบ |
| GET | /me | ดูข้อมูลผู้ใช้ปัจจุบัน |

---

## 👛 Wallet & Payment (เงิน)

| Method | Endpoint | ทำหน้าที่ | Auth |
|--------|----------|--------|------|
| POST | /topup | เติมเงิน (Manual) | ✅ |
| GET | /wallet/history | ดูประวัติการเงิน | ✅ |
| POST | /api/qr/create | สร้าง QR Code SCB | ✅ |
| POST | /webhook/scb | Webhook รับแจ้ง SCB | ❌ |

---

## 🚗 Machine Status (สถานะตู้)

| Method | Endpoint | ทำหน้าที่ | Auth |
|--------|----------|--------|------|
| GET | /machines | ดูรายชื่อตู้ทั้งหมด | ❌ |
| GET | /api/bay/{id}/command | ESP8266 ดึงคำสั่ง | ❌ |
| POST | /api/bay/{id}/status | ESP8266 ส่งสถานะ | ❌ |

---

## 🚿 Service Control (เปิด/ปิดเครื่อง)

| Method | Endpoint | ทำหน้าที่ | Auth |
|--------|----------|--------|------|
| POST | /service/start | เริ่มบริการ + หักเงิน | ✅ |
| POST | /service/stop | หยุดบริการ + คำนวณเงิน | ✅ |

---

## 🛠️ Admin (ควบคุมระบบ)

| Method | Endpoint | ทำหน้าที่ | Auth |
|--------|----------|--------|------|
| GET | /admin/users | ดูรายชื่อผู้ใช้ | ❌ |
| POST | /admin/users | สร้างผู้ใช้ใหม่ | ❌ |
| POST | /admin/topup | เติมเงินให้ผู้ใช้ | ❌ |
| POST | /admin/deduct | หักเงินจากผู้ใช้ | ❌ |
| POST | /admin/command | ส่งคำสั่งไปตู้ | ❌ |
| POST | /admin/reset-bay | Reset ตู้ | ❌ |
| GET | /admin/finance | ดูรายงานการเงิน | ❌ |
| DELETE | /admin/users/{id} | ลบผู้ใช้ | ❌ |
| PUT | /admin/users/{id}/password | เปลี่ยนรหัสผ่าน | ❌ |

---

## 🔍 Legacy / Utility

| Method | Endpoint | ทำหน้าที่ |
|--------|----------|--------|
| GET | /user/{identifier} | ค้นหาผู้ใช้ (โทรศัพท์/อีเมล) |
| GET | /health | ตรวจสอบสถานะ API |

---

## 📊 API Breakdown by Usage

### ✅ Frontend (Web/App)
```
- Auth: /auth/login, /auth/register, /auth/logout, /me
- Wallet: /topup, /wallet/history, /api/qr/create
- Service: /service/start, /service/stop
- Dashboard: /machines
```

### ✅ ESP8266 (IoT Board)
```
- Command: GET /api/bay/{id}/command
- Status: POST /api/bay/{id}/status
```

### ✅ Admin Dashboard
```
- Command: /admin/command
- Users: /admin/users, /admin/topup, /admin/deduct
- Finance: /admin/finance
- Reset: /admin/reset-bay
```

---

## 🌍 Query Parameters

### /machines
```
GET /machines
```
ไม่มี parameter

### /wallet/history
```
GET /wallet/history
```
ไม่มี parameter (ดึง 20 รายการล่าสุด)

### /me
```
GET /me?machine_id=1
```
Optional: `machine_id` - สร้าง session สำหรับตู้นั้นทันที

---

## 🔐 Header ที่จำเป็น

### ทุก API ที่ต้อง Auth (✅ Auth)
```
Authorization: Bearer {token}
Content-Type: application/json
```

### API ที่ไม่ต้อง Auth (❌ Auth)
```
Content-Type: application/json
```

---

## ⏱️ Rate Limiting

```
/auth/*        → 5 requests ต่อ 15 นาที
/api/*         → 30 requests ต่อ นาที
Admin bypass   → ไม่มี limit
```

---

## 🎯 Common Use Cases

### 1️⃣ สมัครสมาชิก + เข้าสู่ระบบ
```
POST /auth/register/request-otp
→ POST /auth/register/verify-otp
→ ได้ token
```

### 2️⃣ เปิดเครื่องฉีดน้ำ
```
POST /service/start (reserve 50 บาท)
→ ESP8266 ดึง GET /api/bay/1/command → WATER_ON
→ ESP8266 เปิด PIN → POST /api/bay/1/status (BUSY)
```

### 3️⃣ ปิดเครื่อง
```
POST /service/stop (จริง 45 บาท, คืน 5 บาท)
→ ESP8266 ดึง GET /api/bay/1/command → STOP
→ ESP8266 ปิด PIN → POST /api/bay/1/status (IDLE)
```

### 4️⃣ เติมเงิน
```
POST /topup (เติม 100 บาท)
หรือ
POST /api/qr/create (สร้าง QR)
→ User สแกน QR
→ POST /webhook/scb (เงินเข้า)
```

### 5️⃣ Admin ดูรายงาน
```
GET /admin/users
GET /admin/finance
POST /admin/command (ส่งคำสั่งเล่นทดสอบ)
```

---

## 📱 Example cURL Commands

### Login
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"user@email.com","password":"Pass123"}'
```

### เติมเงิน
```bash
curl -X POST http://localhost:3000/topup \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"amount":100}'
```

### เปิดเครื่องน้ำ
```bash
curl -X POST http://localhost:3000/service/start \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"machine_id":1,"command":"WATER_ON","reserve_amount":50}'
```

### ESP8266 ดึงคำสั่ง
```bash
curl "http://localhost:3000/api/bay/1/command"
```

### ESP8266 ส่งสถานะ
```bash
curl -X POST http://localhost:3000/api/bay/1/status \
  -H "Content-Type: application/json" \
  -d '{"status":"BUSY"}'
```

### Admin ส่งคำสั่ง
```bash
curl -X POST http://localhost:3000/admin/command \
  -H "Content-Type: application/json" \
  -d '{"machine_id":1,"command":"WATER_ON"}'
```

---

## ✅ API Status

- **Auth** → ✅ เสร็จ (Google OAuth + OTP)
- **Wallet** → ✅ เสร็จ (Manual + SCB QR)
- **Service** → ✅ เสร็จ (Start/Stop)
- **ESP8266** → ✅ เสร็จ (Command + Status)
- **Admin** → ✅ เสร็จ (Full management)
- **Firebase** → ✅ Optional (Realtime commands)

---

**พร้อมใช้ได้เลย!** 🚀
