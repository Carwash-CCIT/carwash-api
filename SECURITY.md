# 🔐 Security Improvements - Phase 1

## Changes Made

### 1. **Token Expiration ⏰**
- Tokens now expire after 24 hours
- Added `token_expires` field to users table
- Frontend must use `/auth/refresh` endpoint to get new token
- **Before:** Token valid forever (dangerous!)
- **After:** Token + Refresh Token system

```javascript
// Request new token
POST /auth/refresh
{
  "refreshToken": "your-refresh-token"
}
```

### 2. **Rate Limiting 🚫**
- Added `express-rate-limit` middleware
- Auth endpoints: **5 requests per 15 minutes** (prevent brute force)
- API endpoints: **30 requests per minute** (prevent abuse)
- Admins bypass rate limiting

```javascript
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5
});
```

### 3. **Admin Permission Checks ✅**
- New `role` field (admin/user) added to users table
- All admin endpoints require:
  - `authMiddleware` (logged in)
  - `adminMiddleware` (has admin role)
- Added protection to prevent self-deletion

```javascript
// All admin routes protected
app.post('/admin/topup', authMiddleware, adminMiddleware, (req, res) => { ... })
```

### 4. **Input Validation 📋**
- Created validation functions:
  - `validatePhone()` - Thai phone format (0XXXXXXXXX)
  - `validateEmail()` - Basic email format
  - `validatePassword()` - Min 6 chars, mixed case, numbers
  - `validateAmount()` - Positive numbers, max 999999

```javascript
if (!validateAmount(amount)) {
    return res.status(400).json({ message: '❌ Invalid amount' });
}
```

### 5. **CORS Configuration 🌐**
- No longer allows all origins by default
- Configurable via `ALLOWED_ORIGINS` env variable
- Respects credentials and specific methods

```javascript
// Set in .env
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
```

### 6. **Global Error Handler 💥**
- Added error catching middleware at end
- Prevents stack traces leaking in production
- Returns friendly error messages

```javascript
app.use((err, req, res, next) => {
    console.error('❌ Global Error:', err.message);
    res.status(err.status || 500).json({
        message: process.env.NODE_ENV === 'production'
            ? '❌ System error'
            : `❌ ${err.message}`
    });
});
```

### 7. **Database Schema Updates ✏️**
New columns added automatically:
```sql
ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';
ALTER TABLE users ADD COLUMN token_expires DATETIME;
ALTER TABLE users ADD COLUMN refresh_token TEXT;
```

### 8. **Health Check Endpoint 🏥**
```javascript
GET /health
Response: { "status": "ok", "timestamp": "..." }
```

---

## Security Checklist

| Feature | Before | After |
|---------|--------|-------|
| Token Expiration | ❌ Never | ✅ 24 hours |
| Rate Limiting | ❌ None | ✅ Enabled |
| Admin Permissions | ❌ None | ✅ Required |
| Input Validation | ⚠️ Partial | ✅ Comprehensive |
| CORS | ❌ All origins | ✅ Configurable |
| Error Handler | ❌ Stack traces | ✅ Safe messages |
| Role-based Access | ❌ None | ✅ user/admin |
| Refresh Tokens | ❌ None | ✅ Implemented |

---

## How to Use

### 1. **Install new dependency**
```bash
npm install express-rate-limit
```

### 2. **Update environment variables**
Copy `.env.example` to `.env` and update your values

### 3. **Test the security features**

#### Test Token Expiration
```bash
# Login
curl -X POST http://localhost:3000/auth/login/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"identifier":"...","otp":"...","machine_id":1}'

# Response includes token + refreshToken
# After 24 hours, token will expire

# Refresh token
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"your-refresh-token"}'
```

#### Test Rate Limiting
```bash
# Try login 6 times in 15 minutes - 6th will be rejected
for i in {1..6}; do
  curl -X POST http://localhost:3000/auth/login/request-otp \
    -H "Content-Type: application/json" \
    -d '{"identifier":"test@test.com"}'
  echo "Request $i"
  sleep 1
done
```

#### Test Admin Protection
```bash
# Without admin role - should fail
curl -X GET http://localhost:3000/admin/users \
  -H "Authorization: Bearer user-token"

# Response: "❌ ไม่มีสิทธิเข้าถึง"
```

---

## Next Steps (Phase 2+)

✅ **Phase 1 Complete:** Security & Stability
- Token expiration ✓
- Rate limiting ✓
- Admin permissions ✓
- Input validation ✓
- CORS ✓
- Error handling ✓

🔜 **Phase 2:** Containerize with Docker
- Create Dockerfile
- Create docker-compose.yml
- Setup PostgreSQL (replace SQLite for scalability)

🔜 **Phase 3:** Testing & Documentation
- Unit tests with Jest
- API documentation (Swagger)

🔜 **Phase 4:** Customer App
- Public dashboard
- Mobile responsive

---

## Important Notes

⚠️ **For Production:**
1. Set `NODE_ENV=production`
2. Update `ALLOWED_ORIGINS` to your domain
3. Use strong Gmail App Password
4. Implement HTTPS/SSL
5. Add database backups
6. Monitor logs regularly

⚠️ **To Create Admin User:**
Currently, new users default to `role='user'`. To create an admin user:
```bash
# Via database directly (for now)
UPDATE users SET role='admin' WHERE id=1;
```

In the future, add a setup endpoint or migration script.
