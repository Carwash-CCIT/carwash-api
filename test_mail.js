require('dotenv').config();
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
    }
});

console.log('Testing with USER:', process.env.GMAIL_USER);
transporter.sendMail({
    from: `"Test" <${process.env.GMAIL_USER}>`,
    to: process.env.GMAIL_USER,
    subject: 'Test Email',
    text: 'Test Body'
}).then(info => console.log('Success!', info.response))
    .catch(err => console.error('Error:', err));
