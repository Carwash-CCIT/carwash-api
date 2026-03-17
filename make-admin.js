const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'data', 'carwash.db'), (err) => {
    if (err) return console.error('❌ ไม่สามารถเชื่อมต่อฐานข้อมูลได้:', err.message);
    console.log('✅ เชื่อมต่อฐานข้อมูล');

    // Get all users
    db.all("SELECT id, name, email, phone, role FROM users WHERE status = 'active'", [], (err, users) => {
        if (err) return console.error('❌ Error:', err.message);
        
        if (users.length === 0) {
            console.log('❌ ไม่พบผู้ใช้ที่ активนไป');
            db.close();
            return;
        }

        console.log('\n📋 ผู้ใช้ที่ active:');
        users.forEach(u => {
            console.log(`  [${u.id}] ${u.name || u.email || u.phone} (${u.role})`);
        });

        // Make first user admin
        const adminId = users[0].id;
        db.run("UPDATE users SET role = 'admin' WHERE id = ?", [adminId], function(err) {
            if (err) return console.error('❌ Error:', err.message);
            console.log(`\n✅ ตั้ง User #${adminId} (${users[0].name}) เป็น admin สำเร็จ`);
            console.log('   ตอนนี้ user นี้สามารถเข้าถึง /admin/* endpoints ได้แล้ว\n');
            db.close();
        });
    });
});
