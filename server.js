const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const mqtt = require('mqtt'); // 👈 เพิ่มวิทยุสื่อสาร

const app = express();
const port = 3000;
app.use(express.json());

const db = new sqlite3.Database('./carwash.db');

// 📡 เชื่อมต่อสถานีวิทยุ MQTT (HiveMQ)
const mqttClient = mqtt.connect('mqtt://broker.hivemq.com');

mqttClient.on('connect', () => {
    console.log("📡 เชื่อมต่อสถานีวิทยุ MQTT สำเร็จ พร้อมส่งคำสั่ง!");
});

// API 1: ดูข้อมูลตู้ล้างรถ
app.get('/machines', (req, res) => {
    db.all("SELECT * FROM machines", [], (err, rows) => {
        res.json({ message: "success", data: rows });
    });
});

// API 2: เติมเงิน
app.post('/topup', (req, res) => {
    const { phone, amount } = req.body;
    db.get("SELECT * FROM users WHERE phone_or_line_id = ?", [phone], (err, user) => {
        if (!user) {
            db.run("INSERT INTO users (phone_or_line_id, balance) VALUES (?, ?)", [phone, amount], function (err) {
                res.json({ message: "สร้างบัญชีใหม่และเติมเงินสำเร็จ!", phone: phone, current_balance: amount });
            });
        } else {
            const newBalance = user.balance + amount;
            db.run("UPDATE users SET balance = ? WHERE phone_or_line_id = ?", [newBalance, phone], function (err) {
                res.json({ message: "เติมเงินเข้าบัญชีสำเร็จ!", phone: phone, current_balance: newBalance });
            });
        }
    });
});

// API 3: เช็คยอดเงิน
app.get('/user/:phone', (req, res) => {
    const phone = req.params.phone;
    db.get("SELECT * FROM users WHERE phone_or_line_id = ?", [phone], (err, user) => {
        if (user) res.json({ message: "เจอข้อมูลลูกค้า", phone: user.phone_or_line_id, balance: user.balance });
        else res.json({ message: "ไม่พบข้อมูลลูกค้านี้" });
    });
});

// API 4: ตัดเงินและ "สั่งยิงสัญญาณ" ไปหา ESP8266
app.post('/start_wash', (req, res) => {
    const { phone, machine_id, price } = req.body;

    db.get("SELECT * FROM users WHERE phone_or_line_id = ?", [phone], (err, user) => {
        if (!user) return res.json({ message: "ไม่พบผู้ใช้งานในระบบ" });
        if (user.balance < price) return res.json({ message: "เงินไม่พอ", current_balance: user.balance });

        const newBalance = user.balance - price;
        db.run("UPDATE users SET balance = ? WHERE id = ?", [newBalance, user.id], (err) => {
            db.run("INSERT INTO transactions (user_id, action_type, amount, machine_id) VALUES (?, 'usage', ?, ?)", [user.id, price, machine_id], (err) => {
                db.run("UPDATE machines SET status = 'busy' WHERE id = ?", [machine_id], (err) => {

                    // 📢 ยิงสัญญาณ MQTT ออกไปหาบอร์ด!
                    const topic = `chen_carwash/bay${machine_id}/command`;
                    mqttClient.publish(topic, "START");

                    console.log(`📤 แจ้งเตือน: ส่งคำสั่ง [START] ไปที่คลื่น [${topic}] แล้ว!`);

                    res.json({
                        message: "✅ ตัดเงินสำเร็จ! สั่งตู้ล้างรถเริ่มทำงาน",
                        remaining_balance: newBalance,
                        machine_id: machine_id
                    });
                });
            });
        });
    });
});

app.listen(port, () => {
    console.log(`🚀 Server ร้านล้างรถเริ่มทำงานแล้วที่ http://localhost:${port}`);
});