/**
 * ESP8266 Sensor Monitoring Routes
 * รับค่า sensor จาก ESP8266 และบันทึกลง DB
 */

module.exports = function(app, db) {

    // ─── Report Sensor Data (ESP8266 calls this every 10s) ──
    app.post('/api/bay/:id/sensors/report', (req, res) => {
        const bayId = parseInt(req.params.id);
        const { waterLevel, motionDetected, faultDetected, coinValue, relayStates } = req.body;

        console.log(`📊 [Bay ${bayId}] Sensor Report:`);
        console.log(`   Water Level  : ${waterLevel      ? 'OK ✅'         : 'LOW ⚠️'}`);
        console.log(`   Motion       : ${motionDetected  ? 'Detected 🚗'   : 'None'}`);
        console.log(`   Fault        : ${faultDetected   ? '⚠️ YES'         : 'No'}`);
        console.log(`   Coin (ADC)   : ${coinValue}`);

        // บันทึก sensor ล่าสุดลง machines table
        db.run(
            `UPDATE machines SET
                sensor_water_level   = ?,
                sensor_motion        = ?,
                sensor_fault         = ?,
                sensor_coin          = ?,
                sensor_updated_at    = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [waterLevel ? 1 : 0, motionDetected ? 1 : 0, faultDetected ? 1 : 0, coinValue || 0, bayId],
            (err) => {
                if (err) console.warn('[Sensor] DB update warn:', err.message);
            }
        );

        // บันทึก log ลง sensor_logs table
        db.run(
            `INSERT INTO sensor_logs (machine_id, water_level, motion_detected, fault_detected, coin_value, relay_states)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [bayId, waterLevel ? 1 : 0, motionDetected ? 1 : 0, faultDetected ? 1 : 0,
             coinValue || 0, JSON.stringify(relayStates || [])]
        );

        // ถ้า fault → สั่ง EMERGENCY_STOP ทันที
        if (faultDetected) {
            db.run(
                "UPDATE machines SET status = 'idle', pending_command = 'EMERGENCY_STOP' WHERE id = ?",
                [bayId]
            );
            console.warn(`🚨 [Bay ${bayId}] FAULT DETECTED — EMERGENCY_STOP issued!`);
            return res.json({
                status   : 'fault_detected',
                command  : 'EMERGENCY_STOP',
                message  : '❌ Fault detected - stopping all relays'
            });
        }

        res.json({ status: 'ok', bayId, message: '✅ Sensor data received' });
    });

    // ─── Get Sensor Status (อ่านค่าล่าสุดจาก DB) ────────────
    app.get('/api/bay/:id/sensors', (req, res) => {
        const bayId = parseInt(req.params.id);

        db.get(
            `SELECT id, name, status,
                    sensor_water_level, sensor_motion, sensor_fault, sensor_coin, sensor_updated_at
             FROM machines WHERE id = ?`,
            [bayId],
            (err, machine) => {
                if (err || !machine) return res.status(404).json({ message: '❌ ไม่พบตู้นี้' });

                res.json({
                    bayId,
                    name          : machine.name,
                    status        : machine.status,
                    waterLevel    : !!machine.sensor_water_level,
                    motionDetected: !!machine.sensor_motion,
                    faultDetected : !!machine.sensor_fault,
                    coinValue     : machine.sensor_coin || 0,
                    lastUpdate    : machine.sensor_updated_at || null,
                    message       : '✅ Sensor data'
                });
            }
        );
    });

    // ─── Sensor Log History ──────────────────────────────────
    app.get('/api/bay/:id/sensors/logs', (req, res) => {
        const bayId = parseInt(req.params.id);
        const limit = parseInt(req.query.limit) || 50;

        db.all(
            `SELECT * FROM sensor_logs WHERE machine_id = ? ORDER BY created_at DESC LIMIT ?`,
            [bayId, limit],
            (err, rows) => {
                if (err) return res.status(500).json({ message: '❌ เกิดข้อผิดพลาด' });
                res.json({ bayId, logs: rows });
            }
        );
    });
};
