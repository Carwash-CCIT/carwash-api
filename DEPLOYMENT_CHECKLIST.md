# Deployment Checklist: Google OAuth 2.0 for Car Wash System

## ✅ Pre-Deployment Verification (Local)

### Code Quality
- [x] Fixed `jsonwebtoken` version (9.0.0)
- [x] Added `OAuth2Client` initialization
- [x] Google OAuth routes implemented (`/auth/google`)
- [x] Database schema includes `google_id` and `google_picture`
- [x] HTML login page created with Bay selector
- [x] No syntax errors (verified with `node -c server.js`)

### Dependencies
- [x] `npm install` succeeds
- [x] `google-auth-library` v9.4.1 installed
- [x] `jsonwebtoken` v9.0.0 installed
- [x] All 421 packages resolved

### Local Testing
- [x] Server starts without errors
- [x] Firebase connection successful
- [x] Database connection successful
- [x] `/auth/google` endpoint responds correctly
- [x] Rate limiting enabled
- [x] CORS configured

### Database
- [x] `init_db.js` runs without errors
- [x] 6 Bay machines created
- [x] Users table has google_id column
- [x] Users table has google_picture column

---

## 🚀 Deployment Steps (Render)

### Step 1: Push Code to GitHub
```bash
git add .
git commit -m "feat: Add Google OAuth 2.0 integration with auto-registration"
git push origin main
```

Render will auto-deploy when code is pushed.

### Step 2: Verify Environment Variables
Go to **Render Dashboard** → **carwash-api-aygz** → **Environment**

Add/Update these variables (see `.env.example` for values):
| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console |
| `GOOGLE_REDIRECT_URI` | `https://carwash-api-aygz.onrender.com/auth/google/callback` |
| `NODE_ENV` | `production` |

**Important:** Use values from `.env.example` file in repository.

### Step 3: Wait for Deployment
Monitor **Render Dashboard** → **Events**

You should see:
```
✅ Build succeeded
✅ Service live at https://carwash-api-aygz.onrender.com
```

Expected logs:
```
ℹ️ Bay machines already exist (6 machines found)
✅ เชื่อมต่อ Google Firebase Realtime Database สำเร็จ
✅ เชื่อมต่อฐานข้อมูล data/carwash.db สำเร็จ
🚀 Server ร้านล้างรถเริ่มทำงานแล้ว
```

### Step 4: Verify Production
```bash
# Check health
curl https://carwash-api-aygz.onrender.com/health

# Expected response:
# {"status":"ok","timestamp":"2024-..."}
```

### Step 5: Test Google Login on Production
1. Visit: `https://carwash-api-aygz.onrender.com/google-login.html`
2. Click "Sign in with Google"
3. Select your Google account
4. You should be redirected to dashboard
5. Check that `token` and `user` are in localStorage

### Step 6: Verify Database Entry
On Render PostgreSQL/SQLite (if accessible), verify:
```sql
SELECT id, name, email, google_id, balance FROM users;
```

New user should appear with your Google email.

---

## 🎯 Post-Deployment Testing

### 1. Public Endpoints
```bash
# Check all Bay machines
curl https://carwash-api-aygz.onrender.com/machines

# Check admin users list
curl https://carwash-api-aygz.onrender.com/admin/users

# Check finance report
curl https://carwash-api-aygz.onrender.com/admin/finance
```

### 2. OAuth Login Flow
1. Visit `/google-login.html`
2. Login with valid Google account
3. Verify:
   - [ ] Token received
   - [ ] User data in localStorage
   - [ ] Redirected to dashboard
   - [ ] Wallet balance displayed (0 for new users)
   - [ ] User created in database

### 3. Bay Selection (Optional Feature)
1. Select a Bay (1-6) before clicking Sign In
2. Verify session created for that Bay
3. Check machines status endpoint: `/machines`

### 4. Token Expiration
1. Login and get token
2. Wait 24+ hours OR manually set token_expires to past date
3. Try using old token (should be rejected)
4. Use refresh token to get new token

---

## 🔍 Monitoring Post-Deployment

### Check Logs (Render Dashboard)
- Navigate to **Logs** section
- Filter for errors: `❌`
- Monitor for: `Google token verification error`, `Database error`, etc.

### Key Metrics to Monitor
- [ ] HTTP 401 errors (authentication failures)
- [ ] HTTP 500 errors (server errors)
- [ ] `[SCB]` webhook errors (payment system)
- [ ] Database connection drops

### Important Endpoints to Test Weekly
```bash
# Verify OAuth still works
https://carwash-api-aygz.onrender.com/google-login.html

# Check service health
https://carwash-api-aygz.onrender.com/health

# View active machines
https://carwash-api-aygz.onrender.com/machines
```

---

## 🐛 Common Issues & Fixes

### Issue 1: "Invalid Google token"
**Cause:** Old/expired token or wrong CLIENT_ID
**Fix:**
1. Check `GOOGLE_CLIENT_ID` in Render environment matches `.env.example`
2. Regenerate token (logout and login again)
3. Verify token is sent in request body

### Issue 2: "Cannot connect to database"
**Cause:** Database file not created during initialization
**Fix:**
1. Check Render logs: Look for `init_db.js` errors
2. Manually trigger init: POST to `/api/db/init` (if endpoint exists)
3. Or delete `data/carwash.db` and restart service

### Issue 3: "Firebase connection failed"
**Cause:** `firebase-key.json` not deployed or credentials wrong
**Fix:**
1. This is optional (Firebase is for ESP8266 polling)
2. If needed, upload `firebase-key.json` to Render
3. Restart service

### Issue 4: CORS errors in browser
**Cause:** Frontend on different domain trying to call API
**Fix:**
1. Update `ALLOWED_ORIGINS` environment variable
2. Add frontend URL to list
3. Restart service

---

## 📊 Files Summary

### New Files
- `GOOGLE_OAUTH_SETUP.md` - Local testing guide
- `public/google-login.html` - Google Sign-In UI

### Modified Files
- `package.json` - jsonwebtoken version updated
- `server.js` - OAuth2Client added, /auth/google route implemented
- `.env.example` - Google OAuth credentials documented

### Unchanged
- `init_db.js` - Already has google_id, google_picture columns
- `docker-compose.yml` - Ready for production
- `Dockerfile` - No changes needed

---

## 🚀 Rollback Plan (If Needed)

If Google OAuth breaks production:

1. **Quick Disable OAuth Endpoint:**
   - Comment out `/auth/google` route in server.js
   - Push to GitHub
   - Render auto-deploys

2. **Full Rollback:**
   ```bash
   git revert <commit-hash>
   git push origin main
   ```

3. **Keep Existing Data:**
   - Database is separate from code
   - User data persists even after rollback
   - OAuth tokens remain valid until 24-hour expiration

---

## ✅ Sign-Off Checklist

Before marking as "deployment complete":

- [ ] Code pushed to GitHub
- [ ] Environment variables set on Render
- [ ] Deployment logs show ✅ success
- [ ] `/health` endpoint returns 200
- [ ] `/google-login.html` loads without errors
- [ ] Google Sign-In button appears
- [ ] Can login with Google account
- [ ] User created in database
- [ ] Token stored in localStorage
- [ ] Dashboard loads after login
- [ ] Wallet balance visible (shows 0)
- [ ] Bay machine list accessible

---

## 📞 Support Links

- **Render Dashboard:** https://dashboard.render.com
- **Google Cloud Console:** https://console.cloud.google.com
- **Project URL:** https://carwash-api-aygz.onrender.com
- **Local Test:** http://localhost:3000/google-login.html

---

**Deployment Status:** 🟢 READY FOR PRODUCTION
**Last Verified:** 2024
**OAuth Version:** Google Identity Services (latest)
