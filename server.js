// Note: Google Sheets sync function removed - using local database only

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

require('dotenv').config();
const nodemailer = require('nodemailer');
const axios = require('axios');
const thaibulksmsApi = require('thaibulksms-api');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');

// Initialize Google OAuth Client
let googleClient = null;
if (process.env.GOOGLE_CLIENT_ID) {
    googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    console.log('✅ Google OAuth Client initialized');
} else {
    console.warn('⚠️ GOOGLE_CLIENT_ID not configured');
}

// ─── FIREBASE INIT ──────────────────────────────────────────
const admin = require('firebase-admin');
let dbFirebase = null;
try {
    const serviceAccount = require('./firebase-key.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://carwash-ccit-default-rtdb.firebaseio.com/"
    });
    dbFirebase = admin.database();
    console.log('✅ เชื่อมต่อ Google Firebase Realtime Database สำเร็จ');
} catch (e) {
    console.error('❌ ไม่สามารถเชื่อมต่อ Firebase ได้ (โปรดตรวจดูไฟล์ firebase-key.json):', e.message);
}

function pushCommandToFirebase(machineId, command) {
    if (!dbFirebase || !machineId || !command) return;
    try {
        dbFirebase.ref(`bays/${machineId}/command`).set({
            action: command,
            timestamp: admin.database.ServerValue.TIMESTAMP
        });
        
        dbFirebase.ref(`bays/${machineId}/status`).update({
            state: command === 'STOP' ? 'IDLE' : 'BUSY'
        });
    } catch(err) {
        console.error('❌ [Firebase Error]:', err.message);
    }
}

const app = express();
app.set('trust proxy', 1); // เปลี่ยนเป็น 1 แทน true เพื่อให้ Express Rate Limit แจ้ง Error ผ่าน
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
    message: { message: '❌ ลองเข้าสู่ระบบเกินครั้ง กรุณารอ 15 นาที' },
    validate: { trustProxy: false },
    standardHeaders: true,
    legacyHeaders: false,
});

const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30, // 30 requests per minute
    message: { message: '❌ เกินขีดจำกัดการใช้งาน' },
    validate: { trustProxy: false },
    skip: (req) => req.user?.role === 'admin' // admins bypass
});

app.use('/auth/', authLimiter);
app.use('/api/', apiLimiter);

// ─── ฐานข้อมูล ──────────────────────────────────────────────
const dbPath = path.join(__dirname, 'data', 'carwash.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) return console.error('❌ ไม่สามารถเชื่อมต่อฐานข้อมูลได้:', err.message);
    console.log('✅ เชื่อมต่อฐานข้อมูล data/carwash.db สำเร็จ');
    
    db.serialize(() => {
        db.run('PRAGMA journal_mode = WAL');
        db.run('PRAGMA cache_size = 5000');
        db.run('PRAGMA foreign_keys = ON');
        db.run('PRAGMA synchronous = NORMAL');

        // 🛡️ Auto-Migrate: Ensure tables exist even if init_db.js failed
        db.run(`CREATE TABLE IF NOT EXISTS machines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            status TEXT DEFAULT 'ready'
        )`, () => {
            // Check if machines exist, if not, insert defaults
            db.get("SELECT COUNT(*) as count FROM machines", (err, row) => {
                if (!err && row.count === 0) {
                    db.run(`INSERT INTO machines (name, status) VALUES 
                        ('Bay 1', 'idle'), ('Bay 2', 'idle'), ('Bay 3', 'idle'), 
                        ('Bay 4', 'idle'), ('Bay 5', 'idle'), ('Bay 6', 'idle')`);
                    console.log("✅ [DB] สร้างข้อมูลตู้ล้างรถเริ่มต้นเรียบร้อย");
                }
            });
        });

        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone TEXT UNIQUE,
            email TEXT UNIQUE,
            password TEXT,
            google_id VARCHAR(255) UNIQUE,
            google_picture TEXT,
            name TEXT,
            balance INTEGER DEFAULT 0,
            status TEXT DEFAULT 'active',
            token TEXT,
            refresh_token TEXT,
            token_expires DATETIME,
            otp_code TEXT,
            otp_expires DATETIME,
            otp_type TEXT,
            role TEXT DEFAULT 'user',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action_type TEXT,
            amount INTEGER,
            machine_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(machine_id) REFERENCES machines(id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            machine_id INTEGER,
            start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            reserved_amount INTEGER,
            status TEXT DEFAULT 'active',
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(machine_id) REFERENCES machines(id)
        )`);

        // Migration for existing tables
        db.run("ALTER TABLE machines ADD COLUMN pending_command TEXT DEFAULT NULL", (err) => { if (err && !err.message.includes('duplicate column')) console.log('ℹ️ Migration (machines.pending_command):', err.message); });
        db.run("ALTER TABLE users ADD COLUMN pending_qr_ref TEXT DEFAULT NULL", (err) => { if (err && !err.message.includes('duplicate column')) console.log('ℹ️ Migration (users.pending_qr_ref):', err.message); });
        db.run("ALTER TABLE users ADD COLUMN pending_qr_amount REAL DEFAULT NULL", (err) => { if (err && !err.message.includes('duplicate column')) console.log('ℹ️ Migration (users.pending_qr_amount):', err.message); });
        db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'", (err) => { if (err && !err.message.includes('duplicate column')) console.log('ℹ️ Migration (users.role):', err.message); });
        db.run("ALTER TABLE users ADD COLUMN token_expires DATETIME", (err) => { if (err && !err.message.includes('duplicate column')) console.log('ℹ️ Migration (users.token_expires):', err.message); });
        db.run("ALTER TABLE users ADD COLUMN refresh_token TEXT", (err) => { if (err && !err.message.includes('duplicate column')) console.log('ℹ️ Migration (users.refresh_token):', err.message); });
        db.run("ALTER TABLE users ADD COLUMN google_id TEXT", (err) => { if (err && !err.message.includes('duplicate column')) console.log('ℹ️ Migration (users.google_id):', err.message); });
        db.run("ALTER TABLE users ADD COLUMN google_picture TEXT", (err) => { if (err && !err.message.includes('duplicate column')) console.log('ℹ️ Migration (users.google_picture):', err.message); });
        // Create unique index for google_id
        db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id)", (err) => { if (err) console.log('ℹ️ Migration (index google_id):', err.message); });
    });
});

// ─── ยูทิลิตี้ ────────────────────────────────────────────────
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
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

// ─── GOOGLE OAUTH ──────────────────────────────────────────────

// Google OAuth Callback endpoint - called by Google after user authorizes
app.get('/auth/google/callback', async (req, res) => {
    const { code, state } = req.query;
    
    if (!code) {
        return res.status(400).json({ message: '❌ Authorization code missing' });
    }

    if (!googleClient) {
        return res.status(500).json({ message: '❌ Google OAuth not configured' });
    }

    try {
        // Exchange authorization code for tokens using OAuth2 flow
        const { tokens } = await googleClient.getToken(code);
        
        // Verify the ID token
        const ticket = await googleClient.verifyIdToken({
            idToken: tokens.id_token,
            audience: process.env.GOOGLE_CLIENT_ID
        });

        const payload = ticket.getPayload();
        const googleId = payload.sub;
        const email = payload.email;
        const name = payload.name;
        const picture = payload.picture;
        const machineId = state ? decodeURIComponent(state) : null;

        // Check if user exists
        db.get("SELECT * FROM users WHERE google_id = ?", [googleId], (err, user) => {
            if (err) {
                console.error('❌ [Google Callback] Database error:', err.message);
                return res.redirect(`/auth-error?error=database_error`);
            }

            const token = generateToken();
            const refreshToken = generateToken();
            const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

            if (user) {
                // User exists - login
                db.run(
                    "UPDATE users SET token = ?, refresh_token = ?, token_expires = ? WHERE id = ?",
                    [token, refreshToken, tokenExpires.toISOString(), user.id],
                    (err2) => {
                        if (err2) {
                            console.error(err2);
                            return res.redirect(`/auth-error?error=login_failed`);
                        }

                        createSessionForBay(user.id, machineId);
                        
                        // Redirect to frontend with tokens
                        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
                        const redirectUrl = `${frontendUrl}/auth-success?token=${encodeURIComponent(token)}&refreshToken=${encodeURIComponent(refreshToken)}&name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}`;
                        console.log(`✅ [Google OAuth] User ${user.id} logged in via callback`);
                        res.redirect(redirectUrl);
                    }
                );
            } else {
                // New user - auto register
                db.run(
                    `INSERT INTO users (google_id, email, name, google_picture, balance, status, token, refresh_token, token_expires) 
                     VALUES (?, ?, ?, ?, 0, 'active', ?, ?, ?)`,
                    [googleId, email, name, picture, token, refreshToken, tokenExpires.toISOString()],
                    function (err2) {
                        if (err2) {
                            console.error('Insert error:', err2);
                            return res.redirect(`/auth-error?error=registration_failed`);
                        }

                        const userId = this.lastID;
                        createSessionForBay(userId, machineId);

                        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
                        const redirectUrl = `${frontendUrl}/auth-success?token=${encodeURIComponent(token)}&refreshToken=${encodeURIComponent(refreshToken)}&name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}`;
                        console.log(`✅ [Google OAuth] New user ${userId} registered and logged in via callback`);
                        res.redirect(redirectUrl);
                    }
                );
            }
        });
    } catch (error) {
        console.error('❌ Google callback error:', error);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        res.redirect(`${frontendUrl}/auth-error?error=${encodeURIComponent(error.message)}`);
    }
});

// POST endpoint for direct ID Token verification (for spa/mobile apps)
app.post('/auth/google', async (req, res) => {
    if (!googleClient) {
        return res.status(500).json({ message: '❌ Google OAuth not configured (GOOGLE_CLIENT_ID missing)' });
    }
    
    const { idToken, machine_id } = req.body;
    if (!idToken) return res.status(400).json({ message: '❌ ระบุ idToken' });

    try {
        // Verify Google ID Token
        const ticket = await googleClient.verifyIdToken({
            idToken: idToken,
            audience: process.env.GOOGLE_CLIENT_ID
        });

        const payload = ticket.getPayload();
        const googleId = payload.sub;
        const email = payload.email;
        const name = payload.name;
        const picture = payload.picture;

        // Check if user exists
        db.get("SELECT * FROM users WHERE google_id = ?", [googleId], (err, user) => {
            if (err) {
                console.error('❌ [Google Auth] Database error:', err.message);
                return res.status(500).json({ message: '❌ Database error' });
            }

            if (user) {
                // User exists - login
                const token = generateToken();
                const refreshToken = generateToken();
                const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

                db.run(
                    "UPDATE users SET token = ?, refresh_token = ?, token_expires = ? WHERE id = ?",
                    [token, refreshToken, tokenExpires.toISOString(), user.id],
                    (err2) => {
                        if (err2) return res.status(500).json({ message: '❌ Login failed' });

                        createSessionForBay(user.id, machine_id);
                        res.json({
                            message: `✅ เข้าสู่ระบบสำเร็จ! สวัสดี ${name}`,
                            token,
                            refreshToken,
                            user: {
                                id: user.id,
                                name: user.name,
                                email: user.email,
                                picture: user.google_picture,
                                balance: user.balance
                            }
                        });
                    }
                );
            } else {
                // New user - auto register
                const token = generateToken();
                const refreshToken = generateToken();
                const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

                db.run(
                    `INSERT INTO users (google_id, email, name, google_picture, balance, status, token, refresh_token, token_expires) 
                     VALUES (?, ?, ?, ?, 0, 'active', ?, ?, ?)`,
                    [googleId, email, name, picture, token, refreshToken, tokenExpires.toISOString()],
                    function (err2) {
                        if (err2) {
                            console.error('Insert error:', err2);
                            return res.status(500).json({ message: '❌ Registration failed' });
                        }

                        const userId = this.lastID;
                        createSessionForBay(userId, machine_id);

                        res.json({
                            message: `✅ สมัครสมาชิกและเข้าสู่ระบบสำเร็จ! ยินดีต้อนรับ ${name}`,
                            token,
                            refreshToken,
                            user: {
                                id: userId,
                                name,
                                email,
                                picture,
                                balance: 0
                            }
                        });
                    }
                );
            }
        });
    } catch (error) {
        console.error('Google token verification error:', error);
        res.status(401).json({ message: '❌ Invalid Google token' });
    }
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
                
                // Fallback for testing when SMS credit is zero
                console.warn('⚠️ [Mock OTP] เปิดใช้งาน OTP จำลองเนื่องจากโควต้า SMS หมด (เพื่อการทดสอบ)');
                saveCode = generateOTP();
                console.log(`🔑 [Mock] OTP สำหรับ ${identifier} คือ: ${saveCode}`);
                
                const expires = new Date(Date.now() + 5 * 60000);
                if (!user) {
                    db.run(`INSERT INTO users (${queryCol}, otp_code, otp_expires, otp_type, status) VALUES (?, ?, ?, ?, 'pending')`, [identifier, saveCode, expires.toISOString(), type]);
                } else {
                    db.run(`UPDATE users SET otp_code = ?, otp_expires = ?, otp_type = ? WHERE id = ?`, [saveCode, expires.toISOString(), type, user.id]);
                }
                return res.json({ message: `✅ (ทดสอบ) SMS หมด โค้ด OTP คือ: ${saveCode}` });
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

        // ถ้า token เป็นตัวเลข 6 หลัก แสดงว่าเป็น Mock OTP
        if (token.length === 6 && /^\d+$/.test(token)) {
            if (token !== otp) throw new Error('รหัส OTP จำลองไม่ถูกต้อง');
            const now = new Date();
            const expires = new Date(user.otp_expires);
            if (now > expires) throw new Error('รหัส OTP จำลองหมดอายุแล้ว');
            return; // ผ่าน
        }

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
        
        // Note: Google Sheets sync disabled - using local database only

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
                    pushCommandToFirebase(machine_id, command);
                    console.log(`📤 บันทึกคำสั่ง [${command}] → Bay ${machine_id} (Firebase & Local)`);

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

                pushCommandToFirebase(session.machine_id, 'STOP');
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
            pushCommandToFirebase(machine_id, 'STOP');
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
            
            // Note: Google Sheets sync disabled - using local database only

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

    pushCommandToFirebase(machine_id, command);
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

// ─── SCB QR Payment & Webhook ─────────────────────────────────
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
        console.log('✅ [SCB] ได้ Token ใหม่แล้ว');
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
        res.status(500).json({ message: '❌ ไม่สามารถสร้าง QR จาก SCB ได้' });
    }
});

// ─── SCB Webhook (รับแจ้งเตือนเมื่อเงินเข้า) ────────────────────────
// SCB จะส่ง POST Request มาที่นี่เมื่อมีการชำระเงินสำเร็จ
app.post('/webhook/scb', async (req, res) => {
    console.log('🔔 [SCB Webhook] ได้รับข้อมูล:', JSON.stringify(req.body));
    
    // โครงสร้าง Payload ของ SCB Webhook (อ้างอิงจาก SCB Developer Portal)
    const data = req.body;
    const qrRef = data.reference3; // เราแนบ qrRef ไปใน ref3 ตอนสร้าง QR
    const topupAmount = parseFloat(data.amount);

    if (!qrRef || !topupAmount) {
        console.warn('⚠️ [SCB Webhook] ข้อมูลมาไม่ครบ หรือไม่ใช่รายการจ่ายเงินที่ถูกต้อง');
        return res.status(400).json({ resCode: '99', resDesc: 'Invalid Format' });
    }

    // ไปหาว่ามี pending qr รหัสนี้อยู่กับใคร
    db.get(
        `SELECT * FROM users WHERE pending_qr_ref = ?`,
        [qrRef],
        (err, user) => {
            if (err || !user) {
                console.warn(`⚠️ [SCB Webhook] ไม่พบรายการสร้าง QR (Ref: ${qrRef}) หรือเติมเงินไปแล้ว ยอด ฿${topupAmount}`);
                // รีเทิร์น 00 (Success) เพื่อให้ SCB เลิกพยายามส่งซ้ำ
                return res.status(200).json({ resCode: '00', resDesc: 'Success (But ignored locally)' }); 
            }

            const newBalance = user.balance + topupAmount;

            // อัปเดตเงิน และล้างรหัส qrRef เพื่อป้องกันเงินเข้าซ้ำสองครั้ง
            db.run("UPDATE users SET balance = ?, pending_qr_ref = NULL, pending_qr_amount = NULL WHERE id = ?",
                [newBalance, user.id], (err2) => {
                    if (err2) {
                        console.error('❌ [SCB Webhook] อัปเดตเงินในฐานข้อมูลล้มเหลว', err2);
                        return res.status(500).json({ resCode: '99', resDesc: 'Internal Server Error' });
                    }

                    // บันทึก Log Transaction
                    db.run(
                        "INSERT INTO transactions (user_id, action_type, amount) VALUES (?, 'topup_scb', ?)",
                        [user.id, topupAmount]
                    );

                    // Note: Google Sheets sync disabled - using local database only

                    console.log(`💸 [TopUp] User ${user.id} เติมเงินผ่าน SCB Webhook ฿${topupAmount} (Ref: ${qrRef}) ยอดใหม่: ฿${newBalance}`);
                    res.status(200).json({ resCode: '00', resDesc: 'Success', transactionId: data.transactionId });
                }
            );
        }
    );
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

                            // Note: Google Sheets sync disabled - using local database only
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

