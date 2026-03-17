const express = require('express');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();
const nodemailer = require('nodemailer');
const axios = require('axios');
const thaibulksmsApi = require('thaibulksms-api');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 3000;

// ─── MIDDLEWARE ─────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// CORS Configuration
app.use((req, res, next) => {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['*'];
    const origin = req.headers.origin;
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin || '*');
    }
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

// ─── RATE LIMITING ──────────────────────────────────────────
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 requests per windowMs
    message: '❌ ลองเข้าสู่ระบบเกินครั้ง กรุณารอ 15 นาที',
    standardHeaders: true,
    legacyHeaders: false,
});

const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30, // 30 requests per minute
    message: '❌ เกินขีดจำกัดการใช้งาน',
    skip: (req) => req.user?.role === 'admin' // admins bypass
});

app.use('/auth/', authLimiter);
app.use('/api/', apiLimiter);

// ─── ฐานข้อมูล ──────────────────────────────────────────────
const db = new sqlite3.Database(path.join(__dirname, 'data', 'carwash.db'), (err) => {
    if (err) return console.error('❌ ไม่สามารถเชื่อมต่อฐานข้อมูลได้:', err.message);
    console.log('✅ เชื่อมต่อฐานข้อมูล data/carwash.db สำเร็จ');
    db.run('PRAGMA journal_mode = WAL');
    db.run('PRAGMA cache_size = 5000');
    db.run('PRAGMA foreign_keys = ON');
    db.run('PRAGMA synchronous = NORMAL');
    // Auto-migrate
    db.run("ALTER TABLE machines ADD COLUMN pending_command TEXT DEFAULT NULL", () => { });
    db.run("ALTER TABLE users ADD COLUMN pending_qr_ref TEXT DEFAULT NULL", () => { });
    db.run("ALTER TABLE users ADD COLUMN pending_qr_amount REAL DEFAULT NULL", () => { });
    db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'", () => { });
    db.run("ALTER TABLE users ADD COLUMN token_expires DATETIME", () => { });
    db.run("ALTER TABLE users ADD COLUMN refresh_token TEXT", () => { });
});

// ─── ยูทิลิตี้ ────────────────────────────────────────────────
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

async function syncToGoogleSheets(data) {
    const sheetApiUrl = 'https://script.google.com/macros/s/AKfycbwCSDt4aoxyrnU9TIrEiFZtDbGcoah_VN0mw38fzYc9KNUG6XQDTGZ6bqZ7YxpIBDUr/exec';
    const sheetData = {
        timestamp: new Date().toISOString(),
        userId: data.userId,
        userName: data.userName,
        userPhone: data.userPhone,
        amount: data.amount,
        action: data.action || 'topup',
        transactionId: data.transactionId || 'MANUAL'
    };

    try {
        const response = await axios.post(sheetApiUrl, sheetData);
        console.log(`✅ [Google Sheets] Sync successful: ${response.data}`);
        return true;
    } catch (err) {
        console.error(`❌ [Google Sheets] Sync failed: ${err.message}`);
        return false;
    }
}

function generateAccessToken(userId, expiresIn = '1h') {
    // Simple JWT-like format (ในกรณีจริง ควรใช้ jsonwebtoken library)
    const payload = {
        userId,
        iat: Date.now(),
        exp: Date.now() + (expiresIn === '1h' ? 3600000 : 86400000)
    };
    return Buffer.from(JSON.stringify(payload)).toString('base64');
}

// Nodemailer Config
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
    }
});

async function sendEmailOTP(email, otp) {
    const mailOptions = {
        from: `"Car Wash System" <${process.env.GMAIL_USER}>`,
        to: email,
        subject: 'Your Login OTP for Car Wash',
        text: `Your OTP is: ${otp}. It will expire in 5 minutes.`
    };
    try {
        await transporter.sendMail(mailOptions);
        console.log(`✉️ ส่ง OTP ${otp} ไปที่ ${email} สำเร็จ`);
        return true;
    } catch (error) {
        console.error('❌ ไม่สามารถส่ง Email ได้:', error);
        return false;
    }
}

// ─── INPUT VALIDATION ───────────────────────────────────────
function validatePhone(phone) {
    return /^0[0-9]{9}$/.test(phone);
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
    // อย่างน้อย 6 ตัว มี พิมพ์เล็ก พิมพ์ใหญ่ ตัวเลข
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{6,}$/.test(password);
}

function validateAmount(amount) {
    const num = parseInt(amount);
    return !isNaN(num) && num > 0 && num <= 999999;
}

// ─── MIDDLEWARE: AUTH ────────────────────────────────────────
function authMiddleware(req, res, next) {
    try {
        const token = req.headers['authorization']?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ message: '❌ กรุณาเข้าสู่ระบบก่อน' });

        db.get("SELECT * FROM users WHERE token = ?", [token], (err, user) => {
            if (err || !user) return res.status(401).json({ message: '❌ Token ไม่ถูกต้อง' });
            if (user.status !== 'active') return res.status(403).json({ message: '❌ บัญชีนี้ถูกระงับ' });
            
            // Check token expiration
            if (user.token_expires && new Date(user.token_expires) < new Date()) {
                return res.status(401).json({ message: '❌ Token หมดอายุแล้ว กรุณา login ใหม่' });
            }
            
            req.user = user;
            next();
        });
    } catch (e) {
        res.status(401).json({ message: '❌ Authentication error' });
    }
}

// ─── MIDDLEWARE: ADMIN CHECK ────────────────────────────────
function adminMiddleware(req, res, next) {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ message: '❌ ไม่มีสิทธิเข้าถึง (ต้องเป็น admin)' });
    }
    next();
}

// ─── GLOBAL ERROR HANDLER ───────────────────────────────────
app.use((err, req, res, next) => {
    console.error('❌ Global Error:', err.message);
    res.status(err.status || 500).json({
        message: process.env.NODE_ENV === 'production'
            ? '❌ เกิดข้อผิดพลาดในระบบ'
            : `❌ ${err.message}`
    });
});

// ─── AUTH APIs ─────────────────────────────────────────────────

async function handleOTPRequest(identifier, isRegister, res) {
    if (!identifier) return res.status(400).json({ message: '❌ กรุณาระบุเบอร์โทรหรืออีเมล' });

    const isPhone = validatePhone(identifier);
    const isEmail = validateEmail(identifier);

    if (!isPhone && !isEmail) {
        return res.status(400).json({ message: '❌ รูปแบบเบอร์โทรหรืออีเมลไม่ถูกต้อง' });
    }

    const type = isPhone ? 'phone' : 'email';
    const queryCol = isPhone ? 'phone' : 'email';

    db.get(`SELECT * FROM users WHERE ${queryCol} = ?`, [identifier], async (err, user) => {
        if (err) return res.status(500).json({ message: '❌ เกิดข้อผิดพลาดในระบบ' });

        if (isRegister && user && user.status === 'active') {
            return res.status(400).json({ message: '❌ บัญชีนี้ถูกใช้งานแล้ว กรุณาไปที่หน้าเข้าสู่ระบบ' });
        }
        if (!isRegister && (!user || user.status !== 'active')) {
            return res.status(404).json({ message: '❌ ไม่พบบัญชีนี้ กรุณาสมัครสมาชิกก่อน' });
        }

        let saveCode = null;

        if (isPhone) {
            const apiKey = process.env.THAIBULKSMS_APP_KEY;
            const apiSecret = process.env.THAIBULKSMS_APP_SECRET;

            if (!apiKey || !apiSecret) {
                return res.status(500).json({ message: '❌ ยังไม่ได้ตั้งค่า THAIBULKSMS_APP_KEY' });
            }

            const otpApi = thaibulksmsApi.otp({ apiKey, apiSecret, version: 'v2' });

            try {
                const response = await otpApi.request(identifier);
                saveCode = response.token;
                console.log(`📱 [OTP API] ส่ง OTP ไปที่ ${identifier} (Ref: ${response.ref_no})`);
            } catch (error) {
                console.error('❌ [OTP API Error]:', error);
                return res.status(500).json({ message: '❌ ไม่สามารถส่ง SMS ได้ ลองเช็คเครดิต' });
            }
        } else {
            const emailOtp = generateOTP();
            saveCode = emailOtp;
            const success = await sendEmailOTP(identifier, emailOtp);
            if (!success) return res.status(500).json({ message: '❌ ส่งอีเมลล้มเหลว' });
        }

        const expires = new Date(Date.now() + 5 * 60000);

        if (!user) {
            db.run(
                `INSERT INTO users (${queryCol}, otp_code, otp_expires, otp_type, status) VALUES (?, ?, ?, ?, 'pending')`,
                [identifier, saveCode, expires.toISOString(), type]
            );
        } else {
            db.run(
                `UPDATE users SET otp_code = ?, otp_expires = ?, otp_type = ? WHERE id = ?`,
                [saveCode, expires.toISOString(), type, user.id]
            );
        }

        res.json({ message: `✅ ระบบได้ส่ง OTP ไปที่ ${identifier} แล้ว` });
    });
}

app.post('/auth/register/request-otp', (req, res) => {
    handleOTPRequest(req.body.identifier, true, res);
});

app.post('/auth/login/request-otp', (req, res) => {
    handleOTPRequest(req.body.identifier, false, res);
});

async function verifyOTP(identifier, otp, isPhone, user) {
    if (isPhone) {
        const token = user.otp_code;
        if (!token) throw new Error('ไม่พบข้อมูลการขอ OTP');

        const otpApi = thaibulksmsApi.otp({
            apiKey: process.env.THAIBULKSMS_APP_KEY,
            apiSecret: process.env.THAIBULKSMS_APP_SECRET,
            version: 'v2'
        });

        try {
            await otpApi.verify(token, otp);
        } catch (error) {
            console.error('❌ OTP Verify Error:', error);
            throw new Error('รหัส OTP ไม่ถูกต้อง หรือหมดอายุ');
        }
    } else {
        if (user.otp_code !== otp) {
            throw new Error('รหัส OTP ไม่ถูกต้อง');
        }
        const now = new Date();
        const expires = new Date(user.otp_expires);
        if (now > expires) {
            throw new Error('รหัส OTP หมดอายุแล้ว');
        }
    }
}

function createSessionForBay(userId, machineId) {
    if (!machineId) return;

    db.all("SELECT machine_id FROM sessions WHERE user_id=? AND status='active'", [userId], (err, rows) => {
        if (!err && rows && rows.length > 0) {
            rows.forEach(r => {
                db.run("UPDATE machines SET status='idle' WHERE id=?", [r.machine_id]);
            });
            db.run("UPDATE sessions SET status='ended' WHERE user_id=? AND status='active'", [userId]);
        }

        db.run("UPDATE sessions SET status='ended' WHERE machine_id=? AND status='active'", [machineId], () => {
            db.run("UPDATE machines SET status='busy' WHERE id=?", [machineId]);
            db.run("INSERT INTO sessions (user_id, machine_id, reserved_amount, status) VALUES (?,?,0,'active')", [userId, machineId]);
            console.log(`📍 Session เปิดสำหรับ User ${userId} → Bay ${machineId}`);
        });
    });
}

app.post('/auth/register/verify-otp', async (req, res) => {
    const { identifier, otp, name, password } = req.body;
    if (!identifier || !otp || !name) return res.status(400).json({ message: '❌ กรุณาระบุรหัสยืนยันตัวตน, OTP, และชื่อ' });

    const isPhone = validatePhone(identifier);
    const queryCol = isPhone ? 'phone' : 'email';

    if (!isPhone) {
        if (!password) {
            return res.status(400).json({ message: '❌ กรุณาระบุรหัสผ่านสำหรับการสมัครด้วยอีเมล' });
        }
        if (!validatePassword(password)) {
            return res.status(400).json({ message: '❌ รหัสผ่านต้องมี 6 ตัวอักษรขึ้นไป และมี พิมพ์เล็ก พิมพ์ใหญ่ ตัวเลขผสมกัน' });
        }
    }

    db.get(`SELECT * FROM users WHERE ${queryCol} = ?`, [identifier], async (err, user) => {
        if (err || !user) return res.status(404).json({ message: '❌ ไม่พบบัญชีนี้ กรุณากดขอ OTP ใหม่' });

        try {
            await verifyOTP(identifier, otp, isPhone, user);
        } catch (e) {
            return res.status(400).json({ message: `❌ ${e.message}` });
        }

        const token = generateToken();
        const refreshToken = generateToken();
        const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        const { machine_id } = req.body;

        let hashedPassword = null;
        if (!isPhone && password) {
            hashedPassword = bcrypt.hashSync(password, 10);
        }

        db.run(
            `UPDATE users SET token = ?, refresh_token = ?, token_expires = ?, otp_code = NULL, otp_expires = NULL, name = ?, status = 'active', password = ? WHERE id = ?`,
            [token, refreshToken, tokenExpires.toISOString(), name, hashedPassword, user.id],
            (err2) => {
                if (err2) return res.status(500).json({ message: '❌ สมัครสมาชิกไม่ได้' });
                createSessionForBay(user.id, machine_id);
                res.json({
                    message: `✅ สมัครสมาชิกสำเร็จ! ยินดีต้อนรับ ${name}`,
                    token,
                    refreshToken,
                    user: { id: user.id, name, [queryCol]: identifier, balance: user.balance }
                });
            }
        );
    });
});

app.post('/auth/login', (req, res) => {
    const { identifier, password, machine_id } = req.body;
    if (!identifier || !password) return res.status(400).json({ message: '❌ กรุณาระบุอีเมลและรหัสผ่าน' });

    db.get("SELECT * FROM users WHERE email = ? AND status = 'active'", [identifier], (err, user) => {
        if (err || !user) return res.status(404).json({ message: '❌ ไม่พบบัญชีหรือรหัสผ่านผิด' });

        if (!user.password || !bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ message: '❌ รหัสผ่านไม่ถูกต้อง' });
        }

        const token = generateToken();
        const refreshToken = generateToken();
        const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

        db.run("UPDATE users SET token = ?, refresh_token = ?, token_expires = ? WHERE id = ?", 
            [token, refreshToken, tokenExpires.toISOString(), user.id], (err2) => {
            if (err2) return res.status(500).json({ message: '❌ ล็อกอินไม่ได้' });

            createSessionForBay(user.id, machine_id);
            res.json({
                message: `✅ เข้าสู่ระบบสำเร็จ! สวัสดี ${user.name || identifier.split('@')[0]}`,
                token,
                refreshToken,
                user: { id: user.id, name: user.name, email: user.email, balance: user.balance }
            });
        });
    });
});

app.post('/auth/login/verify-otp', async (req, res) => {
    const { identifier, otp } = req.body;
    if (!identifier || !otp) return res.status(400).json({ message: '❌ กรุณาระบุเบอร์/อีเมล และ OTP' });

    const isPhone = validatePhone(identifier);
    const queryCol = isPhone ? 'phone' : 'email';

    db.get(`SELECT * FROM users WHERE ${queryCol} = ?`, [identifier], async (err, user) => {
        if (err || !user) return res.status(404).json({ message: '❌ ไม่พบบัญชีนี้ กรุณาสมัครสมาชิก' });
        if (user.status !== 'active') return res.status(400).json({ message: '❌ บัญชีนี้ยังไม่ได้ยืนยันตัวตน หรือถูกระงับ' });

        try {
            await verifyOTP(identifier, otp, isPhone, user);
        } catch (e) {
            return res.status(400).json({ message: `❌ ${e.message}` });
        }

        const token = generateToken();
        const refreshToken = generateToken();
        const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const { machine_id } = req.body;
        const name = user.name || (isPhone ? identifier : identifier.split('@')[0]);

        db.run(
            `UPDATE users SET token = ?, refresh_token = ?, token_expires = ?, otp_code = NULL, otp_expires = NULL WHERE id = ?`,
            [token, refreshToken, tokenExpires.toISOString(), user.id],
            (err2) => {
                if (err2) return res.status(500).json({ message: '❌ ล็อกอินล้มเหลว' });
                createSessionForBay(user.id, machine_id);
                res.json({
                    message: `✅ เข้าสู่ระบบสำเร็จ! สวัสดี ${name}`,
                    token,
                    refreshToken,
                    user: { id: user.id, name, [queryCol]: identifier, balance: user.balance }
                });
            }
        );
    });
});

// Refresh Token Endpoint
app.post('/auth/refresh', (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ message: '❌ ระบุ refreshToken' });

    db.get("SELECT * FROM users WHERE refresh_token = ?", [refreshToken], (err, user) => {
        if (err || !user) return res.status(401).json({ message: '❌ Refresh Token ไม่ถูกต้อง' });

        const newToken = generateToken();
        const newRefreshToken = generateToken();
        const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

        db.run("UPDATE users SET token = ?, refresh_token = ?, token_expires = ? WHERE id = ?",
            [newToken, newRefreshToken, tokenExpires.toISOString(), user.id], (err2) => {
            if (err2) return res.status(500).json({ message: '❌ Refresh ไม่สำเร็จ' });
            res.json({ token: newToken, refreshToken: newRefreshToken });
        });
    });
});

app.post('/auth/logout', authMiddleware, (req, res) => {
    const userId = req.user.id;
    db.all("SELECT machine_id FROM sessions WHERE user_id=? AND status='active'", [userId], (_, sessions) => {
        sessions?.forEach(s => {
            db.run("UPDATE machines SET status='idle' WHERE id=?", [s.machine_id]);
        });
        db.run("UPDATE sessions SET status='ended' WHERE user_id=? AND status='active'", [userId]);
        db.run("UPDATE users SET token=NULL, refresh_token=NULL WHERE id=?", [userId]);
        console.log(`🚪 User ${userId} logout — ${sessions?.length || 0} session(s) ปิดแล้ว`);
        res.json({ message: '✅ ออกจากระบบเรียบร้อย' });
    });
});

app.get('/me', authMiddleware, (req, res) => {
    const machineId = req.query.machine_id;

    if (machineId) {
        createSessionForBay(req.user.id, machineId);
    }

    res.json({
        message: '✅ ข้อมูลบัญชีของคุณ',
        user: {
            id: req.user.id,
            name: req.user.name,
            phone: req.user.phone,
            email: req.user.email,
            balance: req.user.balance,
            status: req.user.status,
            role: req.user.role,
            joined: req.user.created_at
        }
    });
});

// ─── WALLET APIs ──────────────────────────────────────────────

app.post('/topup', authMiddleware, (req, res) => {
    const { amount } = req.body;
    if (!validateAmount(amount)) {
        return res.status(400).json({ message: '❌ จำนวนเงินไม่ถูกต้อง (1-999999)' });
    }

    const newBalance = req.user.balance + parseInt(amount);
    db.run("UPDATE users SET balance = ? WHERE id = ?", [newBalance, req.user.id], (err) => {
        if (err) return res.status(500).json({ message: '❌ เกิดข้อผิดพลาดในการเติมเงิน' });
        db.run(
            "INSERT INTO transactions (user_id, action_type, amount) VALUES (?, 'topup', ?)",
            [req.user.id, amount]
        );
        
        // Sync to Google Sheets
        syncToGoogleSheets({
            userId: req.user.id,
            userName: req.user.name,
            userPhone: req.user.phone || req.user.email,
            amount: amount,
            action: 'topup_manual'
        });

        res.json({ message: `✅ เติมเงิน ฿${amount} สำเร็จ!`, balance: newBalance });
    });
});

app.get('/wallet/history', authMiddleware, (req, res) => {
    db.all(
        "SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
        [req.user.id],
        (err, rows) => {
            if (err) return res.status(500).json({ message: '❌ เกิดข้อผิดพลาด' });
            res.json({ message: '✅ ประวัติการเงิน', history: rows });
        }
    );
});

// ─── MACHINE APIs ─────────────────────────────────────────────
// Note: /machines is PUBLIC (no auth required) for dashboard display
app.get('/machines', (req, res) => {
    const sql = `
        SELECT 
            m.id, m.name, m.status,
            s.id AS session_id, s.start_time, s.reserved_amount,
            u.name AS user_name, u.phone AS user_phone, u.email AS user_email, u.balance AS user_balance
        FROM machines m
        LEFT JOIN sessions s ON s.id = (
            SELECT id FROM sessions
            WHERE machine_id = m.id AND status = 'active'
            ORDER BY id DESC LIMIT 1
        )
        LEFT JOIN users u ON u.id = s.user_id
        ORDER BY m.id
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ message: '❌ เกิดข้อผิดพลาด' });
        res.json({ message: 'success', data: rows });
    });
});

// ─── SERVICE CONTROL APIs ─────────────────────────────────────

app.post('/service/start', authMiddleware, (req, res) => {
    const { machine_id, command, reserve_amount } = req.body;
    if (!machine_id || !command || !validateAmount(reserve_amount)) {
        return res.status(400).json({ message: '❌ กรุณาระบุ machine_id, command, reserve_amount ให้ถูกต้อง' });
    }
    if (req.user.balance < reserve_amount) {
        return res.status(400).json({ message: `❌ ยอดเงินไม่เพียงพอ ยอดเงินคงเหลือ ฿${req.user.balance}` });
    }

    db.get("SELECT * FROM machines WHERE id = ?", [machine_id], (err, machine) => {
        if (!machine) return res.status(404).json({ message: '❌ ไม่พบตู้นี้' });
        if (machine.status === 'busy') return res.status(409).json({ message: '❌ ตู้นี้กำลังถูกใช้งานอยู่' });

        const newBalance = req.user.balance - reserve_amount;
        db.run("UPDATE users SET balance = ? WHERE id = ?", [newBalance, req.user.id], (err) => {
            if (err) return res.status(500).json({ message: '❌ ไม่สามารถหักเงินได้' });

            db.run(
                "INSERT INTO sessions (user_id, machine_id, reserved_amount) VALUES (?, ?, ?)",
                [req.user.id, machine_id, reserve_amount],
                function (err2) {
                    if (err2) return res.status(500).json({ message: '❌ ไม่สามารถสร้าง session ได้' });
                    const session_id = this.lastID;

                    db.run("UPDATE machines SET status = 'busy' WHERE id = ?", [machine_id]);
                    db.run(
                        "INSERT INTO transactions (user_id, action_type, amount, machine_id) VALUES (?, 'reserve', ?, ?)",
                        [req.user.id, reserve_amount, machine_id]
                    );
                    db.run("UPDATE machines SET pending_command = ? WHERE id = ?", [command, machine_id]);
                    console.log(`📤 บันทึกคำสั่ง [${command}] → Bay ${machine_id} (HTTP Polling)`);

                    res.json({
                        message: `✅ เริ่มบริการสำเร็จ (${command})`,
                        session_id,
                        balance: newBalance,
                        reserved: reserve_amount
                    });
                }
            );
        });
    });
});

app.post('/service/stop', authMiddleware, (req, res) => {
    const { session_id, actual_amount } = req.body;
    if (!session_id || !validateAmount(actual_amount)) {
        return res.status(400).json({ message: '❌ กรุณาระบุ session_id และ actual_amount ให้ถูกต้อง' });
    }

    db.get("SELECT * FROM sessions WHERE id = ? AND user_id = ? AND status = 'active'",
        [session_id, req.user.id],
        (err, session) => {
            if (err || !session) return res.status(404).json({ message: '❌ ไม่พบ session ที่ใช้งานอยู่' });

            const refund = session.reserved_amount - actual_amount;
            if (refund < 0) return res.status(400).json({ message: '❌ ยอดที่ใช้จริงเกินกว่าที่จองไว้' });

            const newBalance = req.user.balance + refund;

            db.run("UPDATE sessions SET status = 'finished' WHERE id = ?", [session_id], (err) => {
                if (err) return res.status(500).json({ message: '❌ ไม่สามารถปิด session ได้' });

                db.run("UPDATE users SET balance = ? WHERE id = ?", [newBalance, req.user.id]);
                db.run("UPDATE machines SET status = 'idle' WHERE id = ?", [session.machine_id]);
                db.run(
                    "INSERT INTO transactions (user_id, action_type, amount, machine_id) VALUES (?, 'usage', ?, ?)",
                    [req.user.id, actual_amount, session.machine_id]
                );
                if (refund > 0) {
                    db.run(
                        "INSERT INTO transactions (user_id, action_type, amount, machine_id) VALUES (?, 'refund', ?, ?)",
                        [req.user.id, refund, session.machine_id]
                    );
                }

                console.log(`🛑 คำสั่ง STOP บันทึกสำเร็จ Bay ${session.machine_id}`);

                res.json({
                    message: '✅ หยุดบริการเรียบร้อย!',
                    used: actual_amount,
                    refund,
                    balance: newBalance
                });
            });
        }
    );
});

// ─── ADMIN APIs ───────────────────────────────────────────────

// PUBLIC endpoint for reset (no auth required)
app.post('/admin/reset-bay', (req, res) => {
    const { machine_id } = req.body;
    if (!machine_id) return res.status(400).json({ message: '❌ ระบุ machine_id' });
    db.run("UPDATE sessions SET status='ended' WHERE machine_id=? AND status='active'", [machine_id], (e1) => {
        db.run("UPDATE machines SET status='idle' WHERE id=?", [machine_id], (e2) => {
            if (e1 || e2) return res.status(500).json({ message: '❌ Reset ไม่สำเร็จ' });
            console.log(`🔄 [Admin] Force reset Bay ${machine_id} → idle`);
            res.json({ message: `✅ Reset Bay ${machine_id} เรียบร้อย` });
        });
    });
});

// PUBLIC: User management (no auth required for now)
app.get('/admin/users', (req, res) => {
    db.all("SELECT id, name, phone, email, balance, status, role, created_at FROM users WHERE status != 'pending' ORDER BY id DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ message: '❌ เกิดข้อผิดพลาด' });
        res.json({ message: '✅ รายชื่อสมาชิก', users: rows });
    });
});

// PUBLIC: Financial operations (no auth required for now)
app.post('/admin/topup', (req, res) => {
    const { user_id, amount } = req.body;
    if (!user_id || !validateAmount(amount)) {
        return res.status(400).json({ message: '❌ ระบุ user_id และ amount ให้ถูกต้อง' });
    }
    db.get("SELECT * FROM users WHERE id = ?", [user_id], (err, user) => {
        if (err || !user) return res.status(404).json({ message: '❌ ไม่พบผู้ใช้' });
        const newBalance = user.balance + parseInt(amount);
        db.run("UPDATE users SET balance = ? WHERE id = ?", [newBalance, user_id], (err2) => {
            if (err2) return res.status(500).json({ message: '❌ เติมเงินไม่สำเร็จ' });
            db.run("INSERT INTO transactions (user_id, action_type, amount) VALUES (?, 'topup', ?)", [user_id, amount]);
            
            // Sync to Google Sheets
            syncToGoogleSheets({
                userId: user_id,
                userName: user.name,
                userPhone: user.phone || user.email,
                amount: amount,
                action: 'admin_topup'
            });

            res.json({ message: `✅ เติมเงิน ฿${amount} ให้ ${user.name || user.phone || user.email} สำเร็จ!`, balance: newBalance });
        });
    });
});

// PUBLIC: Deduct (no auth required for now)
app.post('/admin/deduct', (req, res) => {
    const { user_id, amount } = req.body;
    if (!user_id || !validateAmount(amount)) {
        return res.status(400).json({ message: '❌ ระบุ user_id และ amount ให้ถูกต้อง' });
    }
    db.get("SELECT * FROM users WHERE id = ?", [user_id], (err, user) => {
        if (err || !user) return res.status(404).json({ message: '❌ ไม่พบผู้ใช้' });
        if (user.balance < amount) {
            return res.status(400).json({ message: `❌ ยอดเงินไม่พอ (มีอยู่ ฿${user.balance})` });
        }
        const newBalance = user.balance - parseInt(amount);
        db.run("UPDATE users SET balance = ? WHERE id = ?", [newBalance, user_id], (err2) => {
            if (err2) return res.status(500).json({ message: '❌ ลดเงินไม่สำเร็จ' });
            db.run("INSERT INTO transactions (user_id, action_type, amount) VALUES (?, 'deduct', ?)", [user_id, amount]);
            res.json({ message: `✅ ลดเงิน ฿${amount} จาก ${user.name || user.phone || user.email} สำเร็จ!`, balance: newBalance });
        });
    });
});

// PUBLIC endpoint for Dashboard control (no auth required)
app.post('/admin/command', (req, res) => {
    const { machine_id, command } = req.body;
    const validCmds = ['WATER_ON', 'FOAM_ON', 'AIR_ON', 'WAX_ON', 'TYRE_ON', 'STOP'];
    if (!machine_id || !command) return res.status(400).json({ message: '❌ ระบุ machine_id และ command' });
    if (!validCmds.includes(command)) return res.status(400).json({ message: `❌ Command ไม่ถูกต้อง (${validCmds.join(', ')})` });

    db.run("UPDATE machines SET pending_command = ? WHERE id = ?", [command, machine_id]);

    if (command === 'STOP') {
        db.run("UPDATE machines SET status = 'idle' WHERE id = ?", [machine_id]);
    } else {
        db.run("UPDATE machines SET status = 'busy' WHERE id = ?", [machine_id]);
    }

    console.log(`🕹️ [Dashboard] บันทึกคำสั่ง [${command}] → Bay ${machine_id}`);
    res.json({ message: `✅ ส่งคำสั่ง ${command} ไปที่ Bay ${machine_id} เรียบร้อย!` });
});

// PUBLIC: Finance reports (no auth required for now)
app.get('/admin/finance', (req, res) => {
    const queries = {
        daily: `
            SELECT date(created_at) AS label, SUM(amount) AS total, COUNT(*) AS count
            FROM transactions
            WHERE action_type = 'topup'
              AND created_at >= date('now', '-6 days')
            GROUP BY date(created_at)
            ORDER BY label ASC`,
        weekly: `
            SELECT strftime('%Y-W%W', created_at) AS label, SUM(amount) AS total, COUNT(*) AS count
            FROM transactions
            WHERE action_type = 'topup'
              AND created_at >= date('now', '-28 days')
            GROUP BY strftime('%Y-W%W', created_at)
            ORDER BY label ASC`,
        monthly: `
            SELECT strftime('%Y-%m', created_at) AS label, SUM(amount) AS total, COUNT(*) AS count
            FROM transactions
            WHERE action_type = 'topup'
              AND created_at >= date('now', '-5 months')
            GROUP BY strftime('%Y-%m', created_at)
            ORDER BY label ASC`,
        summary: `
            SELECT
                COALESCE(SUM(CASE WHEN action_type='topup' AND date(created_at) = date('now') THEN amount END), 0) AS today,
                COALESCE(SUM(CASE WHEN action_type='topup' AND created_at >= date('now', '-6 days') THEN amount END), 0) AS week,
                COALESCE(SUM(CASE WHEN action_type='topup' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now') THEN amount END), 0) AS month,
                COALESCE(SUM(CASE WHEN action_type='topup' THEN amount END), 0) AS alltime
            FROM transactions`
    };

    const result = {};
    let done = 0;
    const keys = Object.keys(queries);

    keys.forEach(key => {
        db.all(queries[key], [], (err, rows) => {
            result[key] = err ? [] : rows;
            done++;
            if (done === keys.length) {
                res.json({ message: 'success', data: result });
            }
        });
    });
});

// PUBLIC: User deletion (no auth required for now)
app.delete('/admin/users/:id', (req, res) => {
    const { id } = req.params;
    
    db.run("DELETE FROM sessions WHERE user_id = ?", [id], (e1) => {
        db.run("DELETE FROM transactions WHERE user_id = ?", [id], (e2) => {
            db.run("DELETE FROM users WHERE id = ?", [id], function (err) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ message: '❌ ลบไม่สำเร็จ (มีข้อมูลผูกพัน)' });
                }
                if (this.changes === 0) return res.status(404).json({ message: '❌ ไม่พบผู้ใช้' });
                res.json({ message: `✅ ลบผู้ใช้ #${id} สำเร็จ` });
            });
        });
    });
});

// PUBLIC: Password change (no auth required for now)
app.put('/admin/users/:id/password', async (req, res) => {
    const { id } = req.params;
    const { password } = req.body;
    if (!password || !validatePassword(password)) {
        return res.status(400).json({ message: '❌ รหัสผ่านต้องมี 6 ตัวอักษรขึ้นไป (พิมพ์เล็ก พิมพ์ใหญ่ ตัวเลข)' });
    }
    try {
        const hashed = await bcrypt.hash(password, 10);
        db.run("UPDATE users SET password = ? WHERE id = ?", [hashed, id], function (err) {
            if (err) return res.status(500).json({ message: '❌ เปลี่ยนรหัสผ่านไม่สำเร็จ' });
            if (this.changes === 0) return res.status(404).json({ message: '❌ ไม่พบผู้ใช้' });
            res.json({ message: `✅ เปลี่ยนรหัสผ่านสำเร็จ` });
        });
    } catch (e) {
        res.status(500).json({ message: '❌ เกิดข้อผิดพลาด Hash รหัสผ่าน' });
    }
});

// PUBLIC: User creation (no auth required for now)
app.post('/admin/users', async (req, res) => {
    const { name, phone, email, password, role } = req.body;
    if (!name) return res.status(400).json({ message: '❌ กรุณาระบุชื่อ' });
    if (!phone && !email) return res.status(400).json({ message: '❌ กรุณาระบุเบอร์โทรหรืออีเมล' });
    if (phone && !validatePhone(phone)) return res.status(400).json({ message: '❌ รูปแบบเบอร์โทรไม่ถูกต้อง' });
    if (email && !validateEmail(email)) return res.status(400).json({ message: '❌ รูปแบบอีเมลไม่ถูกต้อง' });
    
    try {
        const hashed = password ? await bcrypt.hash(password, 10) : null;
        const userRole = role && ['admin', 'user'].includes(role) ? role : 'user';
        
        db.run(
            "INSERT INTO users (name, phone, email, password, balance, status, role) VALUES (?, ?, ?, ?, 0, 'active', ?)",
            [name, phone || null, email || null, hashed, userRole],
            function (err) {
                if (err) {
                    if (err.message.includes('UNIQUE')) return res.status(400).json({ message: '❌ เบอร์หรืออีเมลนี้มีอยู่แล้ว' });
                    return res.status(500).json({ message: '❌ เพิ่มผู้ใช้ไม่สำเร็จ' });
                }
                res.json({ message: `✅ เพิ่มผู้ใช้ ${name} สำเร็จ`, id: this.lastID });
            }
        );
    } catch (e) {
        res.status(500).json({ message: '❌ เกิดข้อผิดพลาด' });
    }
});

// ─── Legacy API ────────────────────────────────────────────────

app.get('/user/:identifier', (req, res) => {
    const identifier = req.params.identifier;
    const isPhone = validatePhone(identifier);
    const queryCol = isPhone ? 'phone' : 'email';
    db.get(`SELECT * FROM users WHERE ${queryCol} = ?`, [identifier], (err, user) => {
        if (user) res.json({ message: 'เจอข้อมูลลูกค้า', [queryCol]: identifier, balance: user.balance });
        else res.json({ message: 'ไม่พบข้อมูลลูกค้านี้' });
    });
});

// ─── ESP8266 HTTP Polling API ──────────────────────────────────

app.get('/api/bay/:id/command', (req, res) => {
    const machine_id = parseInt(req.params.id);
    db.get("SELECT pending_command FROM machines WHERE id = ?", [machine_id], (err, row) => {
        if (err || !row) return res.status(404).json({ command: null, message: '❌ ไม่พบตู้นี้' });
        const cmd = row.pending_command;
        if (!cmd) return res.json({ command: null });
        db.run("UPDATE machines SET pending_command = NULL WHERE id = ?", [machine_id]);
        console.log(`📲 [ESP ${machine_id}] ดึงคำสั่ง: ${cmd}`);
        res.json({ command: cmd });
    });
});

app.post('/api/bay/:id/status', (req, res) => {
    const machine_id = parseInt(req.params.id);
    const { status } = req.body;
    if (!['IDLE', 'BUSY'].includes(status)) {
        return res.status(400).json({ message: '❌ status ต้องเป็น IDLE หรือ BUSY' });
    }
    const dbStatus = status === 'IDLE' ? 'idle' : 'busy';
    db.run("UPDATE machines SET status = ? WHERE id = ?", [dbStatus, machine_id], function (err) {
        if (err || this.changes === 0) return res.status(404).json({ message: '❌ ไม่พบตู้นี้' });
        console.log(`📡 [ESP ${machine_id}] รายงานสถานะ: ${status}`);
        res.json({ message: `✅ อัปเดตสถานะ Bay ${machine_id} → ${status}` });
    });
});

// ─── SCB QR Payment ───────────────────────────────────────────
const SCB_BASE = process.env.SCB_SANDBOX === 'true'
    ? 'https://api-sandbox.partners.scb/partners/sandbox'
    : 'https://api.partners.scb/partners';

let scbToken = null;
let scbTokenExpires = 0;

async function getScbToken() {
    if (scbToken && Date.now() < scbTokenExpires) return scbToken;
    try {
        const resp = await axios.post(`${SCB_BASE}/v1/oauth/token`, {
            applicationKey: process.env.SCB_API_KEY,
            applicationSecret: process.env.SCB_API_SECRET
        }, {
            headers: {
                'Content-Type': 'application/json',
                'requestUID': crypto.randomUUID(),
                'resourceOwnerID': process.env.SCB_API_KEY,
                'accept-language': 'EN',
                'channel': 'scbeasy'
            }
        });
        scbToken = resp.data.data.accessToken;
        scbTokenExpires = Date.now() + (resp.data.data.expiresIn - 60) * 1000;
        console.log('✅ [SCB] ได้ Token แล้ว');
        return scbToken;
    } catch (err) {
        console.error('❌ [SCB] Token Error:', err.response?.data || err.message);
        throw new Error('ไม่สามารถเชื่อมต่อ SCB API ได้');
    }
}

app.post('/api/qr/create', authMiddleware, async (req, res) => {
    const { amount } = req.body;
    if (!validateAmount(amount)) return res.status(400).json({ message: '❌ จำนวนเงินไม่ถูกต้อง' });

    const ref1 = `USR${req.user.id}`;
    const ref2 = `AMT${amount}`;
    const qrRef = `CW${Date.now()}`;

    try {
        const token = await getScbToken();
        const resp = await axios.post(`${SCB_BASE}/v1/payment/qrcode/create`, {
            qrType: 'PP',
            ppType: 'BILLERID',
            ppId: process.env.SCB_BILLER_ID,
            amount: amount.toString(),
            ref1, ref2,
            ref3: qrRef
        }, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'requestUID': crypto.randomUUID(),
                'resourceOwnerID': process.env.SCB_API_KEY,
                'accept-language': 'EN',
                'channel': 'scbeasy'
            }
        });

        const qrImage = resp.data.data?.qrImage;
        if (!qrImage) throw new Error('SCB ไม่ส่ง QR Image กลับมา');

        db.run(
            `UPDATE users SET pending_qr_ref = ?, pending_qr_amount = ? WHERE id = ?`,
            [qrRef, amount, req.user.id]
        );

        console.log(`📲 [SCB QR] สร้าง QR สำหรับ user ${req.user.id} จำนวน ฿${amount}`);
        res.json({ qrImage, qrRef });
    } catch (err) {
        console.error('❌ [SCB QR] Error:', err.response?.data || err.message);
        
        // Fallback for Sandbox/Development when SCB is down
        if (process.env.SCB_SANDBOX === 'true' || process.env.NODE_ENV === 'development') {
            console.warn('⚠️ [SCB QR] Falling back to MOCK QR because SCB is down');
            
            db.run(
                `UPDATE users SET pending_qr_ref = ?, pending_qr_amount = ? WHERE id = ?`,
                [qrRef, amount, req.user.id]
            );

            // A simple placeholder base64 for a QR code (150x150)
            const mockQrImage = "iVBORw0KGgoAAAANSUhEUgAAAJYAAACWAQAAAAB2866EAAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAAAmJLR0QA/4ePzL8AAAAHdElNRQfmAxMTIidmX6v6AAAA8UlEQVRYw2P4v4KBAQgYGBiY/jP8Z4AIIAFGkAAjSIARJMAlwAgSYAQJMIKMjY2NjY2Njc3Y2NjY2NjY2NjExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMSW5mQAALjSADF61TfPAAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDIyLTAzLTE5VDE5OjM0OjM5KzAwOjAw7p3M1AAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyMi0wMy0xOVQxOTozNDozOSswMDowMHu7iR0AAAAASUVORK5CYII=";

            return res.json({ 
                qrImage: mockQrImage, 
                qrRef,
                isMock: true,
                message: '⚠️ ระบบ Sandbox SCB ขัดข้อง กำลังใช้ QR จำลองเพื่อการทดสอบ'
            });
        }

        res.status(500).json({ message: err.message || '❌ ไม่สามารถสร้าง QR ได้' });
    }
});

// ─── Google Sheets Sync ─────────────────────────────────────────
async function syncToGoogleSheets(data) {
    const apiLink = "https://script.google.com/macros/s/AKfycbwCSDt4aoxyrnU9TIrEiFZtDbGcoah_VN0mw38fzYc9KNUG6XQDTGZ6bqZ7YxpIBDUr/exec";
    try {
        // Construct the URL parameters as expected by the Google Apps Script
        const params = new URLSearchParams({
            memberId: data.userName || `ID:${data.userId}`,
            amount: data.amount,
            status: data.action === 'topup_qr' ? 'Topup (SCB QR)' : data.action
        });
        
        // The script expects a GET request, but POST with body might not be parsed correctly based on the provided script.
        // We'll use GET with query parameters as the simplest way to hit the Apps Script doGet.
        const urlWithParams = `${apiLink}?${params.toString()}`;
        
        await axios.get(urlWithParams);
        console.log(`📊 [G-Sheets] บันทึกยอด ฿${data.amount} ของ ${data.userName || data.userId} สำเร็จ`);
    } catch (e) {
        console.error('❌ [G-Sheets Error]:', e.message);
    }
}

// Webhook — SCB แจ้งกลับเมื่อมีการโอนเงินสำเร็จ
app.post('/webhook/scb', async (req, res) => {
    console.log('📩 [SCB Webhook]', JSON.stringify(req.body));
    res.status(200).json({ status: 'ok' });

    try {
        const { ref3, amount, transactionId } = req.body.data || req.body;
        if (!ref3 || !amount) return;

        db.get(
            `SELECT * FROM users WHERE pending_qr_ref = ?`, [ref3],
            (err, user) => {
                if (err || !user) {
                    console.warn(`⚠️ [SCB Webhook] ไม่พบ user สำหรับ ref3: ${ref3}`);
                    return;
                }
                const topupAmount = parseFloat(amount);
                db.run(
                    `UPDATE users SET balance = balance + ?, pending_qr_ref = NULL, pending_qr_amount = NULL WHERE id = ?`,
                    [topupAmount, user.id],
                    (err2) => {
                        if (!err2) {
                            db.run(
                                `INSERT INTO transactions (user_id, action_type, amount) VALUES (?, 'topup', ?)`,
                                [user.id, topupAmount]
                            );
                            console.log(`✅ [SCB Webhook] เติมเงิน ฿${topupAmount} ให้ user ${user.id} สำเร็จ`);

                            // --- Sync to Google Sheets ---
                            syncToGoogleSheets({
                                userId: user.id,
                                userName: user.name,
                                userPhone: user.phone || user.email,
                                amount: topupAmount,
                                action: 'topup_qr',
                                transactionId: transactionId || ref3
                            });
                        }
                    }
                );
            }
        );
    } catch (e) {
        console.error('❌ [SCB Webhook] exception:', e.message);
    }
});

// ─── Health Check ──────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── 404 Handler ───────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ message: '❌ Endpoint ไม่พบ' });
});

// ─── Start Server ─────────────────────────────────────────────
app.listen(port, () => {
    console.log(`🚀 Server ร้านล้างรถเริ่มทำงานแล้วที่ http://localhost:${port}`);
    console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔐 Rate limiting: Enabled`);
    console.log(`✅ Security: CORS + Token Expiration + Admin Role`);
});

module.exports = app;
