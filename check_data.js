const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('data/carwash.db');
db.all("SELECT created_at, date(created_at), date('now', '-6 days') as cutoff FROM transactions", [], (err, rows) => {
    console.log(rows);
    db.close();
});
