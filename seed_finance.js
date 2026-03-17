const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('data/carwash.db');

db.serialize(() => {
    db.run("INSERT INTO users (name, phone, balance) VALUES ('Test User', '0812345678', 500)", function(err) {
        // ignore error
    });
    
    db.get("SELECT id FROM users LIMIT 1", (err, row) => {
        const userId = row ? row.id : 1;
        db.run(`INSERT INTO transactions (user_id, action_type, amount, created_at) VALUES (?, 'topup', 100, datetime('now'))`, [userId]);
        db.run(`INSERT INTO transactions (user_id, action_type, amount, created_at) VALUES (?, 'topup', 200, datetime('now', '-2 days'))`, [userId]);
        db.run(`INSERT INTO transactions (user_id, action_type, amount, created_at) VALUES (?, 'topup', 300, datetime('now', '-10 days'))`, [userId]);
        db.run(`INSERT INTO transactions (user_id, action_type, amount, created_at) VALUES (?, 'topup', 400, datetime('now', '-40 days'))`, [userId], () => {
            console.log('Inserted test data');
            db.close();
        });
    });
});
