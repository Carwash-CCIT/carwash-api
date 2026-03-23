/**
 * ESP8266 Sensor Monitoring Routes
 */

module.exports = function(app, db) {
    
    // ─── Report Sensor Data ─────────────────────────────
    app.post('/api/bay/:id/sensors/report', (req, res) => {
        const bayId = parseInt(req.params.id);
        const { waterLevel, motionDetected, faultDetected, coinValue, relayStates } = req.body;
        
        console.log(`📊 [Bay ${bayId}] Sensor Report:`);
        console.log(`   Water Level: ${waterLevel ? 'OK' : 'LOW'}`);
        console.log(`   Motion: ${motionDetected ? 'Detected' : 'None'}`);
        console.log(`   Fault: ${faultDetected ? '⚠️ YES' : 'No'}`);
        console.log(`   Coin Value: ${coinValue}`);
        
        if (faultDetected) {
            db.run(
                "UPDATE machines SET status = 'idle', pending_command = 'EMERGENCY_STOP' WHERE id = ?",
                [bayId]
            );
            return res.json({ status: 'fault_detected', message: '❌ Fault detected - stopping all relays' });
        }
        
        res.json({
            status: 'ok',
            bayId,
            message: '✅ Sensor data received'
        });
    });
    
    // ─── Get Sensor Status ──────────────────────────────
    app.get('/api/bay/:id/sensors', (req, res) => {
        const bayId = parseInt(req.params.id);
        
        db.get("SELECT * FROM machines WHERE id = ?", [bayId], (err, machine) => {
            if (err || !machine) return res.status(404).json({ message: '❌ ไม่พบตู้นี้' });
            
            res.json({
                bayId,
                waterLevel: true,
                motionDetected: false,
                faultDetected: false,
                coinValue: 0,
                lastUpdate: new Date().toISOString(),
                message: '✅ Sensor data'
            });
        });
    });
};
