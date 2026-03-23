/**
 * ESP8266 Micro Board API
 * ═════════════════════════════════════════════════════════════
 * API สำหรับเชื่อมต่อ ESP8266 Microcontroller กับระบบ Car Wash
 * 
 * Features:
 * - Relay control (WATER, FOAM, AIR, WAX, TYRE)
 * - Sensor monitoring (Coin, Water level, Motion detection)
 * - Real-time status updates via Firebase Realtime DB
 * - HTTP polling fallback
 * - Hardware health check
 * ═════════════════════════════════════════════════════════════
 */

/**
 * ═══ SECTION 1: RELAY CONTROL APIs ═══════════════════════════
 * 
 * Relay Pinouts:
 * - Relay 1 (GPIO12): WATER (น้ำ)
 * - Relay 2 (GPIO14): FOAM (โฟม)
 * - Relay 3 (GPIO13): AIR (ลม)
 * - Relay 4 (GPIO4):  WAX (เคลือบสี)
 * - Relay 5 (GPIO5):  TYRE (ยางดำ)
 */

const RELAY_ENDPOINTS = {
    // ─── Relay Control ──────────────────────────
    POST: {
        '/api/bay/:id/relay/water/on': 'WATER_ON',
        '/api/bay/:id/relay/water/off': 'WATER_OFF',
        '/api/bay/:id/relay/foam/on': 'FOAM_ON',
        '/api/bay/:id/relay/foam/off': 'FOAM_OFF',
        '/api/bay/:id/relay/air/on': 'AIR_ON',
        '/api/bay/:id/relay/air/off': 'AIR_OFF',
        '/api/bay/:id/relay/wax/on': 'WAX_ON',
        '/api/bay/:id/relay/wax/off': 'WAX_OFF',
        '/api/bay/:id/relay/tyre/on': 'TYRE_ON',
        '/api/bay/:id/relay/tyre/off': 'TYRE_OFF',
    },
    
    // ─── Bulk Relay Control ─────────────────────
    '/api/bay/:id/relay/stop': 'STOP',
    '/api/bay/:id/relay/emergency-stop': 'EMERGENCY_STOP',
};

/**
 * ═══ SECTION 2: Arduino/ESP8266 Code Reference ══════════════
 * 
 * Pin Configuration:
 * ──────────────────
 */

const ARDUINO_CODE_REFERENCE = `
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <ArduinoJson.h>

// ─── GPIO Pin Mapping ───────────────────────────────────────
#define RELAY_WATER   D6  // GPIO12
#define RELAY_FOAM    D5  // GPIO14
#define RELAY_AIR     D7  // GPIO13
#define RELAY_WAX     D0  // GPIO16
#define RELAY_TYRE    D8  // GPIO15

#define SENSOR_COIN   A0  // ADC
#define SENSOR_WATER  D1  // GPIO5
#define SENSOR_MOTION D2  // GPIO4
#define SENSOR_FAULT  D3  // GPIO0

// ─── WiFi & Server Config ───────────────────────────────────
const char* ssid = "YOUR_SSID";
const char* password = "YOUR_PASSWORD";
const char* serverUrl = "http://192.168.1.100:3000";
const int bayId = 1;  // Bay Number (1-6)

// ─── Timers ─────────────────────────────────────────────────
unsigned long pollTimer = 0;
unsigned long statusTimer = 0;
const unsigned long pollInterval = 2000;      // Poll command every 2 seconds
const unsigned long statusInterval = 5000;    // Report status every 5 seconds

// ─── Relay Control Function ─────────────────────────────────
void setRelay(int pin, boolean state) {
    digitalWrite(pin, state ? HIGH : LOW);
    Serial.printf("[RELAY] Pin %d set to %s\\n", pin, state ? "ON" : "OFF");
}

// ─── Stop All Relays ────────────────────────────────────────
void stopAllRelays() {
    setRelay(RELAY_WATER, false);
    setRelay(RELAY_FOAM, false);
    setRelay(RELAY_AIR, false);
    setRelay(RELAY_WAX, false);
    setRelay(RELAY_TYRE, false);
    Serial.println("[RELAY] All relays STOPPED");
}

// ─── Poll for Command from Server ──────────────────────────
void pollCommand() {
    if (millis() - pollTimer < pollInterval) return;
    pollTimer = millis();
    
    if (!WiFi.isConnected()) {
        Serial.println("[WiFi] Not connected, skipping poll");
        return;
    }

    HTTPClient http;
    String url = String(serverUrl) + "/api/bay/" + bayId + "/command";
    
    http.begin(url);
    int httpCode = http.GET();
    
    if (httpCode == 200) {
        String payload = http.getString();
        DynamicJsonDocument doc(256);
        deserializeJson(doc, payload);
        
        String command = doc["command"];
        if (command.length() > 0) {
            executeCommand(command);
            Serial.printf("[CMD] Executed: %s\\n", command.c_str());
        }
    } else {
        Serial.printf("[HTTP] Error: %d\\n", httpCode);
    }
    http.end();
}

// ─── Execute Command on Hardware ───────────────────────────
void executeCommand(String cmd) {
    if (cmd == "WATER_ON") setRelay(RELAY_WATER, true);
    else if (cmd == "WATER_OFF") setRelay(RELAY_WATER, false);
    else if (cmd == "FOAM_ON") setRelay(RELAY_FOAM, true);
    else if (cmd == "FOAM_OFF") setRelay(RELAY_FOAM, false);
    else if (cmd == "AIR_ON") setRelay(RELAY_AIR, true);
    else if (cmd == "AIR_OFF") setRelay(RELAY_AIR, false);
    else if (cmd == "WAX_ON") setRelay(RELAY_WAX, true);
    else if (cmd == "WAX_OFF") setRelay(RELAY_WAX, false);
    else if (cmd == "TYRE_ON") setRelay(RELAY_TYRE, true);
    else if (cmd == "TYRE_OFF") setRelay(RELAY_TYRE, false);
    else if (cmd == "STOP" || cmd == "EMERGENCY_STOP") stopAllRelays();
}

// ─── Report Status to Server ───────────────────────────────
void reportStatus() {
    if (millis() - statusTimer < statusInterval) return;
    statusTimer = millis();
    
    if (!WiFi.isConnected()) return;

    HTTPClient http;
    String url = String(serverUrl) + "/api/bay/" + bayId + "/status";
    
    DynamicJsonDocument doc(256);
    doc["status"] = "BUSY";  // Can be IDLE or BUSY
    doc["relayStates"][0] = digitalRead(RELAY_WATER);
    doc["relayStates"][1] = digitalRead(RELAY_FOAM);
    doc["relayStates"][2] = digitalRead(RELAY_AIR);
    doc["relayStates"][3] = digitalRead(RELAY_WAX);
    doc["relayStates"][4] = digitalRead(RELAY_TYRE);
    doc["coinSensor"] = analogRead(SENSOR_COIN);
    doc["waterLevel"] = digitalRead(SENSOR_WATER);
    doc["motionDetected"] = digitalRead(SENSOR_MOTION);
    doc["faultDetected"] = digitalRead(SENSOR_FAULT);
    
    String payload;
    serializeJson(doc, payload);
    
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    int httpCode = http.POST(payload);
    
    if (httpCode == 200) {
        Serial.printf("[STATUS] Reported to server\\n");
    }
    http.end();
}

// ─── Setup ──────────────────────────────────────────────────
void setup() {
    Serial.begin(115200);
    delay(100);
    
    // Initialize Relay Pins
    pinMode(RELAY_WATER, OUTPUT);
    pinMode(RELAY_FOAM, OUTPUT);
    pinMode(RELAY_AIR, OUTPUT);
    pinMode(RELAY_WAX, OUTPUT);
    pinMode(RELAY_TYRE, OUTPUT);
    stopAllRelays();
    
    // Initialize Sensor Pins
    pinMode(SENSOR_WATER, INPUT);
    pinMode(SENSOR_MOTION, INPUT);
    pinMode(SENSOR_FAULT, INPUT);
    
    // WiFi Connection
    WiFi.begin(ssid, password);
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(500);
        Serial.print(".");
        attempts++;
    }
    
    if (WiFi.isConnected()) {
        Serial.printf("\\n[WiFi] Connected! IP: %s\\n", WiFi.localIP().toString().c_str());
    } else {
        Serial.println("\\n[WiFi] Failed to connect (will retry)");
    }
}

// ─── Main Loop ──────────────────────────────────────────────
void loop() {
    pollCommand();
    reportStatus();
    
    // Monitor fault sensor
    if (digitalRead(SENSOR_FAULT) == HIGH) {
        stopAllRelays();
        Serial.println("[FAULT] Detected! Stopping all relays");
        delay(5000);
    }
}
`;

/**
 * ═══ SECTION 3: API Endpoint Implementation ══════════════════
 */

// ─── Relay ON/OFF Endpoints ─────────────────────────────────
const RELAY_CONTROL_ENDPOINTS = {
    // Water
    'POST /api/bay/:id/relay/water/on': {
        method: 'POST',
        params: ['id'],
        command: 'WATER_ON',
        description: 'Turn water relay ON',
        price: 5,
        example: 'POST /api/bay/1/relay/water/on',
        response: { command: 'WATER_ON', bayId: 1, status: 'ok' }
    },
    
    // Foam
    'POST /api/bay/:id/relay/foam/on': {
        method: 'POST',
        params: ['id'],
        command: 'FOAM_ON',
        description: 'Turn foam relay ON',
        price: 8,
        example: 'POST /api/bay/1/relay/foam/on'
    },
    
    // Air
    'POST /api/bay/:id/relay/air/on': {
        method: 'POST',
        params: ['id'],
        command: 'AIR_ON',
        description: 'Turn air relay ON',
        price: 3,
        example: 'POST /api/bay/1/relay/air/on'
    },
    
    // Wax
    'POST /api/bay/:id/relay/wax/on': {
        method: 'POST',
        params: ['id'],
        command: 'WAX_ON',
        description: 'Turn wax relay ON',
        price: 15,
        example: 'POST /api/bay/1/relay/wax/on'
    },
    
    // Tyre
    'POST /api/bay/:id/relay/tyre/on': {
        method: 'POST',
        params: ['id'],
        command: 'TYRE_ON',
        description: 'Turn tyre relay ON',
        price: 10,
        example: 'POST /api/bay/1/relay/tyre/on'
    },
    
    // Emergency Stop
    'POST /api/bay/:id/relay/emergency-stop': {
        method: 'POST',
        params: ['id'],
        command: 'EMERGENCY_STOP',
        description: 'Emergency stop all relays',
        price: 0,
        example: 'POST /api/bay/1/relay/emergency-stop'
    }
};

/**
 * ═══ SECTION 4: Sensor Monitoring Endpoints ═════════════════
 */

const SENSOR_ENDPOINTS = {
    'GET /api/bay/:id/sensors': {
        method: 'GET',
        description: 'Get all sensor readings',
        params: ['id'],
        response: {
            bayId: 1,
            waterLevel: true,
            motionDetected: false,
            faultDetected: false,
            coinValue: 0,
            lastUpdate: '2024-01-15T10:30:00Z'
        },
        example: 'GET /api/bay/1/sensors'
    },
    
    'GET /api/bay/:id/sensors/water': {
        method: 'GET',
        description: 'Check water level sensor',
        params: ['id'],
        response: {
            bayId: 1,
            waterLevel: true,  // true = sufficient, false = low
            lastUpdate: '2024-01-15T10:30:00Z'
        }
    },
    
    'GET /api/bay/:id/sensors/motion': {
        method: 'GET',
        description: 'Check motion detection',
        params: ['id'],
        response: {
            bayId: 1,
            motionDetected: false,
            lastUpdate: '2024-01-15T10:30:00Z'
        }
    },
    
    'POST /api/bay/:id/sensors/report': {
        method: 'POST',
        description: 'ESP8266 reports all sensor readings',
        params: ['id'],
        body: {
            waterLevel: true,
            motionDetected: false,
            faultDetected: false,
            coinValue: 0,
            relayStates: [true, false, false, false, false]
        },
        response: {
            status: 'ok',
            bayId: 1
        }
    }
};

/**
 * ═══ SECTION 5: Real-time Firebase Integration ══════════════
 * 
 * Firebase Structure:
 * /bays/{machineId}/
 *   ├── status: "idle" | "busy"
 *   ├── command: { action: "WATER_ON", timestamp: ... }
 *   ├── relays:
 *   │   ├── water: true/false
 *   │   ├── foam: true/false
 *   │   ├── air: true/false
 *   │   ├── wax: true/false
 *   │   └── tyre: true/false
 *   ├── sensors:
 *   │   ├── waterLevel: true/false
 *   │   ├── motionDetected: true/false
 *   │   ├── faultDetected: true/false
 *   │   └── coinValue: 0
 *   └── lastUpdate: timestamp
 */

const FIREBASE_WEBSOCKET_EXAMPLE = `
// Real-time listener (Node.js/JavaScript)
const firebase = require('firebase/database');

const dbRef = firebase.ref(db, 'bays/1/command');
firebase.onValue(dbRef, (snapshot) => {
    const cmd = snapshot.val();
    if (cmd && cmd.action) {
        console.log('🔔 New command:', cmd.action);
        // Execute command on hardware
        executeCommand(cmd.action);
    }
});

// Update status in real-time
firebase.set(firebase.ref(db, 'bays/1/status'), 'idle');
`;

/**
 * ═══ SECTION 6: Integration Flow Diagram ════════════════════
 * 
 * User Mobile App Flow:
 * ──────────────────────
 * 
 * 1. User clicks "WATER" button on mobile
 *    ↓
 * 2. Mobile app calls: POST /api/bay/1/relay/water/on
 *    ↓
 * 3. Server validates payment & deducts balance
 *    ↓
 * 4. Server pushes command to Firebase:
 *    bays/1/command = { action: "WATER_ON", timestamp: ... }
 *    ↓
 * 5. ESP8266 polls Firebase (or gets via HTTP)
 *    ↓
 * 6. ESP8266 activates Relay (GPIO12)
 *    ↓
 * 7. Water spray starts
 *    ↓
 * 8. ESP8266 reports status back to server
 *    ↓
 * 9. Server updates relay state in database
 */

const INTEGRATION_FLOW = `
┌─────────────────────────────────────────────────────────────┐
│                    USER MOBILE APP                          │
│  [WATER] [FOAM] [AIR] [WAX] [TYRE] [STOP]                 │
└────────────────────────┬────────────────────────────────────┘
                         │ POST /api/bay/:id/relay/:type/on
                         ↓
                    ┌─────────────┐
                    │   SERVER    │
                    │ Node.js API │
                    └──────┬──────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ↓                  ↓                  ↓
    [Firebase]    [Database Update]   [HTTP Response]
   Real-time DB   (Session tracking)  (to mobile app)
        │
        ↓
   ┌─────────────────────────┐
   │    FIREBASE REALTIME    │
   │  bays/1/command = {...} │
   └─────────────┬───────────┘
                 │ Listener triggered
                 ↓
         ┌───────────────────┐
         │    ESP8266 MCU    │
         │   ↓ Poll Command  │
         │   ↓ Execute GPIO  │
         │   ↓ Report Status │
         └───────┬───────────┘
                 │
        ┌────────┴────────┐
        ↓                 ↓
    [Relays]       [Sensors]
  WATER/FOAM     Water Level
  AIR/WAX        Motion
  TYRE           Fault
`;

/**
 * ═══ SECTION 7: Complete Implementation Example ══════════════
 */

const COMPLETE_IMPLEMENTATION = `
// ─── Installation (in server.js) ────────────────────────────

const express = require('express');
const app = express();

// ─── GET Bay Status ─────────────────────────────────────────
app.get('/api/bay/:id/status', (req, res) => {
    const bayId = parseInt(req.params.id);
    db.get(
        \`SELECT * FROM machines WHERE id = ?\`,
        [bayId],
        (err, row) => {
            if (err || !row) {
                return res.status(404).json({ 
                    message: '❌ Bay not found' 
                });
            }
            res.json({
                bayId,
                status: row.status,
                lastCommand: row.pending_command,
                message: '✅ Success'
            });
        }
    );
});

// ─── POST Relay Control ──────────────────────────────────────
app.post('/api/bay/:id/relay/:type/on', (req, res) => {
    const bayId = parseInt(req.params.id);
    const relayType = req.params.type.toUpperCase();
    const command = relayType + '_ON';
    
    // Validate relay type
    const validTypes = ['WATER', 'FOAM', 'AIR', 'WAX', 'TYRE'];
    if (!validTypes.includes(relayType)) {
        return res.status(400).json({ 
            message: '❌ Invalid relay type' 
        });
    }
    
    // Store command in database
    db.run(
        'UPDATE machines SET pending_command = ? WHERE id = ?',
        [command, bayId],
        (err) => {
            if (err) {
                return res.status(500).json({ 
                    message: '❌ Database error' 
                });
            }
            
            // Push to Firebase
            if (dbFirebase) {
                dbFirebase.ref(\`bays/\${bayId}/command\`).set({
                    action: command,
                    timestamp: admin.database.ServerValue.TIMESTAMP
                });
            }
            
            console.log(\`📤 Command sent to Bay \${bayId}: \${command}\`);
            res.json({
                message: '✅ Command sent',
                command,
                bayId
            });
        }
    );
});

// ─── POST Stop All Relays ───────────────────────────────────
app.post('/api/bay/:id/relay/stop', (req, res) => {
    const bayId = parseInt(req.params.id);
    const command = 'STOP';
    
    db.run(
        'UPDATE machines SET pending_command = ?, status = ? WHERE id = ?',
        [command, 'idle', bayId],
        (err) => {
            if (err) {
                return res.status(500).json({ 
                    message: '❌ Database error' 
                });
            }
            
            if (dbFirebase) {
                dbFirebase.ref(\`bays/\${bayId}/command\`).set({
                    action: command,
                    timestamp: admin.database.ServerValue.TIMESTAMP
                });
            }
            
            res.json({
                message: '✅ All relays stopped',
                command: 'STOP',
                bayId
            });
        }
    );
});

// ─── POST Sensor Report ──────────────────────────────────────
app.post('/api/bay/:id/sensors/report', (req, res) => {
    const bayId = parseInt(req.params.id);
    const { waterLevel, motionDetected, faultDetected, coinValue } = req.body;
    
    // Store sensor data
    db.run(\`
        UPDATE machines 
        SET pending_command = NULL 
        WHERE id = ?
    \`, [bayId]);
    
    // Could store sensor readings in a sensors table
    console.log(\`📊 [Bay \${bayId}] Sensor Report:
        Water: \${waterLevel}
        Motion: \${motionDetected}
        Fault: \${faultDetected}
        Coin: \${coinValue}\`);
    
    res.json({
        status: 'ok',
        bayId,
        message: '✅ Sensors recorded'
    });
});

// ─── GET Sensor Status ───────────────────────────────────────
app.get('/api/bay/:id/sensors', (req, res) => {
    const bayId = parseInt(req.params.id);
    
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
`;

/**
 * ═══ SECTION 8: cURL Examples for Testing ════════════════════
 */

const CURL_EXAMPLES = `
# ─── Test ESP8266 Connection ────────────────────────────────
curl -X GET http://localhost:3000/api/bay/1/command

# ─── Turn Water ON (Bay 1) ──────────────────────────────────
curl -X POST http://localhost:3000/api/bay/1/relay/water/on

# ─── Turn Foam ON ───────────────────────────────────────────
curl -X POST http://localhost:3000/api/bay/1/relay/foam/on

# ─── Turn Air ON ────────────────────────────────────────────
curl -X POST http://localhost:3000/api/bay/1/relay/air/on

# ─── Emergency Stop ─────────────────────────────────────────
curl -X POST http://localhost:3000/api/bay/1/relay/emergency-stop

# ─── Report Status from ESP8266 ────────────────────────────
curl -X POST http://localhost:3000/api/bay/1/sensors/report \\
  -H "Content-Type: application/json" \\
  -d '{
    "waterLevel": true,
    "motionDetected": false,
    "faultDetected": false,
    "coinValue": 0
  }'

# ─── Get Bay Status ─────────────────────────────────────────
curl -X GET http://localhost:3000/api/bay/1/status

# ─── Get Sensor Readings ────────────────────────────────────
curl -X GET http://localhost:3000/api/bay/1/sensors
`;

/**
 * ═══ SECTION 9: .env Configuration ═══════════════════════════
 */

const ENV_CONFIG = `
# ─── Firebase Configuration ─────────────────────────────────
FIREBASE_PROJECT_ID=carwash-ccit
FIREBASE_PRIVATE_KEY_ID=xxx
FIREBASE_PRIVATE_KEY=xxx
FIREBASE_CLIENT_EMAIL=xxx
FIREBASE_CLIENT_ID=xxx
FIREBASE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
FIREBASE_TOKEN_URI=https://oauth2.googleapis.com/token

# ─── ESP8266 Polling Configuration ──────────────────────────
ESP8266_POLL_INTERVAL=2000      # Poll every 2 seconds
ESP8266_STATUS_INTERVAL=5000    # Report status every 5 seconds
ESP8266_TIMEOUT=10000           # Timeout if no response

# ─── Hardware Configuration ────────────────────────────────
RELAY_COUNT=5
SENSOR_COUNT=4
TOTAL_BAYS=6
`;

/**
 * ═══ SECTION 10: Testing Checklist ══════════════════════════
 */

const TESTING_CHECKLIST = `
ESP8266 Integration Testing Checklist:
═════════════════════════════════════════════════════════════

□ Hardware Setup
  □ ESP8266 connected to WiFi
  □ All 5 relays wired correctly (GPIO 12,14,13,4,5)
  □ Sensors connected (coin, water level, motion, fault)
  □ Power supply stable (3.3V)

□ API Endpoints
  □ GET /api/bay/:id/command - returns next command
  □ POST /api/bay/:id/relay/water/on - turns relay on
  □ POST /api/bay/:id/relay/:type/off - turns relay off
  □ POST /api/bay/:id/relay/stop - emergency stop
  □ POST /api/bay/:id/sensors/report - sensor data upload
  □ GET /api/bay/:id/status - bay status

□ Firebase Integration
  □ Firebase credentials loaded
  □ Commands pushed to bays/{bayId}/command
  □ Status updates bays/{bayId}/status

□ Command Execution
  □ ESP8266 polls /api/bay/:id/command every 2 seconds
  □ Relay activates within 500ms of command
  □ Relay deactivates on STOP command

□ Sensor Monitoring
  □ Water level sensor reports correctly
  □ Motion sensor triggers appropriately
  □ Fault sensor triggers on error
  □ Coin sensor value reported

□ Error Handling
  □ Invalid bay ID returns 404
  □ Disconnected relay doesn't crash
  □ WiFi dropout handled gracefully
  □ Firebase connection loss fallback to HTTP

□ Security
  □ ESP8266 validates command format
  □ Commands signed/verified
  □ Rate limiting on relay endpoints
  □ No sensitive data in logs
`;

/**
 * Export all documentation
 */
module.exports = {
    RELAY_ENDPOINTS,
    ARDUINO_CODE_REFERENCE,
    RELAY_CONTROL_ENDPOINTS,
    SENSOR_ENDPOINTS,
    FIREBASE_WEBSOCKET_EXAMPLE,
    INTEGRATION_FLOW,
    COMPLETE_IMPLEMENTATION,
    CURL_EXAMPLES,
    ENV_CONFIG,
    TESTING_CHECKLIST
};
