# ✅ Phase 1 Complete - Security & Stability

## 🎯 What Was Done

### Files Modified:
1. **server.js** - Main API server with security improvements
   - ✅ Token expiration (24 hours)
   - ✅ Refresh token system
   - ✅ Rate limiting middleware
   - ✅ Admin role & permission checks
   - ✅ Input validation functions
   - ✅ CORS configuration
   - ✅ Global error handler
   - ✅ Health check endpoint

2. **package.json** - Updated with:
   - ✅ `express-rate-limit` dependency (NEW)
   - ✅ `nodemon` dev dependency (for development)
   - ✅ Updated scripts (start, dev)
   - ✅ Better description & metadata

### Files Created:
1. **.env.example** - Template for environment variables
2. **SECURITY.md** - Complete security improvements documentation
3. **API_DOCS.md** - Full API reference (all endpoints)
4. **SETUP.md** - Installation & setup guide
5. **make-admin.js** - Script to create admin user

---

## 🔐 Security Improvements Summary

| Feature | Before | After | Impact |
|---------|--------|-------|--------|
| Token Expiration | ❌ Never expires | ✅ 24 hours | Prevents token theft |
| Refresh Tokens | ❌ None | ✅ Implemented | Secure re-auth |
| Rate Limiting | ❌ None | ✅ 5/15min auth, 30/min api | Prevents brute force |
| Admin Role | ❌ None | ✅ Required | Protects admin endpoints |
| Input Validation | ⚠️ Partial | ✅ Comprehensive | Prevents invalid data |
| CORS | ❌ All origins | ✅ Configurable | Prevents CSRF |
| Error Handling | ❌ Stack traces | ✅ Safe messages | Prevents info leak |
| Role Check | ❌ None | ✅ Middleware | Access control |

---

## 📋 How to Use Phase 1

### 1. Install New Dependency
```bash
npm install express-rate-limit
```

### 2. Setup Environment
```bash
cp .env.example .env
# Edit .env with your values
```

### 3. Initialize Database
```bash
node init_db.js
```

### 4. Create Admin User
```bash
node make-admin.js
```

### 5. Start Server
```bash
npm start
```

---

## 🔄 New API Features

### Token Expiration & Refresh
```bash
# Login - get token + refreshToken
POST /auth/login/verify-otp

# After 24 hours, token expires
# Refresh to get new one
POST /auth/refresh
{
  "refreshToken": "your-refresh-token"
}
```

### Admin Protection
All `/admin/*` endpoints now require:
- ✅ Authorization header with valid token
- ✅ User role = "admin"

```bash
# Protected endpoints
GET /admin/users
POST /admin/topup
POST /admin/deduct
POST /admin/command
GET /admin/finance
DELETE /admin/users/:id
PUT /admin/users/:id/password
POST /admin/users
```

### Rate Limiting
- **Auth endpoints:** 5 requests per 15 minutes
- **API endpoints:** 30 requests per minute
- **Admins:** Bypass rate limiting

---

## 📊 Database Schema Changes

### New columns in users table:
```sql
ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';
ALTER TABLE users ADD COLUMN token_expires DATETIME;
ALTER TABLE users ADD COLUMN refresh_token TEXT;
```

These are auto-migrated when server starts.

---

## 🚀 Test the Security Features

### Test 1: Token Expiration
```bash
# Get token
curl -X POST http://localhost:3000/auth/login/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"identifier":"...","otp":"...","machine_id":1}'

# Use token (works)
curl -X GET http://localhost:3000/me \
  -H "Authorization: Bearer <token>"

# Wait 24 hours or manually check token_expires in DB
# Try again (should fail with "Token expired")

# Refresh token
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<refresh-token>"}'

# Use new token (works again)
```

### Test 2: Rate Limiting
```bash
# Try 6 login requests in 15 minutes
# 6th should be blocked
for i in {1..6}; do
  curl -X POST http://localhost:3000/auth/login/request-otp \
    -H "Content-Type: application/json" \
    -d '{"identifier":"test@example.com"}'
  echo "Request $i - $(date)"
  sleep 1
done

# 6th response: "❌ ลองเข้าสู่ระบบเกินครั้ง..."
```

### Test 3: Admin Permission Check
```bash
# Login as regular user
TOKEN=$(curl -X POST http://localhost:3000/auth/login/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"identifier":"...","otp":"..."}' | jq -r '.token')

# Try to access admin endpoint (should fail)
curl -X GET http://localhost:3000/admin/users \
  -H "Authorization: Bearer $TOKEN"
# Response: "❌ ไม่มีสิทธิเข้าถึง"

# Login as admin user (created by make-admin.js)
ADMIN_TOKEN=$(curl -X POST http://localhost:3000/auth/login/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"identifier":"...","otp":"..."}' | jq -r '.token')

# Try again (should succeed)
curl -X GET http://localhost:3000/admin/users \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Response: User list
```

### Test 4: Input Validation
```bash
# Invalid amount (negative)
curl -X POST http://localhost:3000/topup \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"amount":-100}'
# Response: "❌ จำนวนเงินไม่ถูกต้อง"

# Invalid phone format
curl -X POST http://localhost:3000/auth/register/request-otp \
  -H "Content-Type: application/json" \
  -d '{"identifier":"123"}'
# Response: "❌ รูปแบบเบอร์โทรหรืออีเมลไม่ถูกต้อง"

# Invalid password
curl -X POST http://localhost:3000/auth/register/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"identifier":"test@email.com","otp":"123456","name":"Test","password":"weak"}'
# Response: "❌ รหัสผ่านต้องมี 6 ตัวอักษร..."
```

---

## 📚 Documentation Files

1. **SECURITY.md** (5.2 KB)
   - Security improvements explained
   - Checklist
   - How to use new features
   - Production checklist

2. **API_DOCS.md** (11 KB)
   - Complete API reference
   - All endpoints with examples
   - Error responses
   - Rate limiting info

3. **SETUP.md** (8.6 KB)
   - Installation instructions
   - First-time setup
   - Testing guide
   - Troubleshooting
   - Production checklist

---

## ⚠️ Important Notes

### Token Management
- Access Token: Expires in 24 hours
- Refresh Token: Long-lived (no expiration)
- Frontend must handle token refresh automatically
- When token expires, use refresh token to get new one

### Admin User
- Created using `node make-admin.js`
- Makes first active user an admin
- To make more users admin, update DB directly:
  ```sql
  UPDATE users SET role='admin' WHERE id=2;
  ```

### Production Safety
- Set `NODE_ENV=production` in .env
- Update `ALLOWED_ORIGINS` to your actual domain
- Use HTTPS only
- Enable database backups
- Monitor logs regularly

### Database
- SQLite3 still used (works fine for now)
- Can be migrated to PostgreSQL in Phase 2
- Auto-migration adds new columns on startup

---

## 🔄 Next Steps (Phase 2)

### Phase 2: Containerize with Docker
- Create `Dockerfile` for Node.js app
- Create `docker-compose.yml` for:
  - Node.js backend
  - PostgreSQL database
  - Redis (for sessions cache)
- Setup environment for easy deployment
- Create CI/CD pipeline

**Estimated Time:** 1-2 days

### Phase 3: Testing & Documentation (Optional for now)
- Jest unit tests
- API integration tests
- Swagger documentation

### Phase 4: Customer App
- Customer-facing login page
- Wallet UI
- Service control interface
- Transaction history
- Mobile responsive design

---

## ✅ Checklist to Verify Phase 1 is Working

- [ ] `npm install express-rate-limit` completed
- [ ] `.env` file configured with real credentials
- [ ] `node init_db.js` created database
- [ ] `node make-admin.js` created admin user
- [ ] `npm start` server running without errors
- [ ] `GET /health` returns `{"status":"ok"}`
- [ ] Can login and get token
- [ ] Token works for 24 hours
- [ ] Token refresh works
- [ ] Rate limiting blocks after 5 auth requests
- [ ] Admin endpoints protected
- [ ] Regular users can't access admin endpoints
- [ ] Input validation works
- [ ] Error messages are safe (no stack traces)

---

## 📞 Need Help?

- Check `SETUP.md` for troubleshooting
- Check `SECURITY.md` for security details
- Check `API_DOCS.md` for endpoint reference
- Server logs show detailed error messages

---

## 🎉 Summary

Phase 1 successfully added:
- ✅ Token expiration & refresh system
- ✅ Rate limiting (brute force protection)
- ✅ Admin role & permission system
- ✅ Comprehensive input validation
- ✅ CORS configuration
- ✅ Global error handling
- ✅ Complete documentation

**Status:** ✅ READY FOR PHASE 2

Next: Containerize with Docker (Phase 2)
