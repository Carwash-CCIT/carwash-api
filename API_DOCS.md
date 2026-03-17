# 📡 Car Wash API Documentation

## Base URL
```
http://localhost:3000
```

## Authentication
All protected endpoints require the `Authorization` header:
```
Authorization: Bearer <your-access-token>
```

---

## 🔐 Auth Endpoints

### 1. Register - Request OTP
```http
POST /auth/register/request-otp
Content-Type: application/json

{
  "identifier": "0812345678" or "user@email.com"
}

Response (200):
{
  "message": "✅ ระบบได้ส่ง OTP ไปที่ ... แล้ว"
}
```

### 2. Register - Verify OTP
```http
POST /auth/register/verify-otp
Content-Type: application/json

{
  "identifier": "0812345678" or "user@email.com",
  "otp": "123456",
  "name": "John Doe",
  "password": "SecurePass123",  // Required for email, optional for phone
  "machine_id": 1  // Optional, auto-create session
}

Response (200):
{
  "message": "✅ สมัครสมาชิกสำเร็จ! ยินดีต้อนรับ John Doe",
  "token": "abc123...",
  "refreshToken": "def456...",
  "user": {
    "id": 1,
    "name": "John Doe",
    "phone": "0812345678",
    "balance": 0
  }
}
```

### 3. Login - Request OTP
```http
POST /auth/login/request-otp
Content-Type: application/json

{
  "identifier": "0812345678" or "user@email.com"
}

Response (200):
{
  "message": "✅ ระบบได้ส่ง OTP ไปที่ ... แล้ว"
}
```

### 4. Login - Verify OTP
```http
POST /auth/login/verify-otp
Content-Type: application/json

{
  "identifier": "0812345678" or "user@email.com",
  "otp": "123456",
  "machine_id": 1  // Optional
}

Response (200):
{
  "message": "✅ เข้าสู่ระบบสำเร็จ! สวัสดี John",
  "token": "abc123...",
  "refreshToken": "def456...",
  "user": { ... }
}
```

### 5. Login - Email & Password (Alternative)
```http
POST /auth/login
Content-Type: application/json

{
  "identifier": "user@email.com",
  "password": "SecurePass123",
  "machine_id": 1  // Optional
}

Response (200):
{
  "message": "✅ เข้าสู่ระบบสำเร็จ!",
  "token": "abc123...",
  "refreshToken": "def456...",
  "user": { ... }
}
```

### 6. Refresh Token
```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "def456..."
}

Response (200):
{
  "token": "new-token-abc123...",
  "refreshToken": "new-refresh-token-def456..."
}
```

### 7. Logout
```http
POST /auth/logout
Authorization: Bearer <your-access-token>

Response (200):
{
  "message": "✅ ออกจากระบบเรียบร้อย"
}
```

---

## 👤 User Endpoints

### Get Current User Info
```http
GET /me
Authorization: Bearer <your-access-token>

Response (200):
{
  "message": "✅ ข้อมูลบัญชีของคุณ",
  "user": {
    "id": 1,
    "name": "John Doe",
    "phone": "0812345678",
    "email": "john@email.com",
    "balance": 5000,
    "status": "active",
    "role": "user",
    "joined": "2024-01-15T10:30:00Z"
  }
}
```

---

## 💳 Wallet Endpoints

### Topup Wallet
```http
POST /topup
Authorization: Bearer <your-access-token>
Content-Type: application/json

{
  "amount": 1000
}

Response (200):
{
  "message": "✅ เติมเงิน ฿1000 สำเร็จ!",
  "balance": 6000
}
```

### Get Transaction History
```http
GET /wallet/history
Authorization: Bearer <your-access-token>

Response (200):
{
  "message": "✅ ประวัติการเงิน",
  "history": [
    {
      "id": 1,
      "user_id": 1,
      "action_type": "topup",
      "amount": 1000,
      "machine_id": null,
      "created_at": "2024-01-15T10:30:00Z"
    },
    ...
  ]
}
```

---

## 🏪 Machine Endpoints

### Get All Machines Status
```http
GET /machines

Response (200):
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
    },
    {
      "id": 2,
      "name": "Bay 2",
      "status": "busy",
      "session_id": 5,
      "start_time": "2024-01-15T14:30:00Z",
      "reserved_amount": 100,
      "user_name": "John Doe",
      "user_phone": "0812345678",
      "user_email": null,
      "user_balance": 4900
    }
  ]
}
```

---

## 🚗 Service Control Endpoints

### Start Service
```http
POST /service/start
Authorization: Bearer <your-access-token>
Content-Type: application/json

{
  "machine_id": 1,
  "command": "WATER_ON",
  "reserve_amount": 50
}

Valid commands: WATER_ON, FOAM_ON, AIR_ON, WAX_ON, TYRE_ON, STOP

Response (200):
{
  "message": "✅ เริ่มบริการสำเร็จ (WATER_ON)",
  "session_id": 5,
  "balance": 4950,
  "reserved": 50
}
```

### Stop Service
```http
POST /service/stop
Authorization: Bearer <your-access-token>
Content-Type: application/json

{
  "session_id": 5,
  "actual_amount": 45
}

Response (200):
{
  "message": "✅ หยุดบริการเรียบร้อย!",
  "used": 45,
  "refund": 5,
  "balance": 4955
}
```

---

## 💰 QR Payment Endpoints

### Create PromptPay QR
```http
POST /api/qr/create
Authorization: Bearer <your-access-token>
Content-Type: application/json

{
  "amount": 1000
}

Response (200):
{
  "qrImage": "data:image/png;base64,...",
  "qrRef": "CW1705330200000"
}
```

### SCB Webhook (Called by SCB server)
```http
POST /webhook/scb
Content-Type: application/json

{
  "data": {
    "ref3": "CW1705330200000",
    "amount": "1000",
    "transactionId": "..."
  }
}

Response (200):
{
  "status": "ok"
}
```

---

## 🔧 Admin Endpoints

**Requires:** `Authorization: Bearer <admin-token>` + `role="admin"`

### Get All Users
```http
GET /admin/users
Authorization: Bearer <admin-token>

Response (200):
{
  "message": "✅ รายชื่อสมาชิก",
  "users": [
    {
      "id": 1,
      "name": "John Doe",
      "phone": "0812345678",
      "email": "john@email.com",
      "balance": 4955,
      "status": "active",
      "role": "user",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### Topup User (Admin)
```http
POST /admin/topup
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "user_id": 1,
  "amount": 5000
}

Response (200):
{
  "message": "✅ เติมเงิน ฿5000 ให้ John Doe สำเร็จ!",
  "balance": 9955
}
```

### Deduct User Balance (Admin)
```http
POST /admin/deduct
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "user_id": 1,
  "amount": 1000
}

Response (200):
{
  "message": "✅ ลดเงิน ฿1000 จาก John Doe สำเร็จ!",
  "balance": 8955
}
```

### Send Command to Machine (Admin)
```http
POST /admin/command
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "machine_id": 1,
  "command": "WATER_ON"
}

Valid commands: WATER_ON, FOAM_ON, AIR_ON, WAX_ON, TYRE_ON, STOP

Response (200):
{
  "message": "✅ ส่งคำสั่ง WATER_ON ไปที่ Bay 1 เรียบร้อย!"
}
```

### Reset Bay (Force Stop)
```http
POST /admin/reset-bay
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "machine_id": 1
}

Response (200):
{
  "message": "✅ Reset Bay 1 เรียบร้อย"
}
```

### Get Finance Report (Admin)
```http
GET /admin/finance
Authorization: Bearer <admin-token>

Response (200):
{
  "message": "success",
  "data": {
    "daily": [
      {
        "label": "2024-01-15",
        "total": 15000,
        "count": 5
      }
    ],
    "weekly": [...],
    "monthly": [...],
    "summary": [
      {
        "today": 15000,
        "week": 45000,
        "month": 150000,
        "alltime": 500000
      }
    ]
  }
}
```

### Add User (Admin)
```http
POST /admin/users
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "name": "Jane Smith",
  "phone": "0887654321",
  "email": "jane@email.com",
  "password": "SecurePass123",
  "role": "user"  // or "admin"
}

Response (200):
{
  "message": "✅ เพิ่มผู้ใช้ Jane Smith สำเร็จ",
  "id": 2
}
```

### Change User Password (Admin)
```http
PUT /admin/users/:id/password
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "password": "NewSecurePass123"
}

Response (200):
{
  "message": "✅ เปลี่ยนรหัสผ่านสำเร็จ"
}
```

### Delete User (Admin)
```http
DELETE /admin/users/:id
Authorization: Bearer <admin-token>

Response (200):
{
  "message": "✅ ลบผู้ใช้ #1 สำเร็จ"
}
```

---

## 🤖 IoT Endpoints (For ESP8266)

### Get Pending Command
```http
GET /api/bay/:id/command

Response (200):
{
  "command": "WATER_ON"
}

// or if no pending command

Response (200):
{
  "command": null
}
```

### Report Status
```http
POST /api/bay/:id/status
Content-Type: application/json

{
  "status": "IDLE" or "BUSY"
}

Response (200):
{
  "message": "✅ อัปเดตสถานะ Bay 1 → IDLE"
}
```

---

## 🏥 System Endpoints

### Health Check
```http
GET /health

Response (200):
{
  "status": "ok",
  "timestamp": "2024-01-15T14:30:00Z"
}
```

---

## Error Responses

### Unauthorized (401)
```json
{
  "message": "❌ กรุณาเข้าสู่ระบบก่อน"
}
```

### Forbidden (403)
```json
{
  "message": "❌ ไม่มีสิทธิเข้าถึง (ต้องเป็น admin)"
}
```

### Not Found (404)
```json
{
  "message": "❌ ไม่พบตู้นี้"
}
```

### Rate Limited (429)
```json
{
  "message": "❌ ลองเข้าสู่ระบบเกินครั้ง กรุณารอ 15 นาที"
}
```

### Server Error (500)
```json
{
  "message": "❌ เกิดข้อผิดพลาดในระบบ"
}
```

---

## Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/auth/*` | 5 requests | 15 minutes |
| `/api/*` | 30 requests | 1 minute |
| Admin (exempt) | Unlimited | — |

---

## Token Details

### Access Token
- **Expiry:** 24 hours
- **Usage:** All protected endpoints
- **Header:** `Authorization: Bearer <token>`

### Refresh Token
- **Expiry:** Long-lived (no expiration)
- **Usage:** Only for `/auth/refresh` endpoint
- **Purpose:** Get new access token when expired

### Example Token Lifecycle
```
1. User logs in → Get access_token + refresh_token
2. User makes requests → Use access_token
3. After 24 hours, access_token expires
4. Call /auth/refresh with refresh_token
5. Get new access_token + refresh_token
6. Continue making requests
```

---

## Version History

### v1.1.0 (Current - Phase 1 Security)
- ✅ Token expiration (24 hours)
- ✅ Refresh token system
- ✅ Rate limiting
- ✅ Admin role & permission checks
- ✅ Input validation
- ✅ CORS configuration
- ✅ Global error handler

### v1.0.0 (Initial)
- Basic Auth (OTP)
- Wallet management
- Machine control
- Admin dashboard
