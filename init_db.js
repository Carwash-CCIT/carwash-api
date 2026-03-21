const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(path.join(__dirname, 'data', 'carwash.db'), (err) => {
    if (err) {
        console.error('❌ Cannot connect to database:', err.message);
        process.exit(1);
    }
});

db.serialize(() => {
    // 1. Create tables
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
        otp_code TEXT,
        otp_expires DATETIME,
        otp_type TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);;

    db.run(`CREATE TABLE IF NOT EXISTS machines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        status TEXT DEFAULT 'ready'
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

    // 2. Insert Bay machines ONLY if not already exist
    db.get("SELECT COUNT(*) as count FROM machines", (err, row) => {
        if (!err && row.count === 0) {
            db.run(
                `INSERT INTO machines (name, status) VALUES 
                ('Bay 1', 'idle'), 
                ('Bay 2', 'idle'), 
                ('Bay 3', 'idle'), 
                ('Bay 4', 'idle'), 
                ('Bay 5', 'idle'), 
                ('Bay 6', 'idle')`,
                function(err) {
                    if (!err) {
                        console.log("✅ สร้างข้อมูลตู้ล้างรถ Bay 1–6 สำเร็จ!");
                    } else {
                        console.error('❌ Error inserting machines:', err.message);
                    }
                    db.close();
                }
            );
        } else {
            console.log(`ℹ️ Bay machines already exist (${row?.count || 0} machines found)`);
            db.close();
        }
    });
});

db.on('error', (err) => {
    console.error('Database error:', err.message);
});
