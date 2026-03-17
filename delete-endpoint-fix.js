// PUBLIC: User deletion (no auth required for now)
app.delete('/admin/users/:id', (req, res) => {
    const { id } = req.params;
    
    db.run("DELETE FROM sessions WHERE user_id = ?", [id], (e1) => {
        db.run("DELETE FROM transactions WHERE user_id = ?", [id], (e2) => {
            db.run("DELETE FROM users WHERE id = ?", [id], function (err) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ message: '❌ ลบไม่สำเร็จ (มีข้อมูลผูกพัน)' });
                }
                if (this.changes === 0) return res.status(404).json({ message: '❌ ไม่พบผู้ใช้' });
                res.json({ message: `✅ ลบผู้ใช้ #${id} สำเร็จ` });
            });
        });
    });
});
