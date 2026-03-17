const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('data/carwash.db');
db.get("SELECT m.id, s.start_time FROM machines m LEFT JOIN sessions s ON m.id = s.machine_id AND s.status = 'active' WHERE m.status = 'busy'", [], (e, r) => {
    console.log(r);
    console.log("Raw string:", r.start_time);
    console.log("Parsed date Local:", new Date(r.start_time));
    console.log("Parsed date UTC Z:", new Date(r.start_time + 'Z'));
});
