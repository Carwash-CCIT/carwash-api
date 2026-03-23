/**
 * ESP8266 Relay Test - Simple Version (ไม่ต้องเชื่อมต่อ Server)
 * 
 * ทดสอบ Relay แบบง่ายๆ โดยส่งคำสั่งผ่าน Serial Monitor
 * 
 * Commands:
 * - water_on    → เปิดน้ำ
 * - water_off   → ปิดน้ำ
 * - foam_on     → เปิดโฟม
 * - foam_off    → ปิดโฟม
 * - air_on      → เปิดลม
 * - air_off     → ปิดลม
 * - wax_on      → เปิดเคลือบสี
 * - wax_off     → ปิดเคลือบสี
 * - tyre_on     → เปิดยางดำ
 * - tyre_off    → ปิดยางดำ
 * - stop        → ปิดทั้งหมด
 * - status      → ดูสถานะ Relay ทั้งหมด
 */

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

// ─── Relay Status (tracking) ────────────────────────────────
struct RelayStatus {
    bool water = false;
    bool foam = false;
    bool air = false;
    bool wax = false;
    bool tyre = false;
} relayStatus;

// ─── Turn Relay On ──────────────────────────────────────────
void turnRelayOn(int pin, String name) {
    digitalWrite(pin, HIGH);
    Serial.println("✅ [ON]  " + name);
}

// ─── Turn Relay Off ─────────────────────────────────────────
void turnRelayOff(int pin, String name) {
    digitalWrite(pin, LOW);
    Serial.println("❌ [OFF] " + name);
}

// ─── Stop All Relays ────────────────────────────────────────
void stopAllRelays() {
    turnRelayOff(RELAY_WATER, "WATER");
    turnRelayOff(RELAY_FOAM, "FOAM");
    turnRelayOff(RELAY_AIR, "AIR");
    turnRelayOff(RELAY_WAX, "WAX");
    turnRelayOff(RELAY_TYRE, "TYRE");
    
    relayStatus.water = false;
    relayStatus.foam = false;
    relayStatus.air = false;
    relayStatus.wax = false;
    relayStatus.tyre = false;
    
    Serial.println("\n🛑 [STOP] All relays OFF\n");
}

// ─── Print Status ───────────────────────────────────────────
void printStatus() {
    Serial.println("\n═══════════════════════════════════");
    Serial.println("📊 RELAY STATUS");
    Serial.println("═══════════════════════════════════");
    Serial.println("WATER  : " + String(relayStatus.water ? "🟢 ON" : "🔴 OFF"));
    Serial.println("FOAM   : " + String(relayStatus.foam ? "🟢 ON" : "🔴 OFF"));
    Serial.println("AIR    : " + String(relayStatus.air ? "🟢 ON" : "🔴 OFF"));
    Serial.println("WAX    : " + String(relayStatus.wax ? "🟢 ON" : "🔴 OFF"));
    Serial.println("TYRE   : " + String(relayStatus.tyre ? "🟢 ON" : "🔴 OFF"));
    Serial.println("═══════════════════════════════════\n");
}

// ─── Print Sensor Status ────────────────────────────────────
void printSensorStatus() {
    int waterLevel = digitalRead(SENSOR_WATER);
    int motion = digitalRead(SENSOR_MOTION);
    int fault = digitalRead(SENSOR_FAULT);
    int coin = analogRead(SENSOR_COIN);
    
    Serial.println("\n═══════════════════════════════════");
    Serial.println("📡 SENSOR STATUS");
    Serial.println("═══════════════════════════════════");
    Serial.println("Water Level : " + String(waterLevel ? "✅ OK" : "❌ LOW"));
    Serial.println("Motion      : " + String(motion ? "🔔 Detected" : "😴 None"));
    Serial.println("Fault       : " + String(fault ? "⚠️ YES" : "✅ No"));
    Serial.println("Coin Value  : " + String(coin));
    Serial.println("═══════════════════════════════════\n");
}

// ─── Process Serial Command ─────────────────────────────────
void processCommand(String cmd) {
    cmd.toLowerCase();
    cmd.trim();
    
    Serial.println("\n>>> Command: " + cmd);
    
    if (cmd == "water_on") {
        turnRelayOn(RELAY_WATER, "WATER");
        relayStatus.water = true;
    }
    else if (cmd == "water_off") {
        turnRelayOff(RELAY_WATER, "WATER");
        relayStatus.water = false;
    }
    else if (cmd == "foam_on") {
        turnRelayOn(RELAY_FOAM, "FOAM");
        relayStatus.foam = true;
    }
    else if (cmd == "foam_off") {
        turnRelayOff(RELAY_FOAM, "FOAM");
        relayStatus.foam = false;
    }
    else if (cmd == "air_on") {
        turnRelayOn(RELAY_AIR, "AIR");
        relayStatus.air = true;
    }
    else if (cmd == "air_off") {
        turnRelayOff(RELAY_AIR, "AIR");
        relayStatus.air = false;
    }
    else if (cmd == "wax_on") {
        turnRelayOn(RELAY_WAX, "WAX");
        relayStatus.wax = true;
    }
    else if (cmd == "wax_off") {
        turnRelayOff(RELAY_WAX, "WAX");
        relayStatus.wax = false;
    }
    else if (cmd == "tyre_on") {
        turnRelayOn(RELAY_TYRE, "TYRE");
        relayStatus.tyre = true;
    }
    else if (cmd == "tyre_off") {
        turnRelayOff(RELAY_TYRE, "TYRE");
        relayStatus.tyre = false;
    }
    else if (cmd == "stop") {
        stopAllRelays();
    }
    else if (cmd == "status") {
        printStatus();
    }
    else if (cmd == "sensors") {
        printSensorStatus();
    }
    else if (cmd == "help") {
        printHelp();
    }
    else {
        Serial.println("❌ Unknown command. Type 'help' for list of commands");
    }
}

// ─── Print Help Menu ────────────────────────────────────────
void printHelp() {
    Serial.println("\n╔════════════════════════════════════════╗");
    Serial.println("║      ESP8266 RELAY TEST - COMMANDS     ║");
    Serial.println("╚════════════════════════════════════════╝");
    Serial.println("\n🔧 Relay Control:");
    Serial.println("  water_on     - Turn ON water relay");
    Serial.println("  water_off    - Turn OFF water relay");
    Serial.println("  foam_on      - Turn ON foam relay");
    Serial.println("  foam_off     - Turn OFF foam relay");
    Serial.println("  air_on       - Turn ON air relay");
    Serial.println("  air_off      - Turn OFF air relay");
    Serial.println("  wax_on       - Turn ON wax relay");
    Serial.println("  wax_off      - Turn OFF wax relay");
    Serial.println("  tyre_on      - Turn ON tyre relay");
    Serial.println("  tyre_off     - Turn OFF tyre relay");
    Serial.println("  stop         - Stop ALL relays");
    Serial.println("\n📊 Status:");
    Serial.println("  status       - Show relay status");
    Serial.println("  sensors      - Show sensor readings");
    Serial.println("  help         - Show this menu");
    Serial.println("\n💡 Example: Type 'water_on' then press ENTER\n");
}

// ─── Setup ──────────────────────────────────────────────────
void setup() {
    Serial.begin(115200);
    delay(100);
    
    Serial.println("\n\n");
    Serial.println("╔════════════════════════════════════════╗");
    Serial.println("║   ESP8266 RELAY TEST - STARTING UP     ║");
    Serial.println("╚════════════════════════════════════════╝\n");
    
    // Initialize Relay Pins
    pinMode(RELAY_WATER, OUTPUT);
    pinMode(RELAY_FOAM, OUTPUT);
    pinMode(RELAY_AIR, OUTPUT);
    pinMode(RELAY_WAX, OUTPUT);
    pinMode(RELAY_TYRE, OUTPUT);
    
    // Initialize Sensor Pins
    pinMode(SENSOR_WATER, INPUT);
    pinMode(SENSOR_MOTION, INPUT);
    pinMode(SENSOR_FAULT, INPUT);
    
    // Turn all relays OFF initially
    stopAllRelays();
    
    // Print help menu
    printHelp();
    
    Serial.println("✅ Setup complete! Ready for testing.\n");
}

// ─── Main Loop ──────────────────────────────────────────────
void loop() {
    // Check for Serial input
    if (Serial.available() > 0) {
        String command = Serial.readStringUntil('\n');
        processCommand(command);
    }
    
    // Monitor fault sensor
    if (digitalRead(SENSOR_FAULT) == HIGH) {
        Serial.println("\n⚠️  [FAULT] Detected! Stopping all relays");
        stopAllRelays();
        delay(2000);
    }
    
    delay(10);
}
