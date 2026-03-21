# ขั้นตอนกำหนดค่า Render Environment Variables

## 🔐 ข้อมูลประจำตัว Google OAuth

```
Client ID: <your-google-client-id-from-.env.example>
Client Secret: <your-google-client-secret-from-.env.example>
Redirect URI: https://carwash-api-aygz.onrender.com/auth/google/callback
```

## 📋 ขั้นตอนตั้งค่า Render

### Step 1: เข้า Render Dashboard
1. ไปที่ https://dashboard.render.com
2. เลือก Service: **carwash-api-aygz**

### Step 2: ไปยัง Environment Variables
1. คลิก **Environment**
2. ค้นหา "GOOGLE" (ถ้ามีอยู่แล้วให้ลบออก)

### Step 3: เพิ่มตัวแปรใหม่ 3 ตัว

#### 3.1 GOOGLE_CLIENT_ID
```
Key: GOOGLE_CLIENT_ID
Value: <your-google-client-id-from-.env.example>
```
👉 กด **Add** หรือ **Save**

#### 3.2 GOOGLE_CLIENT_SECRET
```
Key: GOOGLE_CLIENT_SECRET
Value: <your-google-client-secret-from-.env.example>
```
👉 กด **Add** หรือ **Save**

#### 3.3 GOOGLE_REDIRECT_URI
```
Key: GOOGLE_REDIRECT_URI
Value: https://carwash-api-aygz.onrender.com/auth/google/callback
```
👉 กด **Add** หรือ **Save**

### Step 4: บันทึกการเปลี่ยนแปลง
- Render จะแสดง "Restart Recommended"
- คลิก **Restart Service** หรือรอให้มันอัพเดทเอง

### Step 5: รอให้ Service Restart
- ตรวจสอบ **Events** ว่ามี ✅ "Build succeeded"
- ตรวจสอบ **Status** ว่าเป็น 🟢 "Live"

---

## ✅ ทดสอบ

### ทดสอบทันที
```bash
curl https://carwash-api-aygz.onrender.com/health
```

### ทดสอบ Google Login
1. ไปที่: https://carwash-api-aygz.onrender.com/google-login.html
2. ดูว่ามี Google Sign-In button หรือไม่
3. คลิก "Sign in with Google"
4. ลองล็อกอินด้วย Google Account

### ตรวจสอบใน Browser Console
1. กด F12
2. ไปที่ **Console**
3. ลอง copy-paste:
```javascript
localStorage.getItem('token')
localStorage.getItem('user')
```

ควรได้ค่ากลับมา ถ้าเป็น `null` แสดงว่ายังมีปัญหา

---

## 🐛 ถ้ายังเกิด Error 401: invalid_client

### ตรวจสอบหลายสิ่งหลายอย่าง:

1. **ตรวจสอบ Render Environment Variables**
   - ไปที่ https://dashboard.render.com → carwash-api-aygz → Environment
   - ตรวจสอบว่า GOOGLE_CLIENT_ID ตรงกับ: `<your-google-client-id-from-.env.example>` (ไม่ใช่ <...> หรือ [REDACTED])

2. **ตรวจสอบ public/google-login.html ใน code**
   - ตรวจสอบบรรทัดที่มี `client_id:` ตรงกับข้อมูลเหนือ

3. **ตรวจสอบ Google Cloud Console**
   - ไปที่ https://console.cloud.google.com/
   - Project: carwash-ccit
   - Credentials → OAuth 2.0 Client IDs
   - ตรวจสอบ Authorized redirect URIs มีครบ:
     - `http://localhost:3000`
     - `https://carwash-api-aygz.onrender.com`
     - `https://carwash-api-aygz.onrender.com/google-login.html`

4. **Clear Browser Cache**
   - กด Ctrl+Shift+Delete
   - ลบ Cache
   - Reload page

---

## 📝 ถ้าอยากเปลี่ยน Client ID/Secret ใน Code

ไฟล์ที่มี hardcode:
- `public/google-login.html` - บรรทัด ~202 และ ~269

ถ้าต้องการให้ฉันอัพเดท กรุณาบอก ฉันจะทำให้อัตโนมัติ

---

**Status:** ⏳ รอการตั้งค่า Render
**Next:** บอกให้ฉันว่าได้ตั้งค่า Environment Variables เสร็จแล้ว

