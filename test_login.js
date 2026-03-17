const sqlite3 = require('sqlite3');
const bcrypt = require('bcryptjs');
const axios = require('axios');

const db = new sqlite3.Database('data/carwash.db');
const password = 'Test@1234';
const email = 'test@example.com';

async function runTest() {
    const hashedPassword = bcrypt.hashSync(password, 10);

    db.serialize(() => {
        db.run(
            `INSERT OR IGNORE INTO users (name, email, password, status, role) VALUES (?, ?, ?, 'active', 'admin')`,
            ['Test Admin', email, hashedPassword],
            async function(err) {
                if (err) {
                    console.error('❌ Could not create test user:', err.message);
                    db.close();
                    return;
                }
                console.log('✅ Test user created or already exists.');

                setTimeout(async () => {
                    try {
                        const response = await axios.post('http://localhost:3000/auth/login', {
                            identifier: email,
                            password: password
                        });
                        
                        const token = response.data.token;
                        console.log('🔑 Login successful! Token:', token);

                        db.get('SELECT id, pending_qr_ref FROM users WHERE email = ?', [email], (err, row) => {
                            if(err) return console.error(err);
                            console.log('User ID:', row.id);
                            console.log('Current pending_qr_ref:', row.pending_qr_ref);
                            db.close();
                        });

                    } catch (loginErr) {
                        console.error('❌ Login failed:', loginErr.response ? loginErr.response.data : loginErr.message);
                        db.close();
                    }
                }, 2000); // Wait 2 seconds for server to be ready
            }
        );
    });
}

runTest();
