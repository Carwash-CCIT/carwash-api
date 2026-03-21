const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');

// Google OAuth client
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ─── GOOGLE OAUTH ──────────────────────────────────────────────
app.post('/auth/google', async (req, res) => {
    const { idToken, machine_id } = req.body;
    if (!idToken) return res.status(400).json({ message: '❌ ระบุ idToken' });

    try {
        // Verify Google ID Token
        const ticket = await googleClient.verifyIdToken({
            idToken: idToken,
            audience: process.env.GOOGLE_CLIENT_ID
        });

        const payload = ticket.getPayload();
        const googleId = payload.sub;
        const email = payload.email;
        const name = payload.name;
        const picture = payload.picture;

        // Check if user exists
        db.get("SELECT * FROM users WHERE google_id = ?", [googleId], (err, user) => {
            if (err) return res.status(500).json({ message: '❌ Database error' });

            if (user) {
                // User exists - login
                const token = generateToken();
                const refreshToken = generateToken();
                const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

                db.run(
                    "UPDATE users SET token = ?, refresh_token = ?, token_expires = ? WHERE id = ?",
                    [token, refreshToken, tokenExpires.toISOString(), user.id],
                    (err2) => {
                        if (err2) return res.status(500).json({ message: '❌ Login failed' });

                        createSessionForBay(user.id, machine_id);
                        res.json({
                            message: `✅ เข้าสู่ระบบสำเร็จ! สวัสดี ${name}`,
                            token,
                            refreshToken,
                            user: {
                                id: user.id,
                                name: user.name,
                                email: user.email,
                                picture: user.google_picture,
                                balance: user.balance
                            }
                        });
                    }
                );
            } else {
                // New user - auto register
                const token = generateToken();
                const refreshToken = generateToken();
                const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

                db.run(
                    `INSERT INTO users (google_id, email, name, google_picture, balance, status, token, refresh_token, token_expires) 
                     VALUES (?, ?, ?, ?, 0, 'active', ?, ?, ?)`,
                    [googleId, email, name, picture, token, refreshToken, tokenExpires.toISOString()],
                    function (err2) {
                        if (err2) {
                            console.error('Insert error:', err2);
                            return res.status(500).json({ message: '❌ Registration failed' });
                        }

                        const userId = this.lastID;
                        createSessionForBay(userId, machine_id);

                        res.json({
                            message: `✅ สมัครสมาชิกและเข้าสู่ระบบสำเร็จ! ยินดีต้อนรับ ${name}`,
                            token,
                            refreshToken,
                            user: {
                                id: userId,
                                name,
                                email,
                                picture,
                                balance: 0
                            }
                        });
                    }
                );
            }
        });
    } catch (error) {
        console.error('Google token verification error:', error);
        res.status(401).json({ message: '❌ Invalid Google token' });
    }
});

// ─── LOGOUT ─────────────────────────────────────────────────────
app.post('/auth/logout', (req, res) => {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    if (!token) return res.status(400).json({ message: '❌ No token provided' });

    db.get("SELECT id FROM users WHERE token = ?", [token], (err, user) => {
        if (err || !user) return res.status(401).json({ message: '❌ Invalid token' });

        const userId = user.id;
        db.all("SELECT machine_id FROM sessions WHERE user_id=? AND status='active'", [userId], (_, sessions) => {
            sessions?.forEach(s => {
                db.run("UPDATE machines SET status='idle' WHERE id=?", [s.machine_id]);
            });
            db.run("UPDATE sessions SET status='ended' WHERE user_id=? AND status='active'", [userId]);
            db.run("UPDATE users SET token=NULL, refresh_token=NULL WHERE id=?", [userId]);
            console.log(`🚪 User ${userId} logout`);
            res.json({ message: '✅ ออกจากระบบเรียบร้อย' });
        });
    });
});
