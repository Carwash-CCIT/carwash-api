const sqlite3 = require('sqlite3').verbose();
const path = require('path');

require('dotenv').config();

const dbPath = path.join(__dirname, 'data', 'carwash.db');
console.log('📁 Database path:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Cannot connect to database:', err.message);
        process.exit(1);
    }
    
    console.log('✅ Database connected successfully');
    
    // Test query
    db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
        if (err) {
            console.error('❌ Query error:', err.message);
        } else {
            console.log('✅ Users in database:', row.count);
        }
        
        // Check tables
        db.all(`SELECT name FROM sqlite_master WHERE type='table'`, (err, tables) => {
            if (err) {
                console.error('❌ Cannot list tables:', err.message);
            } else {
                console.log('✅ Tables in database:', tables.map(t => t.name).join(', '));
            }
            
            db.close();
            process.exit(0);
        });
    });
});
