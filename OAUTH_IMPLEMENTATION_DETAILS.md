# Google OAuth Implementation Summary

## Overview
Smart Car Wash System now supports **Google OAuth 2.0** for secure, passwordless login with auto-registration.

## What Changed

### 1. Dependencies Fixed ✅
**File:** `package.json`
```diff
- "jsonwebtoken": "^9.1.2",  (doesn't exist)
+ "jsonwebtoken": "^9.0.0",  (latest compatible)
```
**Why:** v9.1.2 was not published. v9.0.0 works perfectly.

### 2. OAuth Client Initialization ✅
**File:** `server.js` (lines 20-24)
```javascript
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');

// Initialize Google OAuth Client
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
```
**Why:** Creates OAuth2Client instance for token verification.

### 3. New OAuth Endpoint ✅
**File:** `server.js` (lines 234-304)
```javascript
app.post('/auth/google', async (req, res) => {
    const { idToken, machine_id } = req.body;
    
    // 1. Verify Google ID Token
    const ticket = await googleClient.verifyIdToken({
        idToken: idToken,
        audience: process.env.GOOGLE_CLIENT_ID
    });
    
    // 2. Extract user data
    const payload = ticket.getPayload();
    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name;
    const picture = payload.picture;
    
    // 3. Check if user exists
    // - If YES: Login (generate token)
    // - If NO: Auto-register + Login
    
    // 4. Create session for Bay (optional)
});
```
**Why:** Handles Google login and auto-registration in one endpoint.

### 4. Database Schema ✅
**File:** `init_db.js` (already has these columns)
```sql
CREATE TABLE users (
    ...
    google_id VARCHAR(255) UNIQUE,
    google_picture TEXT,
    ...
)
```
**Why:** Store Google account ID and profile picture.

### 5. Login UI ✅
**File:** `public/google-login.html` (NEW FILE)
- Modern dark theme UI
- Google Sign-In button (native)
- Optional Bay selector
- Auto-login if already authenticated
- Error/success messages
- Mobile-responsive design

## How It Works

### Flow Diagram
```
User visits /google-login.html
         ↓
Clicks "Sign in with Google"
         ↓
Google OAuth popup
(User selects account)
         ↓
Google returns ID Token
         ↓
JS sends idToken to POST /auth/google
         ↓
Server verifies token with Google
         ↓
Server checks if google_id exists in database
         ├→ YES: Login (generate token)
         └→ NO: Auto-register + Login
         ↓
Return token + user data
         ↓
Save to localStorage
         ↓
Redirect to /dashboard
```

## Example Request/Response

### Request
```bash
POST /auth/google HTTP/1.1
Content-Type: application/json

{
  "idToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6IjExIn0...",
  "machine_id": 1
}
```

### Response (New User)
```json
{
  "message": "✅ สมัครสมาชิกและเข้าสู่ระบบสำเร็จ! ยินดีต้อนรับ John Doe",
  "token": "a1b2c3d4e5f6g7h8i9j0",
  "refreshToken": "z9y8x7w6v5u4t3s2r1q0",
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john.doe@gmail.com",
    "picture": "https://lh3.googleusercontent.com/a-...",
    "balance": 0
  }
}
```

### Response (Existing User)
```json
{
  "message": "✅ เข้าสู่ระบบสำเร็จ! สวัสดี John Doe",
  "token": "new_token_here",
  "refreshToken": "new_refresh_token",
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john.doe@gmail.com",
    "picture": "https://lh3.googleusercontent.com/a-...",
    "balance": 100
  }
}
```

## Key Features

### ✅ Automatic User Registration
- First Google login automatically creates account
- No manual signup form needed
- Default balance: 0
- Status: active

### ✅ Token Management
- Access Token: 24-hour expiration
- Refresh Token: Can generate new tokens
- token_expires stored in database
- Automatic cleanup on logout

### ✅ Security
- Google ID Token verified server-side
- google_id UNIQUE constraint (prevents duplicates)
- CORS protection
- Rate limiting on auth endpoints
- No passwords stored for Google users

### ✅ Bay Reservation
- Optional machine_id parameter
- Creates session automatically
- User can start washing immediately after login

### ✅ Integration with Existing System
- Compatible with SMS/Email OTP still available
- Users can have phone, email, OR google_id
- Wallet system works same way
- Transactions tracked normally
- Admin endpoints unchanged

## Database Changes

### New User from Google Login
```sql
INSERT INTO users (
  google_id,
  email,
  name,
  google_picture,
  balance,
  status,
  token,
  refresh_token,
  token_expires,
  role,
  created_at
) VALUES (
  '108234657891234567890',  -- Google sub
  'john.doe@gmail.com',
  'John Doe',
  'https://lh3.googleusercontent.com/...',
  0,
  'active',
  'abc123...',
  'xyz789...',
  '2024-01-15 10:30:00',  -- NOW + 24 hours
  'user',
  CURRENT_TIMESTAMP
)
```

### Login Updates
```sql
UPDATE users SET
  token = 'new_token_abc123',
  refresh_token = 'new_refresh_xyz789',
  token_expires = '2024-01-15 10:30:00'
WHERE google_id = '108234657891234567890'
```

## Environment Variables Required

```env
# Google OAuth
GOOGLE_CLIENT_ID=<google-client-id>
GOOGLE_CLIENT_SECRET=<google-client-secret>
GOOGLE_REDIRECT_URI=https://carwash-api-aygz.onrender.com/auth/google/callback
```

## Testing Checklist

### Local Testing
```bash
# 1. Start server
npm start

# 2. Open browser
http://localhost:3000/google-login.html

# 3. Click Google Sign-In

# 4. Select Google account

# 5. Verify redirect to /

# 6. Check localStorage
localStorage.getItem('token')      // Should have value
localStorage.getItem('user')       // Should have JSON

# 7. Verify database
sqlite3 data/carwash.db
SELECT * FROM users WHERE google_id IS NOT NULL;
```

### Production Testing
```bash
# 1. Visit production URL
https://carwash-api-aygz.onrender.com/google-login.html

# 2. Login with Google

# 3. Verify in database (if accessible)
SELECT * FROM users ORDER BY created_at DESC LIMIT 1;
```

## Backward Compatibility

✅ **Fully Compatible**
- Existing SMS/Email OTP still works
- Existing users keep passwords
- New users can use Google OR traditional method
- Wallet transfers between methods work
- Admin endpoints unchanged
- Machine API unchanged

## Differences from Traditional Login

| Feature | Traditional | Google OAuth |
|---------|------------|-------------|
| Method | Phone/Email + Password | Google Account |
| Registration | Manual | Auto on first login |
| Password | Required | Not needed |
| Token Expiry | 24 hours | 24 hours |
| Refresh | Via refresh token | Via refresh token |
| Profile Picture | None | Google avatar |
| Multi-account | Per phone | Per Google account |

## Next Features (Optional)

1. **Link Multiple Providers**
   - Same user with Facebook + Google
   - Account merging

2. **Automatic Topup Suggestions**
   - Based on previous usage
   - "You usually spend ฿200"

3. **Social Sharing**
   - "I just washed my car with..."
   - Referral rewards

4. **OAuth Consent Scopes**
   - Request additional permissions
   - Calendar integration?
   - Drive file storage?

---

## File Structure
```
D:\Project/
├── server.js                    (modified: +OAuth2Client init, +/auth/google route)
├── package.json                 (modified: jsonwebtoken version fix)
├── init_db.js                   (unchanged: already has google columns)
├── public/
│   └── google-login.html        (NEW: Google Sign-In UI)
├── .env.example                 (unchanged: already documented)
├── GOOGLE_OAUTH_SETUP.md        (NEW: This guide)
└── DEPLOYMENT_CHECKLIST.md      (NEW: Production checklist)
```

---

## Troubleshooting

### OAuth2Client not initialized
**Error:** `TypeError: Cannot read property 'verifyIdToken' of undefined`
**Fix:** Restart server and verify `GOOGLE_CLIENT_ID` in `.env`

### Invalid token
**Error:** `Invalid Google token`
**Fix:** Token may be expired, generate new one

### CORS error
**Error:** `Access-Control-Allow-Origin` header missing
**Fix:** Add frontend URL to `ALLOWED_ORIGINS` env var

---

## Support
- Local test: http://localhost:3000/google-login.html
- Production: https://carwash-api-aygz.onrender.com/google-login.html
- Documentation: See `GOOGLE_OAUTH_SETUP.md`
- Deployment: See `DEPLOYMENT_CHECKLIST.md`

