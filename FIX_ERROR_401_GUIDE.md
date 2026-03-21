# แก้ไข Error 401: invalid_client

## 🔴 ปัญหา
"Error 401: invalid_client" เมื่อลองล็อกอิน Google

## ✅ วิธีแก้ไข

### Step 1: ตรวจสอบ Google Cloud Console

1. ไปที่ https://console.cloud.google.com/
2. เลือก Project: **carwash-ccit**
3. ไปที่ **Credentials** (ที่แสบด้านซ้าย)
4. หา **OAuth 2.0 Client IDs**
5. คลิกที่ชื่อ: `carwash-web-client` (หรืออะไรก็ตามที่เป็น Web client)
6. ตรวจสอบค่าเหล่านี้:

   **ค่าที่ต้องตรวจสอบ:**
   ```
   Client ID: <your-google-client-id>
   Client Secret: <your-google-client-secret>
   ```

### Step 2: ตรวจสอบ Authorized redirect URIs

ใน Google Cloud Console → OAuth 2.0 Client IDs → ตรวจสอบ "Authorized redirect URIs" มีค่านี้:

```
http://localhost:3000
https://carwash-api-aygz.onrender.com
```

ถ้าไม่มี ให้เพิ่มเข้าไป:

1. คลิก **Edit**
2. ไปที่ **Authorized redirect URIs**
3. เพิ่ม:
   - `http://localhost:3000`
   - `https://carwash-api-aygz.onrender.com`
4. คลิก **Save**

### Step 3: ตรวจสอบ Authorized JavaScript origins

1. ในหน้า OAuth Client ที่เดียวกัน ให้เลื่อนลงไป "Authorized JavaScript origins"
2. ต้องมี:
   - `http://localhost:3000`
   - `https://carwash-api-aygz.onrender.com`

ถ้าไม่มี ให้เพิ่ม

### Step 4: ตรวจสอบ Render Environment Variables

ไปที่ Render Dashboard:

1. https://dashboard.render.com → **carwash-api-aygz**
2. คลิก **Environment**
3. ตรวจสอบมีตัวแปรเหล่านี้และค่าถูกต้อง:

```env
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
GOOGLE_REDIRECT_URI=https://carwash-api-aygz.onrender.com/auth/google/callback
```

ถ้าไม่ตรง ให้ **Update** ให้ตรงกับค่าเดิม

### Step 5: Restart Render Service

1. Render Dashboard → **carwash-api-aygz**
2. คลิก **Restart Service** หรือรอให้มันอัพเดตเอง
3. ตรวจสอบ Status เป็น 🟢 **Live**

### Step 6: Clear Browser Cache

1. เปิด Incognito/Private window ใหม่
2. ไปที่ https://carwash-api-aygz.onrender.com/google-login.html
3. ลองล็อกอินใหม่

---

## 🔍 ทำการ Debug

### ตรวจสอบ Server Logs

```bash
# ถ้า run ท้องถิ่น
npm start

# ดูใน Console มีข้อความ:
✅ เชื่อมต่อ Google Firebase Realtime Database สำเร็จ
🚀 Server ร้านล้างรถเริ่มทำงานแล้ว
```

### ตรวจสอบ Browser Console (F12)

1. กด **F12** ตรงปุ่ม Sign in
2. ไปที่ **Console** tab
3. ดูมีข้อความหรือ Error ไหม?
4. ทำการ Copy error message มาบอก

### ตรวจสอบ Network Request

1. ตรงหน้า google-login.html กด **F12**
2. ไปที่ **Network** tab
3. คลิกปุ่ม Sign in
4. ดูมี Request ไปที่ `/auth/google` ไหม?
5. Click ดูผลลัพธ์ (Response)

ถ้า Response คือ:
```json
{"message":"❌ Invalid Google token"}
```
→ Token ที่ Google ส่งมาไม่ถูกต้อง (ตรวจสอบ Client ID)

---

## 📋 Checklist

ทำให้เสร็จหมด:

- [ ] ตรวจสอบ Client ID ตรง: `<your-google-client-id>`
- [ ] ตรวจสอบ Client Secret ตรง: `<your-google-client-secret>`
- [ ] Google Cloud Console มี Authorized redirect URIs ที่ถูก
- [ ] Google Cloud Console มี Authorized JavaScript origins ที่ถูก
- [ ] Render Environment Variables ตั้งค่าเสร็จ
- [ ] Render Service Restart แล้ว
- [ ] Clear browser cache
- [ ] ทดสอบใน Incognito window
- [ ] ดู Browser Console ว่ามี Error ไหม

---

## 🎯 ถ้ายังไม่ได้

บอกให้ฉันได้:
1. ตัว Error message จาก Browser Console
2. Response จาก `/auth/google` API
3. Google Cloud Console ตั้งค่าเสร็จแล้วไหม?

ฉันจะช่วยแก้ไข!

---

**Status:** ⏳ รอการกำหนดค่า Google Cloud

