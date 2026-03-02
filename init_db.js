const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./carwash.db');

db.serialize(() => {
    // 1. สร้างตารางลูกค้า (Users)
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone_or_line_id TEXT UNIQUE,
        balance INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 2. สร้างตารางตู้ล้างรถ (Machines)
    db.run(`CREATE TABLE IF NOT EXISTS machines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        status TEXT DEFAULT 'ready'
    )`);

    // 3. สร้างตารางประวัติการเงิน (Transactions)
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

    // จำลองข้อมูลตู้ล้างรถ (Bay 1 และ Bay 2)
    db.run(`INSERT INTO machines (name) VALUES ('Bay 1'), ('Bay 2')`, (err) => {
        if (!err) console.log("✅ สร้างข้อมูลตู้ล้างรถ Bay 1 และ Bay 2 สำเร็จ!");
    });

    console.log("✅ สร้างไฟล์ฐานข้อมูล carwash.db พร้อม 3 ตารางหลักเสร็จเรียบร้อย!");
});

db.close();