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

// ─── ENVIRONMENT VALIDATION ────────────────────────────────
if (process.env.NODE_ENV === 'production') {
    const required = ['GMAIL_USER', 'GMAIL_PASS', 'THAIBULKSMS_APP_KEY', 'THAIBULKSMS_APP_SECRET'];
    const missing = required.filter(key => !process.env[key]);
    if (missing.length > 0) {
        console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
        process.exit(1);
    }
    const recommended = ['SCB_WEBHOOK_SECRET', 'ESP_API_KEY', 'GOOGLE_CLIENT_ID', 'ADMIN_DEFAULT_PASSWORD'];
    recommended.filter(key => !process.env[key]).forEach(key => {
        console.warn(`⚠️ Recommended env var not set: ${key}`);
    });
}

const nodemailer = require('nodemailer');
const axios = require('axios');
const thaibulksmsApi = require('thaibulksms-api');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { OAuth2Client } = require('google-auth-library');
// jwt removed — using custom token generation instead
const compression = require('compression');

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

// ─── PERF: Firebase write with timeout protection ────────────
function pushCommandToFirebase(machineId, command) {
    if (!dbFirebase || !machineId || !command) return;
    const ref = dbFirebase.ref(`bays/${machineId}`);
    const updates = {
        command: {
            action: command,
            timestamp: admin.database.ServerValue.TIMESTAMP
        },
        'status/state': command === 'STOP' ? 'IDLE' : 'BUSY'
    };
    ref.update(updates).catch(err => {
        console.error('❌ [Firebase Error]:', err.message);
    });
}

const app = express();
app.set('trust proxy', 1);
const port = process.env.PORT || 3000;

// ─── MIDDLEWARE ─────────────────────────────────────────────
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Security Headers
app.use((req, res, next) => {
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('X-Frame-Options', 'DENY');
    res.header('X-XSS-Protection', '1; mode=block');
    res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

// CORS Configuration
app.use((req, res, next) => {
    const defaultOrigins = process.env.NODE_ENV === 'production' ? [] : ['http://localhost:3000'];
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || defaultOrigins;
    const origin = req.headers.origin;
    // Allow * only in non-production environments
    const allowWildcard = allowedOrigins.includes('*') && process.env.NODE_ENV !== 'production';
    if (allowWildcard || allowedOrigins.includes(origin)) {
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
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { message: '❌ ลองเข้าสู่ระบบเกินจำนวนครั้ง กรุณารอ 15 นาที' },
    validate: { trustProxy: false },
    standardHeaders: true,
    legacyHeaders: false,
});

const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 30,
    message: { message: '❌ เกินขีดจำกัดการใช้งาน' },
    validate: { trustProxy: false },
    skip: (req) => req.user?.role === 'admin'
});

app.use('/auth/', authLimiter);
app.use('/api/', apiLimiter);

// Global rate limit for all other routes (admin, wallet, service, etc.)
const globalLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 60,
    message: { message: '❌ เกินขีดจำกัดการใช้งาน' },
    validate: { trustProxy: false },
    skip: (req) => req.path.startsWith('/auth/') || req.path.startsWith('/api/') || req.path === '/health',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(globalLimiter);

// ─── ฐานข้อมูล ──────────────────────────────────────────────
const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'carwash.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) return console.error('❌ ไม่สามารถเชื่อมต่อฐานข้อมูลได้:', err.message);
    console.log('✅ เชื่อมต่อฐานข้อมูล data/carwash.db สำเร็จ');
    
    db.serialize(() => {
        db.run('PRAGMA journal_mode = WAL');
        db.run('PRAGMA cache_size = 10000');
        db.run('PRAGMA foreign_keys = ON');
        db.run('PRAGMA synchronous = NORMAL');
        db.run('PRAGMA temp_store = MEMORY');
        db.run('PRAGMA mmap_size = 268435456');

        db.run(`CREATE TABLE IF NOT EXISTS machines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            status TEXT DEFAULT 'ready'
        )`, () => {
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

        // ─── NEW: sensor_logs table ──────────────────────────────
        db.run(`CREATE TABLE IF NOT EXISTS sensor_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            machine_id INTEGER,
            water_level INTEGER DEFAULT 0,
            motion_detected INTEGER DEFAULT 0,
            fault_detected INTEGER DEFAULT 0,
            coin_value INTEGER DEFAULT 0,
            relay_states TEXT DEFAULT '[]',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(machine_id) REFERENCES machines(id)
        )`, (err) => {
            if (!err) console.log('✅ [DB] sensor_logs table ready');
        });

        // ─── Schema migrations ───────────────────────────────────
        db.run("ALTER TABLE machines ADD COLUMN pending_command TEXT DEFAULT NULL", (err) => { if (err && !err.message.includes('duplicate column')) console.log('ℹ️ Migration:', err.message); });
        db.run("ALTER TABLE machines ADD COLUMN sensor_water_level INTEGER DEFAULT 0", (err) => { if (err && !err.message.includes('duplicate column')) console.log('ℹ️ Migration:', err.message); });
        db.run("ALTER TABLE machines ADD COLUMN sensor_motion INTEGER DEFAULT 0", (err) => { if (err && !err.message.includes('duplicate column')) console.log('ℹ️ Migration:', err.message); });
        db.run("ALTER TABLE machines ADD COLUMN sensor_fault INTEGER DEFAULT 0", (err) => { if (err && !err.message.includes('duplicate column')) console.log('ℹ️ Migration:', err.message); });
        db.run("ALTER TABLE machines ADD COLUMN sensor_coin INTEGER DEFAULT 0", (err) => { if (err && !err.message.includes('duplicate column')) console.log('ℹ️ Migration:', err.message); });
        db.run("ALTER TABLE machines ADD COLUMN sensor_updated_at DATETIME", (err) => { if (err && !err.message.includes('duplicate column')) console.log('ℹ️ Migration:', err.message); });
        db.run("ALTER TABLE users ADD COLUMN pending_qr_ref TEXT DEFAULT NULL", (err) => { if (err && !err.message.includes('duplicate column')) console.log('ℹ️ Migration:', err.message); });
        db.run("ALTER TABLE users ADD COLUMN pending_qr_amount REAL DEFAULT NULL", (err) => { if (err && !err.message.includes('duplicate column')) console.log('ℹ️ Migration:', err.message); });
        db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'", (err) => { if (err && !err.message.includes('duplicate column')) console.log('ℹ️ Migration:', err.message); });
        db.run("ALTER TABLE users ADD COLUMN token_expires DATETIME", (err) => { if (err && !err.message.includes('duplicate column')) console.log('ℹ️ Migration:', err.message); });
        db.run("ALTER TABLE users ADD COLUMN refresh_token TEXT", (err) => { if (err && !err.message.includes('duplicate column')) console.log('ℹ️ Migration:', err.message); });
        db.run("ALTER TABLE users ADD COLUMN google_id TEXT", (err) => { if (err && !err.message.includes('duplicate column')) console.log('ℹ️ Migration:', err.message); });
        db.run("ALTER TABLE users ADD COLUMN google_picture TEXT", (err) => { if (err && !err.message.includes('duplicate column')) console.log('ℹ️ Migration:', err.message); });

        // ─── Indexes ─────────────────────────────────────────────
        db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id)", (err) => { if (err) console.log('ℹ️ Migration:', err.message); });
        // ─── Additional Indexes ───────────────────────────────
        db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_token ON users(token)", (err) => { if (err) console.log('ℹ️ Index:', err.message); });
        db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_refresh_token ON users(refresh_token)", (err) => { if (err) console.log('ℹ️ Index:', err.message); });
        db.run("CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(machine_id, status)", (err) => { if (err) console.log('ℹ️ Index:', err.message); });
        db.run("CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, status)", (err) => { if (err) console.log('ℹ️ Index:', err.message); });
        db.run("CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id, created_at)", (err) => { if (err) console.log('ℹ️ Index:', err.message); });
        db.run("CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(action_type, created_at)", (err) => { if (err) console.log('ℹ️ Index:', err.message); });
        db.run("CREATE INDEX IF NOT EXISTS idx_users_qr_ref ON users(pending_qr_ref)", (err) => { if (err) console.log('ℹ️ Index:', err.message); });
        db.run("CREATE INDEX IF NOT EXISTS idx_sensor_logs_machine ON sensor_logs(machine_id, created_at)", (err) => { if (err) console.log('ℹ️ Index:', err.message); });

        // ─── Admins Table (แยกจาก Users) ─────────────────
        db.run(`CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            password TEXT NOT NULL,
            is_primary INTEGER DEFAULT 0,
            token TEXT,
            refresh_token TEXT,
            token_expires DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, () => {
            // Seed default primary admin (password from env or random)
            db.get("SELECT id FROM admins WHERE username = 'Admin'", (err, row) => {
                if (!row) {
                    const defaultPw = process.env.ADMIN_DEFAULT_PASSWORD || crypto.randomBytes(16).toString('hex');
                    const hashedPw = bcrypt.hashSync(defaultPw, 10);
                    db.run(
                        "INSERT INTO admins (username, name, password, is_primary) VALUES (?, ?, ?, 1)",
                        ['Admin', 'Admin', hashedPw],
                        (err) => {
                            if (err) console.log('ℹ️ Admin seed:', err.message);
                            else {
                                console.log('✅ [DB] สร้างบัญชี Admin หลักเรียบร้อย (User: Admin)');
                                if (!process.env.ADMIN_DEFAULT_PASSWORD) {
                                    console.log(`⚠️ [SECURITY] Generated random admin password: ${defaultPw}`);
                                    console.log(`⚠️ [SECURITY] กรุณาเปลี่ยนรหัสผ่านทันที หรือตั้ง ADMIN_DEFAULT_PASSWORD ใน .env`);
                                }
                            }
                        }
                    );
                }
            });
        });
    });
});

// ─── ยูทิลิตี้ ────────────────────────────────────────────────
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateToken() {
    return crypto.randomBytes(48).toString('hex');
}

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
    }
});

async function sendEmailOTP(email, otp) {
    const mailOptions = {
        from: `"Green Energy Car Wash" <${process.env.GMAIL_USER}>`,
        to: email,
        subject: 'Your Login OTP for Green Energy Car Wash',
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
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/.test(password);
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

        // ตรวจใน admins ก่อน แล้วค่อย users
        db.get("SELECT *, 'admin' AS role FROM admins WHERE token = ?", [token], (err, admin) => {
            if (admin) {
                if (admin.token_expires && new Date(admin.token_expires) < new Date()) {
                    return res.status(401).json({ message: '❌ Token หมดอายุแล้ว กรุณา login ใหม่' });
                }
                req.user = admin;
                return next();
            }

            db.get("SELECT * FROM users WHERE token = ?", [token], (err2, user) => {
                if (err2 || !user) return res.status(401).json({ message: '❌ Token ไม่ถูกต้อง' });
                if (user.status !== 'active') return res.status(403).json({ message: '❌ บัญชีนี้ถูกระงับ' });
                if (user.token_expires && new Date(user.token_expires) < new Date()) {
                    return res.status(401).json({ message: '❌ Token หมดอายุแล้ว กรุณา login ใหม่' });
                }
                req.user = user;
                next();
            });
        });
    } catch (e) {
        res.status(401).json({ message: '❌ Authentication error' });
    }
}

function adminMiddleware(req, res, next) {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ message: '❌ ไม่มีสิทธิเข้าถึง (ต้องเป็น admin)' });
    }
    next();
}

function espApiKeyMiddleware(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    const expectedKey = process.env.ESP_API_KEY;
    if (!expectedKey) {
        console.warn('⚠️ ESP_API_KEY not configured - allowing request');
        return next();
    }
    if (!apiKey || apiKey !== expectedKey) {
        return res.status(401).json({ message: '❌ Invalid API key' });
    }
    next();
}

app.use((err, req, res, next) => {
    console.error('❌ Global Error:', err.message);
    res.status(err.status || 500).json({
        message: process.env.NODE_ENV === 'production'
            ? '❌ เกิดข้อผิดพลาดในระบบ'
            : `❌ ${err.message}`
    });
});

// ─── AUTH APIs ────────────────────────────────────────────────

// Admin login with username/password (ใช้ตาราง admins แยก)
app.post('/auth/admin/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: '❌ กรุณาระบุ Username และ Password' });

    db.get("SELECT * FROM admins WHERE username = ?", [username], (err, admin) => {
        if (err || !admin) return res.status(401).json({ message: '❌ Username หรือ Password ไม่ถูกต้อง' });

        if (!bcrypt.compareSync(password, admin.password)) {
            return res.status(401).json({ message: '❌ Username หรือ Password ไม่ถูกต้อง' });
        }

        const token = generateToken();
        const refreshToken = generateToken();
        const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

        db.run("UPDATE admins SET token = ?, refresh_token = ?, token_expires = ? WHERE id = ?",
            [token, refreshToken, tokenExpires.toISOString(), admin.id], (err2) => {
            if (err2) return res.status(500).json({ message: '❌ เข้าสู่ระบบไม่สำเร็จ' });
            console.log(`🔐 [Admin Login] ${username} เข้าสู่ระบบสำเร็จ`);
            res.json({
                message: `✅ เข้าสู่ระบบสำเร็จ! สวัสดี ${admin.name || username}`,
                token,
                refreshToken,
                user: { id: admin.id, name: admin.name, username: admin.username, role: 'admin' }
            });
        });
    });
});

app.get('/auth/google/callback', async (req, res) => {
    const { code, state } = req.query;
    
    if (!code) {
        return res.status(400).json({ message: '❌ Authorization code missing' });
    }

    if (!googleClient) {
        return res.status(500).json({ message: '❌ Google OAuth not configured' });
    }

    try {
        const { tokens } = await googleClient.getToken(code);
        
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

        db.get("SELECT id, name, email, google_picture, balance FROM users WHERE google_id = ?", [googleId], (err, user) => {
            if (err) {
                console.error('❌ [Google Callback] Database error:', err.message);
                return res.redirect(`/auth-error?error=database_error`);
            }

            const token = generateToken();
            const refreshToken = generateToken();
            const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

            if (user) {
                db.run(
                    "UPDATE users SET token = ?, refresh_token = ?, token_expires = ? WHERE id = ?",
                    [token, refreshToken, tokenExpires.toISOString(), user.id],
                    (err2) => {
                        if (err2) {
                            console.error(err2);
                            return res.redirect(`/auth-error?error=login_failed`);
                        }

                        createSessionForBay(user.id, machineId);
                        
                        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
                        const redirectUrl = `${frontendUrl}/auth-success?token=${encodeURIComponent(token)}&refreshToken=${encodeURIComponent(refreshToken)}&name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}`;
                        console.log(`✅ [Google OAuth] User ${user.id} logged in via callback`);
                        res.redirect(redirectUrl);
                    }
                );
            } else {
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

app.post('/auth/google', async (req, res) => {
    if (!googleClient) {
        return res.status(500).json({ message: '❌ Google OAuth not configured' });
    }
    
    const { idToken, machine_id } = req.body;
    if (!idToken) return res.status(400).json({ message: '❌ ระบุ idToken' });

    try {
        const ticket = await googleClient.verifyIdToken({
            idToken: idToken,
            audience: process.env.GOOGLE_CLIENT_ID
        });

        const payload = ticket.getPayload();
        const googleId = payload.sub;
        const email = payload.email;
        const name = payload.name;
        const picture = payload.picture;

        db.get("SELECT id, name, email, google_picture, balance FROM users WHERE google_id = ?", [googleId], (err, user) => {
            if (err) {
                console.error('❌ [Google Auth] Database error:', err.message);
                return res.status(500).json({ message: '❌ Database error' });
            }

            const token = generateToken();
            const refreshToken = generateToken();
            const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

            if (user) {
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

async function handleOTPRequest(identifier, isRegister, res) {
    if (!identifier) return res.status(400).json({ message: '❌ กรุณาระบุเบอร์โทรหรืออีเมล' });

    const isPhone = validatePhone(identifier);
    const isEmail = validateEmail(identifier);

    if (!isPhone && !isEmail) {
        return res.status(400).json({ message: '❌ รูปแบบเบอร์โทรหรืออีเมลไม่ถูกต้อง' });
    }

    const type = isPhone ? 'phone' : 'email';
    const queryCol = isPhone ? 'phone' : 'email';
    if (!['phone', 'email'].includes(queryCol)) return res.status(400).json({ message: '❌ Invalid query type' });

    db.get(`SELECT id, status, otp_code, otp_expires FROM users WHERE ${queryCol} = ?`, [identifier], async (err, user) => {
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
                
                if (process.env.NODE_ENV === 'production') {
                    return res.status(503).json({ message: '❌ ระบบ SMS ขัดข้อง กรุณาลองใหม่ภายหลัง' });
                }
                console.warn('⚠️ [Mock OTP] เปิดใช้งาน OTP จำลองเนื่องจากโควต้า SMS หมด');
                saveCode = generateOTP();
                console.log(`🔑 [Mock] OTP สำหรับ dev environment`);
                
                const expires = new Date(Date.now() + 5 * 60000);
                const mockCb = (err) => { if (err) console.error('❌ [DB] Mock OTP save failed:', err.message); };
                if (!user) {
                    db.run(`INSERT INTO users (${queryCol}, otp_code, otp_expires, otp_type, status) VALUES (?, ?, ?, ?, 'pending')`, [identifier, saveCode, expires.toISOString(), type], mockCb);
                } else {
                    db.run(`UPDATE users SET otp_code = ?, otp_expires = ?, otp_type = ? WHERE id = ?`, [saveCode, expires.toISOString(), type, user.id], mockCb);
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

        const otpCb = (err) => {
            if (err) {
                console.error('❌ [DB] OTP save failed:', err.message);
                return res.status(500).json({ message: '❌ เกิดข้อผิดพลาดในการบันทึก OTP' });
            }
            res.json({ message: `✅ ระบบได้ส่ง OTP ไปที่ ${identifier} แล้ว` });
        };

        if (!user) {
            db.run(
                `INSERT INTO users (${queryCol}, otp_code, otp_expires, otp_type, status) VALUES (?, ?, ?, ?, 'pending')`,
                [identifier, saveCode, expires.toISOString(), type],
                otpCb
            );
        } else {
            db.run(
                `UPDATE users SET otp_code = ?, otp_expires = ?, otp_type = ? WHERE id = ?`,
                [saveCode, expires.toISOString(), type, user.id],
                otpCb
            );
        }
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

        if (token.length === 6 && /^\d+$/.test(token)) {
            if (token !== otp) throw new Error('รหัส OTP จำลองไม่ถูกต้อง');
            const now = new Date();
            const expires = new Date(user.otp_expires);
            if (now > expires) throw new Error('รหัส OTP จำลองหมดอายุแล้ว');
            return;
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

    const logErr = (ctx) => (err) => { if (err) console.error(`❌ [Session] ${ctx}:`, err.message); };

    db.all("SELECT machine_id FROM sessions WHERE user_id=? AND status='active'", [userId], (err, rows) => {
        if (err) { console.error('❌ [Session] Query error:', err.message); }
        if (!err && rows && rows.length > 0) {
            rows.forEach(r => {
                db.run("UPDATE machines SET status='idle' WHERE id=?", [r.machine_id], logErr('reset machine'));
            });
            db.run("UPDATE sessions SET status='ended' WHERE user_id=? AND status='active'", [userId], logErr('end user sessions'));
        }

        db.run("UPDATE sessions SET status='ended' WHERE machine_id=? AND status='active'", [machineId], (endErr) => {
            if (endErr) console.error('❌ [Session] End machine session:', endErr.message);
            db.run("UPDATE machines SET status='busy' WHERE id=?", [machineId], logErr('set machine busy'));
            db.run("INSERT INTO sessions (user_id, machine_id, reserved_amount, status) VALUES (?,?,0,'active')", [userId, machineId], logErr('insert session'));
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
            return res.status(400).json({ message: '❌ รหัสผ่านต้องมี 8 ตัวอักษรขึ้นไป และมี พิมพ์เล็ก พิมพ์ใหญ่ ตัวเลขผสมกัน' });
        }
    }

    db.get(`SELECT id, balance, otp_code, otp_expires FROM users WHERE ${queryCol} = ?`, [identifier], async (err, user) => {
        if (err || !user) return res.status(404).json({ message: '❌ ไม่พบบัญชีนี้ กรุณากดขอ OTP ใหม่' });

        try {
            await verifyOTP(identifier, otp, isPhone, user);
        } catch (e) {
            return res.status(400).json({ message: `❌ ${e.message}` });
        }

        const token = generateToken();
        const refreshToken = generateToken();
        const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
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

    db.get("SELECT id, name, email, password, balance FROM users WHERE email = ? AND status = 'active'", [identifier], (err, user) => {
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

    db.get(`SELECT id, name, phone, email, balance, status, otp_code, otp_expires FROM users WHERE ${queryCol} = ?`, [identifier], async (err, user) => {
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

app.post('/auth/refresh', (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ message: '❌ ระบุ refreshToken' });

    db.get("SELECT id FROM users WHERE refresh_token = ?", [refreshToken], (err, user) => {
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
    if (req.user.role === 'admin') {
        db.run("UPDATE admins SET token=NULL, refresh_token=NULL WHERE id=?", [req.user.id],
            (e) => { if (e) console.error('❌ [Logout] Admin token clear error:', e.message); });
        console.log(`🚪 Admin ${req.user.username || req.user.id} logout`);
        return res.json({ message: '✅ ออกจากระบบเรียบร้อย' });
    }
    const userId = req.user.id;
    db.all("SELECT machine_id FROM sessions WHERE user_id=? AND status='active'", [userId], (err, sessions) => {
        if (err) {
            console.error('❌ [Logout] Session query error:', err.message);
        }
        (sessions || []).forEach(s => {
            db.run("UPDATE machines SET status='idle' WHERE id=?", [s.machine_id], (e) => { if (e) console.error('❌ [Logout] Machine reset error:', e.message); });
        });
        db.run("UPDATE sessions SET status='ended' WHERE user_id=? AND status='active'", [userId], (e) => { if (e) console.error('❌ [Logout] Session end error:', e.message); });
        db.run("UPDATE users SET token=NULL, refresh_token=NULL WHERE id=?", [userId], (e) => { if (e) console.error('❌ [Logout] Token clear error:', e.message); });
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
            [req.user.id, amount],
            (e) => { if (e) console.error('❌ [DB] Topup transaction log failed:', e.message); }
        );

        res.json({ message: `✅ เติมเงิน ฿${amount} สำเร็จ!`, balance: newBalance });
    });
});

app.get('/wallet/history', authMiddleware, (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    db.get("SELECT COUNT(*) as total FROM transactions WHERE user_id = ?", [req.user.id], (err, countRow) => {
        if (err) return res.status(500).json({ message: '❌ เกิดข้อผิดพลาด' });

        db.all(
            "SELECT id, action_type, amount, machine_id, created_at FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
            [req.user.id, limit, offset],
            (err2, rows) => {
                if (err2) return res.status(500).json({ message: '❌ เกิดข้อผิดพลาด' });
                res.json({
                    message: '✅ ประวัติการเงิน',
                    history: rows,
                    pagination: { page, limit, total: countRow.total, totalPages: Math.ceil(countRow.total / limit) }
                });
            }
        );
    });
});

// ─── MACHINE APIs ─────────────────────────────────────────────
app.get('/machines', (req, res) => {
    const sql = `
        SELECT 
            m.id, m.name, m.status,
            m.sensor_water_level, m.sensor_motion, m.sensor_fault, m.sensor_coin, m.sensor_updated_at,
            s.id AS session_id, s.start_time, s.reserved_amount,
            u.name AS user_name, u.phone AS user_phone, u.email AS user_email, u.balance AS user_balance
        FROM machines m
        LEFT JOIN sessions s ON s.machine_id = m.id AND s.status = 'active'
            AND s.id = (SELECT MAX(id) FROM sessions WHERE machine_id = m.id AND status = 'active')
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

    const reserveInt = parseInt(reserve_amount);

    // Use serialized transaction to prevent race conditions
    db.serialize(() => {
        db.run("BEGIN TRANSACTION", (beginErr) => {
            if (beginErr) return res.status(500).json({ message: '❌ เกิดข้อผิดพลาดในระบบ' });

            // Re-check balance inside transaction (fresh read)
            db.get("SELECT balance FROM users WHERE id = ?", [req.user.id], (err, freshUser) => {
                if (err || !freshUser) {
                    db.run("ROLLBACK");
                    return res.status(500).json({ message: '❌ ไม่พบผู้ใช้' });
                }
                if (freshUser.balance < reserveInt) {
                    db.run("ROLLBACK");
                    return res.status(400).json({ message: `❌ ยอดเงินไม่เพียงพอ ยอดเงินคงเหลือ ฿${freshUser.balance}` });
                }

                db.get("SELECT * FROM machines WHERE id = ?", [machine_id], (err2, machine) => {
                    if (!machine) {
                        db.run("ROLLBACK");
                        return res.status(404).json({ message: '❌ ไม่พบตู้นี้' });
                    }
                    if (machine.status === 'busy') {
                        db.run("ROLLBACK");
                        return res.status(409).json({ message: '❌ ตู้นี้กำลังถูกใช้งานอยู่' });
                    }

                    const newBalance = freshUser.balance - reserveInt;

                    // Create session first, then deduct balance
                    db.run(
                        "INSERT INTO sessions (user_id, machine_id, reserved_amount) VALUES (?, ?, ?)",
                        [req.user.id, machine_id, reserveInt],
                        function (err3) {
                            if (err3) {
                                db.run("ROLLBACK");
                                return res.status(500).json({ message: '❌ ไม่สามารถสร้าง session ได้' });
                            }
                            const session_id = this.lastID;

                            db.run("UPDATE users SET balance = ? WHERE id = ?", [newBalance, req.user.id], (err4) => {
                                if (err4) {
                                    db.run("ROLLBACK");
                                    return res.status(500).json({ message: '❌ ไม่สามารถหักเงินได้' });
                                }

                                db.run("UPDATE machines SET status = 'busy', pending_command = ? WHERE id = ?", [command, machine_id], (err5) => {
                                    if (err5) {
                                        db.run("ROLLBACK");
                                        return res.status(500).json({ message: '❌ ไม่สามารถอัปเดตสถานะตู้ได้' });
                                    }

                                    db.run(
                                        "INSERT INTO transactions (user_id, action_type, amount, machine_id) VALUES (?, 'reserve', ?, ?)",
                                        [req.user.id, reserveInt, machine_id],
                                        (err6) => {
                                            if (err6) {
                                                db.run("ROLLBACK");
                                                return res.status(500).json({ message: '❌ ไม่สามารถบันทึกรายการได้' });
                                            }

                                            db.run("COMMIT", (commitErr) => {
                                                if (commitErr) {
                                                    db.run("ROLLBACK");
                                                    return res.status(500).json({ message: '❌ เกิดข้อผิดพลาดในการบันทึก' });
                                                }

                                                pushCommandToFirebase(machine_id, command);
                                                console.log(`📤 บันทึกคำสั่ง [${command}] → Bay ${machine_id} (Firebase & Local)`);

                                                res.json({
                                                    message: `✅ เริ่มบริการสำเร็จ (${command})`,
                                                    session_id,
                                                    balance: newBalance,
                                                    reserved: reserveInt
                                                });
                                            });
                                        }
                                    );
                                });
                            });
                        }
                    );
                });
            });
        });
    });
});

app.post('/service/stop', authMiddleware, (req, res) => {
    const { session_id, actual_amount } = req.body;
    if (!session_id || !validateAmount(actual_amount)) {
        return res.status(400).json({ message: '❌ กรุณาระบุ session_id และ actual_amount ให้ถูกต้อง' });
    }

    db.get("SELECT id, machine_id, reserved_amount FROM sessions WHERE id = ? AND user_id = ? AND status = 'active'",
        [session_id, req.user.id],
        (err, session) => {
            if (err || !session) return res.status(404).json({ message: '❌ ไม่พบ session ที่ใช้งานอยู่' });

            const refund = session.reserved_amount - actual_amount;
            if (refund < 0) return res.status(400).json({ message: '❌ ยอดที่ใช้จริงเกินกว่าที่จองไว้' });

            const newBalance = req.user.balance + refund;

            db.run("UPDATE sessions SET status = 'finished' WHERE id = ?", [session_id], (err) => {
                if (err) return res.status(500).json({ message: '❌ ไม่สามารถปิด session ได้' });

                const logErr = (ctx) => (e) => { if (e) console.error(`❌ [Service Stop] ${ctx}:`, e.message); };
                db.run("UPDATE users SET balance = ? WHERE id = ?", [newBalance, req.user.id], logErr('balance update'));
                db.run("UPDATE machines SET status = 'idle' WHERE id = ?", [session.machine_id], logErr('machine reset'));
                db.run(
                    "INSERT INTO transactions (user_id, action_type, amount, machine_id) VALUES (?, 'usage', ?, ?)",
                    [req.user.id, actual_amount, session.machine_id],
                    logErr('usage transaction')
                );
                if (refund > 0) {
                    db.run(
                        "INSERT INTO transactions (user_id, action_type, amount, machine_id) VALUES (?, 'refund', ?, ?)",
                        [req.user.id, refund, session.machine_id],
                        logErr('refund transaction')
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

app.post('/admin/reset-bay', authMiddleware, adminMiddleware, (req, res) => {
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

app.get('/admin/users', authMiddleware, adminMiddleware, (req, res) => {
    db.all("SELECT id, name, phone, email, balance, status, role, created_at FROM users WHERE status != 'pending' ORDER BY id DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ message: '❌ เกิดข้อผิดพลาด' });
        res.json({ message: '✅ รายชื่อสมาชิก', users: rows });
    });
});

app.post('/admin/topup', authMiddleware, adminMiddleware, (req, res) => {
    const { user_id, amount } = req.body;
    if (!user_id || !validateAmount(amount)) {
        return res.status(400).json({ message: '❌ ระบุ user_id และ amount ให้ถูกต้อง' });
    }
    db.get("SELECT id, name, phone, email, balance FROM users WHERE id = ?", [user_id], (err, user) => {
        if (err || !user) return res.status(404).json({ message: '❌ ไม่พบผู้ใช้' });
        const newBalance = user.balance + parseInt(amount);
        db.run("UPDATE users SET balance = ? WHERE id = ?", [newBalance, user_id], (err2) => {
            if (err2) return res.status(500).json({ message: '❌ เติมเงินไม่สำเร็จ' });
            db.run("INSERT INTO transactions (user_id, action_type, amount) VALUES (?, 'topup', ?)", [user_id, amount],
                (e) => { if (e) console.error('❌ [DB] Admin topup tx log failed:', e.message); });
            res.json({ message: `✅ เติมเงิน ฿${amount} ให้ ${user.name || user.phone || user.email} สำเร็จ!`, balance: newBalance });
        });
    });
});

app.post('/admin/deduct', authMiddleware, adminMiddleware, (req, res) => {
    const { user_id, amount } = req.body;
    if (!user_id || !validateAmount(amount)) {
        return res.status(400).json({ message: '❌ ระบุ user_id และ amount ให้ถูกต้อง' });
    }
    db.get("SELECT id, name, phone, email, balance FROM users WHERE id = ?", [user_id], (err, user) => {
        if (err || !user) return res.status(404).json({ message: '❌ ไม่พบผู้ใช้' });
        if (user.balance < amount) {
            return res.status(400).json({ message: `❌ ยอดเงินไม่พอ (มีอยู่ ฿${user.balance})` });
        }
        const newBalance = user.balance - parseInt(amount);
        db.run("UPDATE users SET balance = ? WHERE id = ?", [newBalance, user_id], (err2) => {
            if (err2) return res.status(500).json({ message: '❌ ลดเงินไม่สำเร็จ' });
            db.run("INSERT INTO transactions (user_id, action_type, amount) VALUES (?, 'deduct', ?)", [user_id, amount],
                (e) => { if (e) console.error('❌ [DB] Admin deduct tx log failed:', e.message); });
            res.json({ message: `✅ ลดเงิน ฿${amount} จาก ${user.name || user.phone || user.email} สำเร็จ!`, balance: newBalance });
        });
    });
});

app.post('/admin/command', authMiddleware, adminMiddleware, (req, res) => {
    const { machine_id, command } = req.body;
    const validCmds = ['WATER_ON', 'FOAM_ON', 'AIR_ON', 'AIR_DRY', 'AIR_FILL', 'VACUUM', 'WAX_ON', 'TYRE_ON', 'HAND_WASH', 'STOP'];
    if (!machine_id || !command) return res.status(400).json({ message: '❌ ระบุ machine_id และ command' });
    if (!validCmds.includes(command)) return res.status(400).json({ message: `❌ Command ไม่ถูกต้อง (${validCmds.join(', ')})` });

    const newStatus = command === 'STOP' ? 'idle' : 'busy';
    db.run("UPDATE machines SET pending_command = ?, status = ? WHERE id = ?", [command, newStatus, machine_id], (err) => {
        if (err) return res.status(500).json({ message: '❌ ส่งคำสั่งไม่สำเร็จ' });
        pushCommandToFirebase(machine_id, command);
        console.log(`🕹️ [Dashboard] บันทึกคำสั่ง [${command}] → Bay ${machine_id}`);
        res.json({ message: `✅ ส่งคำสั่ง ${command} ไปที่ Bay ${machine_id} เรียบร้อย!` });
    });
});

app.get('/admin/finance', authMiddleware, adminMiddleware, (req, res) => {
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

    const runQuery = (sql) => new Promise((resolve) => {
        db.all(sql, [], (err, rows) => resolve(err ? [] : rows));
    });

    Promise.all(Object.values(queries).map(runQuery)).then(([daily, weekly, monthly, summary]) => {
        res.json({ message: 'success', data: { daily, weekly, monthly, summary } });
    });
});

app.delete('/admin/users/:id', authMiddleware, adminMiddleware, (req, res) => {
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

app.put('/admin/users/:id/password', authMiddleware, adminMiddleware, async (req, res) => {
    const { id } = req.params;
    const { password } = req.body;
    if (!password || !validatePassword(password)) {
        return res.status(400).json({ message: '❌ รหัสผ่านต้องมี 8 ตัวอักษรขึ้นไป (พิมพ์เล็ก พิมพ์ใหญ่ ตัวเลข)' });
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

app.post('/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
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

// ─── ADMIN MANAGEMENT APIs ────────────────────────────────────

app.get('/admin/admins', authMiddleware, adminMiddleware, (req, res) => {
    db.all("SELECT id, username, name, is_primary, created_at FROM admins ORDER BY is_primary DESC, id", [], (err, rows) => {
        if (err) return res.status(500).json({ message: '❌ เกิดข้อผิดพลาด' });
        res.json({ message: '✅ รายชื่อแอดมิน', admins: rows });
    });
});

app.post('/admin/admins', authMiddleware, adminMiddleware, async (req, res) => {
    const { username, name, password } = req.body;
    if (!username || !name || !password) {
        return res.status(400).json({ message: '❌ กรุณาระบุ Username, ชื่อ, และ Password' });
    }
    if (username.length < 3) {
        return res.status(400).json({ message: '❌ Username ต้องมีอย่างน้อย 3 ตัวอักษร' });
    }
    if (password.length < 8) {
        return res.status(400).json({ message: '❌ Password ต้องมีอย่างน้อย 8 ตัวอักษร' });
    }
    try {
        const hashed = await bcrypt.hash(password, 10);
        db.run(
            "INSERT INTO admins (username, name, password, is_primary) VALUES (?, ?, ?, 0)",
            [username, name, hashed],
            function (err) {
                if (err) {
                    if (err.message.includes('UNIQUE')) return res.status(400).json({ message: '❌ Username นี้มีอยู่แล้ว' });
                    return res.status(500).json({ message: '❌ เพิ่มแอดมินไม่สำเร็จ' });
                }
                console.log(`✅ [Admin] เพิ่มแอดมิน ${username} (ID: ${this.lastID})`);
                res.json({ message: `✅ เพิ่มแอดมิน ${name} สำเร็จ`, id: this.lastID });
            }
        );
    } catch (e) {
        res.status(500).json({ message: '❌ เกิดข้อผิดพลาด' });
    }
});

app.delete('/admin/admins/:id', authMiddleware, adminMiddleware, (req, res) => {
    const { id } = req.params;

    db.get("SELECT * FROM admins WHERE id = ?", [id], (err, admin) => {
        if (err || !admin) return res.status(404).json({ message: '❌ ไม่พบแอดมิน' });
        if (admin.is_primary === 1) {
            return res.status(403).json({ message: '❌ ไม่สามารถลบ Admin หลักได้' });
        }
        if (parseInt(id) === req.user.id) {
            return res.status(400).json({ message: '❌ ไม่สามารถลบตัวเองได้' });
        }
        db.run("DELETE FROM admins WHERE id = ?", [id], function (err2) {
            if (err2) return res.status(500).json({ message: '❌ ลบไม่สำเร็จ' });
            console.log(`🗑️ [Admin] ลบแอดมิน ${admin.username} (ID: ${id})`);
            res.json({ message: `✅ ลบแอดมิน ${admin.name} สำเร็จ` });
        });
    });
});

app.put('/admin/admins/:id/password', authMiddleware, adminMiddleware, async (req, res) => {
    const { id } = req.params;
    const { password } = req.body;
    if (!password || password.length < 8) {
        return res.status(400).json({ message: '❌ Password ต้องมีอย่างน้อย 8 ตัวอักษร' });
    }
    try {
        const hashed = await bcrypt.hash(password, 10);
        db.run("UPDATE admins SET password = ? WHERE id = ?", [hashed, id], function (err) {
            if (err) return res.status(500).json({ message: '❌ เปลี่ยนรหัสผ่านไม่สำเร็จ' });
            if (this.changes === 0) return res.status(404).json({ message: '❌ ไม่พบแอดมิน' });
            res.json({ message: '✅ เปลี่ยนรหัสผ่านสำเร็จ' });
        });
    } catch (e) {
        res.status(500).json({ message: '❌ เกิดข้อผิดพลาด' });
    }
});

app.get('/user/:identifier', authMiddleware, (req, res) => {
    const identifier = req.params.identifier;
    const isPhone = validatePhone(identifier);
    const isEmail = validateEmail(identifier);
    if (!isPhone && !isEmail) {
        return res.status(400).json({ message: '❌ รูปแบบไม่ถูกต้อง' });
    }
    const queryCol = isPhone ? 'phone' : 'email';
    db.get(`SELECT id, name, balance, ${queryCol} FROM users WHERE ${queryCol} = ?`, [identifier], (err, user) => {
        if (user) res.json({ message: 'เจอข้อมูลลูกค้า', [queryCol]: identifier, balance: user.balance });
        else res.json({ message: 'ไม่พบข้อมูลลูกค้านี้' });
    });
});

// ─── ESP8266 Additional APIs ──────────────────────────────────

app.get('/api/bay/:id/session', espApiKeyMiddleware, (req, res) => {
    const machine_id = parseInt(req.params.id);
    db.get(`
        SELECT 
            s.id, s.user_id, s.machine_id, s.status, s.reserved_amount,
            u.name, u.balance, u.phone, u.email
        FROM sessions s
        LEFT JOIN users u ON s.user_id = u.id
        WHERE s.machine_id = ? AND s.status = 'active'
        ORDER BY s.id DESC LIMIT 1
    `, [machine_id], (err, session) => {
        if (err || !session) {
            return res.json({
                session: null,
                message: 'ไม่มี session ที่กำลังใช้งาน'
            });
        }
        res.json({
            session: {
                id: session.id,
                user_id: session.user_id,
                user_name: session.name,
                user_balance: session.balance,
                user_phone: session.phone,
                user_email: session.email,
                reserved_amount: session.reserved_amount,
                status: session.status
            },
            message: '✅ Session found'
        });
    });
});

app.get('/api/pricing', (req, res) => {
    res.json({
        pricing: {
            WATER_ON: 5,
            FOAM_ON: 8,
            AIR_ON: 3,
            WAX_ON: 15,
            TYRE_ON: 10
        },
        minimum_balance: 10,
        currency: 'THB',
        message: '✅ Pricing information'
    });
});

// ─── ESP8266 HTTP Polling API ──────────────────────────────────

app.get('/api/bay/:id/command', espApiKeyMiddleware, (req, res) => {
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

app.post('/api/bay/:id/status', espApiKeyMiddleware, (req, res) => {
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

// ─── ESP8266 Command Acknowledge ─────────────────────────────
app.post('/api/bay/:id/command/ack', espApiKeyMiddleware, (req, res) => {
    const machine_id = parseInt(req.params.id);
    const { command, status: cmdStatus } = req.body;

    if (!command) return res.status(400).json({ message: '❌ ระบุ command' });

    const ackStatus = cmdStatus || 'ok';
    console.log(`✅ [ESP ${machine_id}] ACK: ${command} → ${ackStatus}`);

    if (command === 'STOP' || command === 'EMERGENCY_STOP') {
        db.run("UPDATE machines SET status = 'idle', pending_command = NULL WHERE id = ?", [machine_id]);
    }

    res.json({ message: '✅ ACK received', command, status: ackStatus });
});

// ─── ESP8266 Relay Status Report ─────────────────────────────
app.post('/api/bay/:id/relay/status', espApiKeyMiddleware, (req, res) => {
    const machine_id = parseInt(req.params.id);
    const { relays, activeCommand } = req.body;

    // relays = { WATER: true, FOAM: false, AIR_DRY: false, ... }
    console.log(`📊 [ESP ${machine_id}] Relay Status:`, JSON.stringify(relays || {}));

    const anyActive = relays && Object.values(relays).some(v => v === true);
    const newStatus = anyActive ? 'busy' : 'idle';

    db.run("UPDATE machines SET status = ? WHERE id = ?", [newStatus, machine_id], function (err) {
        if (err || this.changes === 0) return res.status(404).json({ message: '❌ ไม่พบตู้นี้' });
        res.json({ message: '✅ Relay status updated', status: newStatus });
    });
});

// ─── ESP8266 Heartbeat ───────────────────────────────────────
app.post('/api/bay/:id/heartbeat', espApiKeyMiddleware, (req, res) => {
    const machine_id = parseInt(req.params.id);
    const { uptime, freeHeap, wifiRSSI } = req.body;

    console.log(`💓 [ESP ${machine_id}] Heartbeat — uptime:${uptime}s heap:${freeHeap} wifi:${wifiRSSI}dBm`);

    db.get("SELECT pending_command FROM machines WHERE id = ?", [machine_id], (err, row) => {
        if (err || !row) return res.status(404).json({ message: '❌ ไม่พบตู้นี้' });

        const cmd = row.pending_command;
        if (cmd) {
            db.run("UPDATE machines SET pending_command = NULL WHERE id = ?", [machine_id]);
            console.log(`📲 [ESP ${machine_id}] ส่งคำสั่งผ่าน heartbeat: ${cmd}`);
        }

        res.json({
            command: cmd || null,
            serverTime: new Date().toISOString()
        });
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
                'resourceOwnerID': process.env.SCB_RESOURCE_OWNER_ID || process.env.SCB_API_KEY,
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
                'resourceOwnerID': process.env.SCB_RESOURCE_OWNER_ID || process.env.SCB_API_KEY,
                'accept-language': 'EN',
                'channel': 'scbeasy'
            }
        });

        const qrImage = resp.data.data?.qrImage;
        if (!qrImage) throw new Error('SCB ไม่ส่ง QR Image กลับมา');

        db.run(
            `UPDATE users SET pending_qr_ref = ?, pending_qr_amount = ? WHERE id = ?`,
            [qrRef, amount, req.user.id],
            (e) => { if (e) console.error('❌ [SCB QR] Save pending ref failed:', e.message); }
        );

        console.log(`📲 [SCB QR] สร้าง QR สำหรับ user ${req.user.id} จำนวน ฿${amount}`);
        res.json({ qrImage, qrRef });
    } catch (err) {
        console.error('❌ [SCB QR] Error:', err.response?.data || err.message);
        res.status(500).json({ message: '❌ ไม่สามารถสร้าง QR จาก SCB ได้' });
    }
});

app.post('/webhook/scb', async (req, res) => {
    console.log('🔔 [SCB Webhook] ได้รับข้อมูล:', JSON.stringify(req.body));

    // Verify webhook signature — required in production
    const webhookSecret = process.env.SCB_WEBHOOK_SECRET;
    if (process.env.NODE_ENV === 'production' && !webhookSecret) {
        console.error('❌ [SCB Webhook] SCB_WEBHOOK_SECRET is required in production');
        return res.status(500).json({ resCode: '99', resDesc: 'Server misconfiguration' });
    }
    if (webhookSecret) {
        const signature = req.headers['x-scb-signature'] || req.headers['authorization'];
        if (!signature || signature !== webhookSecret) {
            console.warn('⚠️ [SCB Webhook] Invalid signature - rejected');
            return res.status(403).json({ resCode: '99', resDesc: 'Invalid signature' });
        }
    }

    const data = req.body;
    const qrRef = data.reference3 || data.ref3;
    const topupAmount = Math.round(parseFloat(data.amount));

    if (!qrRef || !topupAmount || topupAmount <= 0) {
        console.warn('⚠️ [SCB Webhook] ข้อมูลมาไม่ครบ');
        return res.status(200).json({ resCode: '00', resDesc: 'Invalid Format (Ignored)' });
    }

    db.get(
        `SELECT id, balance FROM users WHERE pending_qr_ref = ?`,
        [qrRef],
        (err, user) => {
            if (err || !user) {
                console.warn(`⚠️ [SCB Webhook] ไม่พบรายการสร้าง QR (Ref: ${qrRef}) ยอด ฿${topupAmount}`);
                return res.status(200).json({ resCode: '00', resDesc: 'Success (Ignored)' });
            }

            // Idempotency: pending_qr_ref is cleared after processing,
            // so duplicate calls won't find a matching user (handled above).
            // Use atomic update with WHERE pending_qr_ref still matches for extra safety.
            const newBalance = user.balance + topupAmount;

            db.run("UPDATE users SET balance = ?, pending_qr_ref = NULL, pending_qr_amount = NULL WHERE id = ? AND pending_qr_ref = ?",
                [newBalance, user.id, qrRef], function (err2) {
                    if (err2) {
                        console.error('❌ [SCB Webhook] อัปเดตเงินล้มเหลว', err2);
                        return res.status(200).json({ resCode: '00', resDesc: 'Processed' });
                    }
                    if (this.changes === 0) {
                        console.warn(`⚠️ [SCB Webhook] Duplicate or already processed (Ref: ${qrRef})`);
                        return res.status(200).json({ resCode: '00', resDesc: 'Already processed' });
                    }

                    db.run(
                        "INSERT INTO transactions (user_id, action_type, amount) VALUES (?, 'topup_scb', ?)",
                        [user.id, topupAmount],
                        (e) => { if (e) console.error('❌ [SCB Webhook] Transaction log failed:', e.message); }
                    );

                    console.log(`💸 [TopUp] User ${user.id} เติมเงิน ฿${topupAmount} (Ref: ${qrRef}) ยอดใหม่: ฿${newBalance}`);
                    res.status(200).json({ resCode: '00', resDesc: 'Success', transactionId: data.transactionId });
                }
            );
        }
    );
});

// ─── Bay QR Route (for customer scanning) ─────────────────────
app.get('/bay/:id', (req, res) => {
    const bayId = parseInt(req.params.id);
    if (!bayId || bayId < 1 || bayId > 99) return res.status(400).send('Invalid bay ID');
    res.redirect(`/bay.html?id=${bayId}`);
});

// ─── Admin: Generate Bay QR Code URLs ─────────────────────────
app.get('/admin/bay-qrcodes', authMiddleware, adminMiddleware, (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    db.all("SELECT id, name, status FROM machines ORDER BY id", [], (err, machines) => {
        if (err) return res.status(500).json({ message: '❌ เกิดข้อผิดพลาด' });
        const qrcodes = (machines || []).map(m => ({
            bay_id: m.id,
            bay_name: m.name,
            status: m.status,
            url: `${baseUrl}/bay/${m.id}`,
            qr_content: `${baseUrl}/bay/${m.id}`
        }));
        res.json({ message: '✅ QR Code URLs สำหรับแต่ละ Bay', baseUrl, bays: qrcodes });
    });
});

// ─── Health Check ──────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/auth/google/client-id', (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return res.status(500).json({ message: 'Google OAuth not configured' });
    res.json({ clientId });
});

// ─── ESP8266 Relay & Sensor Routes ─────────────────────────────
require('./routes/esp8266-relay')(app, db, pushCommandToFirebase, espApiKeyMiddleware);
require('./routes/esp8266-sensors')(app, db, espApiKeyMiddleware);

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
