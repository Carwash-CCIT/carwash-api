# 🔐 วิธีตั้งค่า Render Environment Variables

## 📺 วิดีโอ Step-by-Step (ทำตามขั้นตอนนี้):

### ขั้นที่ 1: เข้า Render Dashboard
1. ไปที่ **https://dashboard.render.com/services**
2. ค้นหา Service: **carwash-api-aygz**
3. คลิกเข้าไป

### ขั้นที่ 2: เลือก Environment
1. ดูที่ด้านข้างมี Tab หลายๆ อัน
2. **คลิก "Environment"** tab

### ขั้นที่ 3: Add Variable ที่ 1 - GOOGLE_CLIENT_ID
```
Key:   GOOGLE_CLIENT_ID
Value: <CLIENT_ID_FROM_.env.example>
```

**ขั้นตอน:**
- คลิก **"Add Environment Variable"**
- ใส่ **Key**: `GOOGLE_CLIENT_ID`
- ใส่ **Value**: `<CLIENT_ID_FROM_.env.example>`
- คลิก **Save** หรือ **Add**

### ขั้นที่ 4: Add Variable ที่ 2 - GOOGLE_CLIENT_SECRET
```
Key:   GOOGLE_CLIENT_SECRET
Value: <CLIENT_SECRET_FROM_.env.example>
```

**ขั้นตอน:**
- คลิก **"Add Environment Variable"**
- ใส่ **Key**: `GOOGLE_CLIENT_SECRET`
- ใส่ **Value**: `<CLIENT_SECRET_FROM_.env.example>`
- คลิก **Save** หรือ **Add**

### ขั้นที่ 5: Add Variable ที่ 3 - GOOGLE_REDIRECT_URI
```
Key:   GOOGLE_REDIRECT_URI
Value: https://carwash-api-aygz.onrender.com/auth/google/callback
```

**ขั้นตอน:**
- คลิก **"Add Environment Variable"**
- ใส่ **Key**: `GOOGLE_REDIRECT_URI`
- ใส่ **Value**: `https://carwash-api-aygz.onrender.com/auth/google/callback`
- คลิก **Save** หรือ **Add**

### ขั้นที่ 6: Restart Service
ตัวเลือกที่ 1 (Auto):
- Render จะแสดง **"Restart recommended"**
- คลิก **"Restart"**

ตัวเลือกที่ 2 (Manual):
- คลิกที่ชื่อ Service ด้านบน
- ไปที่ **"Settings"** → **"Restart Service"**
- ตกลง

### ขั้นที่ 7: รอ Service Restart
- ตรวจสอบ **Status** ว่าเป็น 🟢 **Live** 
- รอประมาณ 2-3 นาที

### ขั้นที่ 8: ทดสอบ
1. เปิด Browser ใหม่ (Incognito/Private)
2. ไปที่: **https://carwash-api-aygz.onrender.com/google-login.html**
3. ลองคลิก **Sign in with Google**
4. ถ้า Error หายไป ✅ แสดงว่าสำเร็จ!

---

## 🎯 ถ้าเกิด Error ให้ตรวจสอบว่า:

- [ ] **Key** ตรงกันหมด (case-sensitive)
  - `GOOGLE_CLIENT_ID` (ไม่ใช่ `Google_Client_ID`)
  - `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_REDIRECT_URI`

- [ ] **Value** ไม่มีเว้นวรรค หรือ quote เพิ่มเติม
  - ❌ `" 1015275273603..."`
  - ✅ `1015275273603...`

- [ ] Service ได้ Restart เรียบร้อยแล้ว
  - ตรวจสอบ Status = 🟢 Live

- [ ] Browser cache ล้างไปแล้ว
  - Ctrl+Shift+Delete → Clear cache

---

## 📸 Screenshots (ใจเย็น!)

**หลังจากตั้งค่าแล้ว ต้องได้หน้าตาแบบนี้:**

```
Environment Variables:
├── GOOGLE_CLIENT_ID = 1015275273603...
├── GOOGLE_CLIENT_SECRET = GOCSPX-...
├── GOOGLE_REDIRECT_URI = https://carwash-api-aygz...
└── ... (อื่นๆ)
```

---

## ✅ Checklist

- [ ] ไปที่ https://dashboard.render.com/services
- [ ] เลือก carwash-api-aygz
- [ ] Click Environment tab
- [ ] Add GOOGLE_CLIENT_ID
- [ ] Add GOOGLE_CLIENT_SECRET
- [ ] Add GOOGLE_REDIRECT_URI
- [ ] Service Restart
- [ ] รอ 2-3 นาที
- [ ] Clear browser cache
- [ ] Test ที่ /google-login.html

---

## 🆘 ไม่ได้ยัง?

บอกให้ฉันได้:
1. Error message ตรงไหน?
2. Render Status เป็นไรตอนนี้?
3. Environment tab แสดงค่า variables อะไรบ้าง?

ฉันจะช่วย!

---

**Time estimate:** ⏱️ 5 นาที
**Difficulty:** ⭐ ง่ายมาก

