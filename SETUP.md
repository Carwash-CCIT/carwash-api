# 🚀 Setup Guide - Car Wash System

## Prerequisites

- Node.js (v14+)
- npm or yarn
- SQLite3 (included with sqlite3 npm package)
- Gmail App Password (for OTP emails)
- Thai BulkSMS account (for OTP SMS)
- SCB API credentials (for PromptPay QR)

---

## Installation Steps

### 1. Install Dependencies
```bash
npm install
```

This will install:
- `express` - Web framework
- `sqlite3` - Database
- `bcryptjs` - Password hashing
- `nodemailer` - Email sending
- `axios` - HTTP requests
- `express-rate-limit` - Rate limiting (NEW - Phase 1)
- `thaibulksms-api` - SMS OTP
- And more...

### 2. Setup Environment Variables

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Edit `.env` with your credentials:
```env
PORT=3000
NODE_ENV=development

# Gmail (get App Password from Google Account settings)
GMAIL_USER=your-email@gmail.com
GMAIL_PASS=your-app-password

# Thai Bulk SMS
THAIBULKSMS_APP_KEY=your-api-key
THAIBULKSMS_APP_SECRET=your-api-secret

# SCB PromptPay
SCB_API_KEY=your-scb-api-key
SCB_API_SECRET=your-scb-api-secret
SCB_BILLER_ID=your-biller-id
SCB_MERCHANT_ID=your-merchant-id
SCB_SANDBOX=true  # Set to false for production

# CORS
ALLOWED_ORIGINS=*  # Change to your domain in production
```

### 3. Initialize Database

```bash
node init_db.js
```

This creates:
- `data/carwash.db` - SQLite database
- 4 tables: users, machines, transactions, sessions
- 6 Bay machines (Bay 1-6)

Output:
```
✅ สร้างไฟล์ฐานข้อมูล carwash.db พร้อม 4 ตารางหลักเสร็จเรียบร้อย!
✅ สร้างข้อมูลตู้ล้างรถ Bay 1–6 สำเร็จ!
```

### 4. Create Admin User

```bash
node make-admin.js
```

This makes the first user an admin.

Output:
```
✅ ตั้ง User #1 (John Doe) เป็น admin สำเร็จ
   ตอนนี้ user นี้สามารถเข้าถึง /admin/* endpoints ได้แล้ว
```

---

## Running the Server

### Development (with auto-reload)
```bash
npm run dev
```
Requires `nodemon`. Install if needed:
```bash
npm install --save-dev nodemon
```

### Production
```bash
npm start
```

### Expected Output
```
✅ เชื่อมต่อฐานข้อมูล data/carwash.db สำเร็จ
🚀 Server ร้านล้างรถเริ่มทำงานแล้วที่ http://localhost:3000
📦 Environment: development
🔐 Rate limiting: Enabled
✅ Security: CORS + Token Expiration + Admin Role
```

---

## First Time Setup

### Step-by-step for new users:

1. **Start server**
   ```bash
   npm start
   ```
   Server runs at `http://localhost:3000`

2. **Create account (via OTP)**
   ```bash
   curl -X POST http://localhost:3000/auth/register/request-otp \
     -H "Content-Type: application/json" \
     -d '{"identifier":"0812345678"}'
   ```
   Check SMS for OTP code.

3. **Verify OTP**
   ```bash
   curl -X POST http://localhost:3000/auth/register/verify-otp \
     -H "Content-Type: application/json" \
     -d '{
       "identifier":"0812345678",
       "otp":"123456",
       "name":"John Doe",
       "machine_id":1
     }'
   ```
   
   Response includes:
   - `token` - Use for API requests
   - `refreshToken` - Use to get new token after 24 hours
   - `user` - Your info

4. **Make API requests**
   ```bash
   curl -X GET http://localhost:3000/me \
     -H "Authorization: Bearer <your-token>"
   ```

---

## Admin Dashboard

1. Open browser: `http://localhost:3000`
2. The frontend is in `/public` folder
3. Admin can:
   - View all machines & sessions
   - Send commands (WATER_ON, FOAM_ON, etc.)
   - View users & balance
   - Topup/deduct balance
   - View finance reports

---

## Testing the Features

### Test Token Expiration
```bash
# Token expires after 24 hours
# Use refresh endpoint to get new one
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"your-refresh-token"}'
```

### Test Rate Limiting
```bash
# Try 6 login requests in 15 minutes
# 6th request will be blocked
for i in {1..6}; do
  curl -X POST http://localhost:3000/auth/login/request-otp \
    -H "Content-Type: application/json" \
    -d '{"identifier":"test@example.com"}'
  echo "Request $i"
done
```

### Test Admin Protection
```bash
# Without admin role
curl -X GET http://localhost:3000/admin/users \
  -H "Authorization: Bearer <user-token>"
# Returns: 403 Forbidden

# With admin role
curl -X GET http://localhost:3000/admin/users \
  -H "Authorization: Bearer <admin-token>"
# Returns: 200 OK with user list
```

### Test Input Validation
```bash
# Invalid amount (negative)
curl -X POST http://localhost:3000/topup \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"amount":-100}'
# Returns: 400 Bad Request

# Valid amount
curl -X POST http://localhost:3000/topup \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"amount":1000}'
# Returns: 200 OK
```

---

## Database Structure

### users table
```
id (PRIMARY KEY)
phone (UNIQUE)
email (UNIQUE)
password (hashed with bcrypt)
name
balance
status (active/pending)
role (user/admin) ← NEW
token
token_expires ← NEW
refresh_token ← NEW
otp_code
otp_expires
otp_type
created_at
```

### machines table
```
id (PRIMARY KEY)
name
status (idle/busy)
pending_command (for IoT)
```

### sessions table
```
id (PRIMARY KEY)
user_id (FOREIGN KEY)
machine_id (FOREIGN KEY)
start_time
reserved_amount
status (active/finished/ended)
```

### transactions table
```
id (PRIMARY KEY)
user_id (FOREIGN KEY)
action_type (topup/usage/reserve/refund/deduct)
amount
machine_id (FOREIGN KEY)
created_at
```

---

## Troubleshooting

### Error: "Cannot find module 'express-rate-limit'"
```bash
npm install express-rate-limit
```

### Error: "EADDRINUSE: address already in use :::3000"
```bash
# Kill process using port 3000
# Windows:
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Mac/Linux:
lsof -i :3000
kill -9 <PID>
```

### Error: "ไม่สามารถเชื่อมต่อฐานข้อมูลได้"
```bash
# Database not created yet
node init_db.js
```

### Error: "ยังไม่ได้ตั้งค่า THAIBULKSMS_APP_KEY"
```bash
# Update .env with SMS credentials
# Or use email OTP instead (for testing)
```

### Error: "Token หมดอายุแล้ว"
```bash
# Token expires after 24 hours
# Use /auth/refresh to get new one
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"..."}'
```

### Error: "ลองเข้าสู่ระบบเกินครั้ง"
```bash
# Rate limiting activated
# Wait 15 minutes before trying again
```

---

## Configuration

### Change Port
```bash
# In .env
PORT=8080
```

### Change Database Path
Current: `data/carwash.db`
To change, edit `server.js` and `init_db.js`:
```javascript
const db = new sqlite3.Database(path.join(__dirname, 'path/to/carwash.db'));
```

### Change Rate Limits
In `server.js`:
```javascript
// Auth: 5 requests per 15 minutes
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5
});

// API: 30 requests per minute
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 30
});
```

### Change Token Expiration
In `server.js`, search for `token_expires`:
```javascript
// Currently 24 hours
const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

// Change to 1 hour:
const tokenExpires = new Date(Date.now() + 1 * 60 * 60 * 1000);
```

---

## Production Checklist

Before deploying to production:

- [ ] Set `NODE_ENV=production`
- [ ] Update `ALLOWED_ORIGINS` to your domain
- [ ] Use strong, unique passwords
- [ ] Setup HTTPS/SSL certificate
- [ ] Setup database backups
- [ ] Setup error logging (e.g., Sentry, DataDog)
- [ ] Setup monitoring & alerts
- [ ] Test all endpoints thoroughly
- [ ] Setup firewall rules
- [ ] Enable CORS properly
- [ ] Update rate limiting if needed
- [ ] Setup CI/CD pipeline
- [ ] Document API changes

---

## Next Steps

✅ **Phase 1 Complete:** Security & Stability
- Token expiration ✓
- Rate limiting ✓
- Admin permissions ✓
- Input validation ✓
- CORS ✓
- Error handling ✓

🔜 **Phase 2:** Containerize with Docker
- Next: `docker build` and `docker-compose.yml`

🔜 **Phase 3:** Testing & Documentation
- Next: Jest unit tests

🔜 **Phase 4:** Customer App
- Next: Public dashboard & mobile UI

See `SECURITY.md` for detailed security improvements.
See `API_DOCS.md` for API reference.
