/**
 * ESP8266 Relay Control Routes
 */

module.exports = function(app, db, pushCommandToFirebase) {
    
    // ─── Turn Relay ON ──────────────────────────────────
    app.post('/api/bay/:id/relay/:type/on', (req, res) => {
        const bayId = parseInt(req.params.id);
        const relayType = req.params.type.toUpperCase();
        const command = relayType + '_ON';
        
        const validTypes = ['WATER', 'FOAM', 'AIR', 'WAX', 'TYRE'];
        if (!validTypes.includes(relayType)) {
            return res.status(400).json({ message: '❌ ประเภท Relay ไม่ถูกต้อง' });
        }
        
        db.get("SELECT * FROM machines WHERE id = ?", [bayId], (err, machine) => {
            if (err || !machine) return res.status(404).json({ message: '❌ ไม่พบตู้นี้' });
            
            db.run(
                "UPDATE machines SET pending_command = ?, status = 'busy' WHERE id = ?",
                [command, bayId],
                (err) => {
                    if (err) return res.status(500).json({ message: '❌ เกิดข้อผิดพลาด' });
                    
                    pushCommandToFirebase(bayId, command);
                    console.log(`🔌 [Bay ${bayId}] Relay ${relayType} turned ON`);
                    
                    res.json({
                        message: `✅ เปิด Relay ${relayType}`,
                        command,
                        bayId
                    });
                }
            );
        });
    });
    
    // ─── Turn Relay OFF ─────────────────────────────────
    app.post('/api/bay/:id/relay/:type/off', (req, res) => {
        const bayId = parseInt(req.params.id);
        const relayType = req.params.type.toUpperCase();
        const command = relayType + '_OFF';
        
        const validTypes = ['WATER', 'FOAM', 'AIR', 'WAX', 'TYRE'];
        if (!validTypes.includes(relayType)) {
            return res.status(400).json({ message: '❌ ประเภท Relay ไม่ถูกต้อง' });
        }
        
        db.run(
            "UPDATE machines SET pending_command = ? WHERE id = ?",
            [command, bayId],
            (err) => {
                if (err) return res.status(500).json({ message: '❌ เกิดข้อผิดพลาด' });
                
                pushCommandToFirebase(bayId, command);
                console.log(`🔌 [Bay ${bayId}] Relay ${relayType} turned OFF`);
                
                res.json({
                    message: `✅ ปิด Relay ${relayType}`,
                    command,
                    bayId
                });
            }
        );
    });
    
    // ─── Emergency Stop ─────────────────────────────────
    app.post('/api/bay/:id/relay/emergency-stop', (req, res) => {
        const bayId = parseInt(req.params.id);
        const command = 'EMERGENCY_STOP';
        
        db.run(
            "UPDATE machines SET pending_command = ?, status = 'idle' WHERE id = ?",
            [command, bayId],
            (err) => {
                if (err) return res.status(500).json({ message: '❌ เกิดข้อผิดพลาด' });
                
                pushCommandToFirebase(bayId, command);
                console.log(`🚨 [Bay ${bayId}] EMERGENCY STOP activated`);
                
                res.json({
                    message: '✅ ปุ่ม Emergency Stop เปิดใจการ',
                    command,
                    bayId
                });
            }
        );
    });
};
