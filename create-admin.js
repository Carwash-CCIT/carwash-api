const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const db = new sqlite3.Database('./data/carwash.db');

const email = 'admin@carwash.com';
const password = bcrypt.hashSync('Admin@123', 10);
const name = 'Administrator';

db.run(
  'INSERT INTO users (email, password, name, balance, status, role) VALUES (?, ?, ?, 0, "active", "admin")',
  [email, password, name],
  function(err) {
    if (err) {
      console.log('Error:', err.message);
    } else {
      console.log('✅ Admin account created!');
      console.log('Email: ' + email);
      console.log('Password: Admin@123');
      console.log('User ID: ' + this.lastID);
    }
    db.close();
  }
);
