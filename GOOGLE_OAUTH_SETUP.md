# Google OAuth 2.0 Setup Guide

## ✅ Current Status

**OAuth Implementation: COMPLETE** ✅

### What's Done
- ✅ Google OAuth routes added (`/auth/google` POST endpoint)
- ✅ Database schema updated (google_id, google_picture columns)
- ✅ Google Sign-In HTML page created (`/google-login.html`)
- ✅ OAuth2Client initialized in server.js
- ✅ npm dependencies fixed (jsonwebtoken@9.0.0)
- ✅ Auto-registration on first Google login
- ✅ Token generation (24-hour expiration)
- ✅ Bay selection optional feature

---

## 🚀 Testing Locally

### 1. Start the Server
```bash
npm start
# OR for development with hot reload:
npm run dev
```

You should see:
```
✅ เชื่อมต่อ Google Firebase Realtime Database สำเร็จ
✅ เชื่อมต่อฐานข้อมูล data/carwash.db สำเร็จ
🚀 Server ร้านล้างรถเริ่มทำงานแล้วที่ http://localhost:3000
```

### 2. Open Google Login Page
```
http://localhost:3000/google-login.html
```

### 3. Test Login Flow
1. Click the Google Sign-In button
2. Select a Google account
3. (Optional) Select a Bay (1-6)
4. You should be redirected to `/` with:
   - Token stored in localStorage
   - User profile displayed
   - Balance = 0 (first time)

### 4. Verify in Database
```bash
# Check users table
sqlite3 data/carwash.db
SELECT id, name, email, google_id, balance FROM users;
```

You should see your Google account created with balance=0.

---

## 📦 Environment Variables (.env)

Required for Google OAuth (see `.env.example` for values):
```env
GOOGLE_CLIENT_ID=<see .env.example>
GOOGLE_CLIENT_SECRET=<see .env.example>
GOOGLE_REDIRECT_URI=https://carwash-api-aygz.onrender.com/auth/google/callback
```

---

## 🔗 API Endpoint

### POST /auth/google
**Login/Register with Google OAuth**

**Request:**
```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6IjEyMyJ9...",
  "machine_id": 1
}
```

**Response (Success):**
```json
{
  "message": "✅ เข้าสู่ระบบสำเร็จ! สวัสดี John Doe",
  "token": "a1b2c3d4e5f6...",
  "refreshToken": "f6e5d4c3b2a1...",
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "picture": "https://lh3.googleusercontent.com/...",
    "balance": 0
  }
}
```

---

## 🛠️ Deployment to Render

### 1. Push Code to GitHub
```bash
git add .
git commit -m "Add Google OAuth 2.0 integration"
git push origin main
```

### 2. Environment Variables on Render
Go to **Render Dashboard** → Your Service → **Environment**

Add these variables (values in `.env.example`):
```
GOOGLE_CLIENT_ID=<from .env.example>
GOOGLE_CLIENT_SECRET=<from .env.example>
GOOGLE_REDIRECT_URI=https://carwash-api-aygz.onrender.com/auth/google/callback
NODE_ENV=production
```

### 3. Verify Deployment
```bash
# Check if service is running
curl https://carwash-api-aygz.onrender.com/health

# Should return:
# {"status":"ok","timestamp":"2024-..."} 
```

### 4. Test on Production
```
https://carwash-api-aygz.onrender.com/google-login.html
```

---

## 📋 Files Modified

| File | Changes |
|------|---------|
| `package.json` | Updated `jsonwebtoken` from `^9.1.2` → `^9.0.0` |
| `server.js` | Added Google OAuth routes + OAuth2Client initialization |
| `init_db.js` | Schema already has `google_id` and `google_picture` columns |
| `.env.example` | Google OAuth env vars documented |
| `public/google-login.html` | New Google Sign-In UI with Bay selector |

---

## 🔐 Security Notes

✅ **Token Verification**
- Server verifies Google ID Token cryptographically
- Invalid tokens rejected immediately

✅ **Token Expiration**
- Access tokens: 24 hours
- Refresh tokens: Can be used to get new access tokens

✅ **Database**
- google_id is UNIQUE (prevents duplicate accounts)
- Phone/email optional (Google only registration)

✅ **CORS**
- Configured to allow frontend requests
- Modify `ALLOWED_ORIGINS` if needed

---

## 🐛 Troubleshooting

### Issue: "Cannot find module 'google-auth-library'"
**Solution:**
```bash
npm install google-auth-library jsonwebtoken@9.0.0
npm install
```

### Issue: "Invalid Google token"
**Possible causes:**
- Token expired (older than 1 hour)
- Wrong CLIENT_ID in code
- Token tampered with

**Solution:** Check browser console for errors, regenerate token by signing in again.

### Issue: "ไม่พบ Bay machines"
**Solution:**
```bash
rm data/carwash.db
node init_db.js
```

---

## 🎯 Next Steps (Optional Enhancements)

1. **Add Google OAuth Redirect URI Flow** (server-side)
   - More secure for mobile apps
   - Requires handling authorization code

2. **Link Email/Phone to Google Account**
   - Allow users to add phone number after OAuth
   - For SMS notifications

3. **Social Features**
   - Login with Facebook, Line, etc.
   - OAuth provider discovery

---

**Last Updated:** 2024
**Status:** ✅ Production Ready
