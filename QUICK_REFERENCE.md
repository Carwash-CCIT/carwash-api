# Quick Reference: URLs, Credentials & Endpoints

## 🔗 URLs

### Local Development
- **Server:** http://localhost:3000
- **Google Login:** http://localhost:3000/google-login.html
- **Dashboard:** http://localhost:3000/
- **Admin Users:** http://localhost:3000/admin/users
- **Admin Finance:** http://localhost:3000/admin/finance
- **Machines Status:** http://localhost:3000/machines

### Production (Render)
- **Server:** https://carwash-api-aygz.onrender.com
- **Google Login:** https://carwash-api-aygz.onrender.com/google-login.html
- **Dashboard:** https://carwash-api-aygz.onrender.com/
- **Admin Users:** https://carwash-api-aygz.onrender.com/admin/users
- **Admin Finance:** https://carwash-api-aygz.onrender.com/admin/finance
- **Machines Status:** https://carwash-api-aygz.onrender.com/machines
- **Health Check:** https://carwash-api-aygz.onrender.com/health

---

## 🔐 Google OAuth Credentials

See `.env.example` for credential values:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`

### Links
- **Google Cloud Console:** https://console.cloud.google.com
- **Project ID:** carwash-ccit

---

## 📡 API Endpoints

### Authentication

#### POST /auth/google
**Google OAuth Login/Register**
```bash
curl -X POST http://localhost:3000/auth/google \
  -H "Content-Type: application/json" \
  -d '{
    "idToken": "eyJhbGciOiJSUzI1NiI...",
    "machine_id": 1
  }'
```
**Response:**
```json
{
  "message": "✅ เข้าสู่ระบบสำเร็จ!",
  "token": "a1b2c3...",
  "refreshToken": "z9y8x7...",
  "user": { "id": 1, "name": "John", "email": "john@gmail.com", "balance": 0 }
}
```

#### POST /auth/refresh
**Refresh Access Token**
```bash
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "z9y8x7..."}'
```

#### POST /auth/logout
**Logout (requires token)**
```bash
curl -X POST http://localhost:3000/auth/logout \
  -H "Authorization: Bearer a1b2c3..."
```

#### GET /me
**Get Current User Profile (requires token)**
```bash
curl -X GET http://localhost:3000/me \
  -H "Authorization: Bearer a1b2c3..."
```

---

### Machines

#### GET /machines
**Get All Machines Status (NO AUTH)**
```bash
curl http://localhost:3000/machines
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
      "user_name": null
    },
    ...
  ]
}
```

---

### Service Control

#### POST /service/start
**Start Washing (requires token)**
```bash
curl -X POST http://localhost:3000/service/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer a1b2c3..." \
  -d '{
    "machine_id": 1,
    "command": "WATER_ON",
    "reserve_amount": 20
  }'
```
**Valid Commands:**
- `WATER_ON`, `FOAM_ON`, `AIR_ON`, `WAX_ON`, `TYRE_ON`, `STOP`

#### POST /service/stop
**Stop Washing (requires token)**
```bash
curl -X POST http://localhost:3000/service/stop \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer a1b2c3..." \
  -d '{
    "session_id": 5,
    "actual_amount": 15
  }'
```

---

### Wallet

#### POST /topup
**Add Money to Wallet (requires token)**
```bash
curl -X POST http://localhost:3000/topup \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer a1b2c3..." \
  -d '{"amount": 100}'
```

#### GET /wallet/history
**Transaction History (requires token)**
```bash
curl http://localhost:3000/wallet/history \
  -H "Authorization: Bearer a1b2c3..."
```

---

### Admin (PUBLIC - No Auth Required)

#### GET /admin/users
**List All Users**
```bash
curl http://localhost:3000/admin/users
```

#### POST /admin/topup
**Add Money to User's Wallet**
```bash
curl -X POST http://localhost:3000/admin/topup \
  -H "Content-Type: application/json" \
  -d '{"user_id": 1, "amount": 100}'
```

#### POST /admin/deduct
**Deduct Money from User's Wallet**
```bash
curl -X POST http://localhost:3000/admin/deduct \
  -H "Content-Type: application/json" \
  -d '{"user_id": 1, "amount": 50}'
```

#### POST /admin/command
**Send Command to Machine**
```bash
curl -X POST http://localhost:3000/admin/command \
  -H "Content-Type: application/json" \
  -d '{"machine_id": 1, "command": "WATER_ON"}'
```

#### GET /admin/finance
**Financial Reports**
```bash
curl http://localhost:3000/admin/finance
```

#### POST /admin/users
**Create New User**
```bash
curl -X POST http://localhost:3000/admin/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Admin",
    "phone": "0812345678",
    "email": "admin@example.com",
    "password": "Password123",
    "role": "admin"
  }'
```

#### DELETE /admin/users/:id
**Delete User**
```bash
curl -X DELETE http://localhost:3000/admin/users/1
```

#### PUT /admin/users/:id/password
**Change User Password**
```bash
curl -X PUT http://localhost:3000/admin/users/1/password \
  -H "Content-Type: application/json" \
  -d '{"password": "NewPassword123"}'
```

#### POST /admin/reset-bay
**Force Reset Machine**
```bash
curl -X POST http://localhost:3000/admin/reset-bay \
  -H "Content-Type: application/json" \
  -d '{"machine_id": 1}'
```

---

### ESP8266 (IoT)

#### GET /api/bay/:id/command
**Fetch Command for Machine**
```bash
curl http://localhost:3000/api/bay/1/command
```
**Response:**
```json
{"command": "WATER_ON"}
```
OR (if no command pending)
```json
{"command": null}
```

#### POST /api/bay/:id/status
**Report Machine Status**
```bash
curl -X POST http://localhost:3000/api/bay/1/status \
  -H "Content-Type: application/json" \
  -d '{"status": "IDLE"}'
```

---

### Payment (SCB PromptPay)

#### POST /api/qr/create
**Generate QR Code for Payment (requires token)**
```bash
curl -X POST http://localhost:3000/api/qr/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer a1b2c3..." \
  -d '{"amount": 100}'
```
**Response:**
```json
{
  "qrImage": "data:image/png;base64,...",
  "qrRef": "CW1704067200000"
}
```

#### POST /webhook/scb
**Payment Webhook (Called by SCB)**
```bash
curl -X POST http://localhost:3000/webhook/scb \
  -H "Content-Type: application/json" \
  -d '{
    "amount": "100.00",
    "reference3": "CW1704067200000",
    "transactionId": "SCB123456"
  }'
```

---

## 📊 Common Response Codes

| Code | Meaning |
|------|---------|
| `200` | Success ✅ |
| `400` | Bad Request (missing/invalid parameter) |
| `401` | Unauthorized (missing/invalid token) |
| `403` | Forbidden (insufficient permissions) |
| `404` | Not Found (resource doesn't exist) |
| `409` | Conflict (machine busy, etc.) |
| `500` | Server Error |

---

## 🗄️ Database

### SQLite Database File
- **Local:** `data/carwash.db`
- **Production (Render):** Persistent volume at `data/carwash.db`

### Tables
```sql
-- Users
SELECT * FROM users;

-- Machines (Bays)
SELECT * FROM machines;

-- Sessions (Washing sessions)
SELECT * FROM sessions;

-- Transactions (Wallet history)
SELECT * FROM transactions;
```

---

## 🚀 Quick Start Commands

```bash
# Install dependencies
npm install

# Start server (development)
npm run dev

# Start server (production)
npm start

# Check syntax
node -c server.js

# Initialize database
node init_db.js

# View database
sqlite3 data/carwash.db
```

---

## 📋 Environment Variables Template

```env
# Server
PORT=3000
NODE_ENV=development

# Google OAuth (see .env.example)
GOOGLE_CLIENT_ID=<value>
GOOGLE_CLIENT_SECRET=<value>
GOOGLE_REDIRECT_URI=https://carwash-api-aygz.onrender.com/auth/google/callback

# CORS
ALLOWED_ORIGINS=*

# Email (for OTP)
GMAIL_USER=your-email@gmail.com
GMAIL_PASS=your-app-password

# SMS (Thai Bulk SMS)
THAIBULKSMS_APP_KEY=your-key
THAIBULKSMS_APP_SECRET=your-secret

# Payment (SCB)
SCB_API_KEY=your-scb-key
SCB_API_SECRET=your-scb-secret
SCB_BILLER_ID=your-biller-id
SCB_MERCHANT_ID=your-merchant-id
SCB_SANDBOX=true

# Firebase (optional, for ESP8266)
FIREBASE_PROJECT_ID=carwash-ccit
```

---

## 📚 Documentation Files

- `GOOGLE_OAUTH_SETUP.md` - Setup & testing guide
- `DEPLOYMENT_CHECKLIST.md` - Production deployment steps
- `OAUTH_IMPLEMENTATION_DETAILS.md` - Technical implementation details
- `API_DOCS.md` - Complete API documentation
- `SECURITY.md` - Security features & best practices
- `PHASE1_COMPLETE.md` - Phase 1 completion summary

---

## 🔄 Git Workflow

```bash
# Check status
git status

# Stage changes
git add .

# Commit
git commit -m "feat: Add Google OAuth 2.0 integration"

# Push to GitHub
git push origin main

# Render auto-deploys on push
```

---

**Last Updated:** 2024
**Status:** ✅ Production Ready
**Version:** 1.1.0
