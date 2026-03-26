/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║        CAR WASH ESP8266 - FULL API INTEGRATION              ║
 * ║   เชื่อมต่อ Server API ครบทุก endpoint (HTTP Polling)        ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * ─── Libraries Required ────────────────────────────────────────
 *  - ESP8266WiFi         (built-in)
 *  - ESP8266HTTPClient   (built-in)
 *  - ArduinoJson         (Install via Library Manager: v6.x)
 *
 * ─── Board Setting ─────────────────────────────────────────────
 *  Board: NodeMCU 1.0 (ESP-12E Module)
 *  Upload Speed: 115200
 *  Flash Size: 4MB (FS:2MB OTA:~1019KB)
 *
 * ─── Pin Map ────────────────────────────────────────────────────
 *  D5 (GPIO14) → Relay WATER  (น้ำ)
 *  D6 (GPIO12) → Relay FOAM   (โฟม)
 *  D7 (GPIO13) → Relay AIR    (ลม)
 *  D0 (GPIO16) → Relay WAX    (เคลือบสี)
 *  D8 (GPIO15) → Relay TYRE   (ยางดำ)
 *  D1 (GPIO5)  → Sensor Water Level
 *  D2 (GPIO4)  → Sensor Motion
 *  D3 (GPIO0)  → Sensor Fault (active HIGH)
 *  A0          → Sensor Coin (ADC)
 *
 * ─── API Endpoints ใช้งาน ──────────────────────────────────────
 *  GET  /api/bay/:id/command          ← ดึงคำสั่ง (Polling)
 *  POST /api/bay/:id/status           ← รายงาน IDLE/BUSY
 *  POST /api/bay/:id/sensors/report   ← รายงาน Sensor ทุก 10s
 *  GET  /api/bay/:id/session          ← ตรวจ session ปัจจุบัน
 *  GET  /api/pricing                  ← ดูราคาบริการ
 */

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <ArduinoJson.h>

// ════════════════════════════════════════════════════════════════
//   ⚙️  CONFIG — แก้ไขตรงนี้ให้ตรงกับระบบของคุณ
// ════════════════════════════════════════════════════════════════

// WiFi
const char* WIFI_SSID     = "YOUR_WIFI_SSID";        // ← ใส่ชื่อ WiFi
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";    // ← ใส่รหัส WiFi

// Server API
const char* SERVER_URL    = "http://192.168.1.100:3000"; // ← IP ของ Server
const int   BAY_ID        = 1;                           // ← หมายเลข Bay (1-6)

// Polling Intervals (milliseconds)
const unsigned long POLL_CMD_INTERVAL      = 2000;   // ดึงคำสั่งทุก 2 วินาที
const unsigned long REPORT_STATUS_INTERVAL = 10000;  // รายงานสถานะทุก 10 วินาที
const unsigned long WIFI_RECONNECT_INTERVAL= 5000;   // reconnect WiFi ทุก 5 วินาที
const unsigned long SESSION_CHECK_INTERVAL = 30000;  // ตรวจ session ทุก 30 วินาที

// ════════════════════════════════════════════════════════════════
//   📌  PIN DEFINITIONS
// ════════════════════════════════════════════════════════════════

// Relay Pins (OUTPUT)
#define RELAY_WATER   D5  // GPIO14
#define RELAY_FOAM    D6  // GPIO12
#define RELAY_AIR     D7  // GPIO13
#define RELAY_WAX     D0  // GPIO16
#define RELAY_TYRE    D8  // GPIO15

// Sensor Pins (INPUT)
#define SENSOR_WATER  D1  // GPIO5  — Water Level (HIGH = มีน้ำ)
#define SENSOR_MOTION D2  // GPIO4  — Motion (HIGH = มีการเคลื่อนไหว)
#define SENSOR_FAULT  D3  // GPIO0  — Fault (HIGH = เกิดข้อผิดพลาด)
#define SENSOR_COIN   A0  //        — Coin ADC value

// ════════════════════════════════════════════════════════════════
//   🗂️  STATE
// ════════════════════════════════════════════════════════════════

struct RelayState {
  bool water = false;
  bool foam  = false;
  bool air   = false;
  bool wax   = false;
  bool tyre  = false;
} relay;

unsigned long lastPollCmd      = 0;
unsigned long lastReportStatus = 0;
unsigned long lastWifiCheck    = 0;
unsigned long lastSessionCheck = 0;
String        lastCommand      = "";
bool          isBusy           = false;
bool          hasActiveSession = false;

// ════════════════════════════════════════════════════════════════
//   🔧  RELAY CONTROL
// ════════════════════════════════════════════════════════════════

void relaySet(int pin, bool state, const char* name) {
  digitalWrite(pin, state ? HIGH : LOW);
  Serial.printf("[RELAY] %-6s → %s\n", name, state ? "ON ✅" : "OFF 🔴");
}

void stopAllRelays() {
  relaySet(RELAY_WATER, false, "WATER");
  relaySet(RELAY_FOAM,  false, "FOAM");
  relaySet(RELAY_AIR,   false, "AIR");
  relaySet(RELAY_WAX,   false, "WAX");
  relaySet(RELAY_TYRE,  false, "TYRE");
  relay = {false, false, false, false, false};
  isBusy = false;
  Serial.println("[RELAY] 🛑 All relays STOPPED");
}

// ════════════════════════════════════════════════════════════════
//   ⚡  COMMAND EXECUTOR
// ════════════════════════════════════════════════════════════════

void executeCommand(String cmd) {
  cmd.trim();
  if (cmd.length() == 0) return;
  if (cmd == lastCommand) return;
  lastCommand = cmd;

  Serial.printf("\n[CMD] ▶ %s\n", cmd.c_str());

  if      (cmd == "WATER_ON")  { relaySet(RELAY_WATER, true,  "WATER"); relay.water = true;  isBusy = true; }
  else if (cmd == "WATER_OFF") { relaySet(RELAY_WATER, false, "WATER"); relay.water = false; }
  else if (cmd == "FOAM_ON")   { relaySet(RELAY_FOAM,  true,  "FOAM");  relay.foam  = true;  isBusy = true; }
  else if (cmd == "FOAM_OFF")  { relaySet(RELAY_FOAM,  false, "FOAM");  relay.foam  = false; }
  else if (cmd == "AIR_ON")    { relaySet(RELAY_AIR,   true,  "AIR");   relay.air   = true;  isBusy = true; }
  else if (cmd == "AIR_OFF")   { relaySet(RELAY_AIR,   false, "AIR");   relay.air   = false; }
  else if (cmd == "WAX_ON")    { relaySet(RELAY_WAX,   true,  "WAX");   relay.wax   = true;  isBusy = true; }
  else if (cmd == "WAX_OFF")   { relaySet(RELAY_WAX,   false, "WAX");   relay.wax   = false; }
  else if (cmd == "TYRE_ON")   { relaySet(RELAY_TYRE,  true,  "TYRE");  relay.tyre  = true;  isBusy = true; }
  else if (cmd == "TYRE_OFF")  { relaySet(RELAY_TYRE,  false, "TYRE");  relay.tyre  = false; }
  else if (cmd == "STOP" || cmd == "EMERGENCY_STOP") {
    stopAllRelays();
    lastCommand = "";
  }
  else {
    Serial.printf("[CMD] ⚠️  Unknown command: %s\n", cmd.c_str());
    lastCommand = "";
  }

  if (!relay.water && !relay.foam && !relay.air && !relay.wax && !relay.tyre) {
    isBusy = false;
  }
}

// ════════════════════════════════════════════════════════════════
//   🌐  HTTP HELPERS
// ════════════════════════════════════════════════════════════════

String httpGet(String path) {
  if (WiFi.status() != WL_CONNECTED) return "";
  WiFiClient client;
  HTTPClient http;
  String url = String(SERVER_URL) + path;
  http.begin(client, url);
  http.setTimeout(5000);
  int code = http.GET();
  String body = "";
  if (code == 200) {
    body = http.getString();
  } else {
    Serial.printf("[HTTP] GET %s → %d\n", path.c_str(), code);
  }
  http.end();
  return body;
}

bool httpPost(String path, String jsonBody) {
  if (WiFi.status() != WL_CONNECTED) return false;
  WiFiClient client;
  HTTPClient http;
  String url = String(SERVER_URL) + path;
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);
  int code = http.POST(jsonBody);
  bool ok = (code == 200);
  if (!ok) {
    Serial.printf("[HTTP] POST %s → %d\n", path.c_str(), code);
  }
  http.end();
  return ok;
}

// ════════════════════════════════════════════════════════════════
//   📡  POLL COMMAND FROM SERVER
//   GET /api/bay/:id/command
// ════════════════════════════════════════════════════════════════

void pollCommand() {
  if (millis() - lastPollCmd < POLL_CMD_INTERVAL) return;
  lastPollCmd = millis();

  String path = "/api/bay/" + String(BAY_ID) + "/command";
  String body = httpGet(path);
  if (body.length() == 0) return;

  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) {
    Serial.printf("[JSON] Parse error: %s\n", err.c_str());
    return;
  }

  const char* cmd = doc["command"];
  if (cmd && strlen(cmd) > 0) {
    executeCommand(String(cmd));
  }
}

// ════════════════════════════════════════════════════════════════
//   📊  REPORT SENSOR + STATUS TO SERVER
//   POST /api/bay/:id/sensors/report
//   POST /api/bay/:id/status
// ════════════════════════════════════════════════════════════════

void reportStatus() {
  if (millis() - lastReportStatus < REPORT_STATUS_INTERVAL) return;
  lastReportStatus = millis();

  bool waterLevel     = digitalRead(SENSOR_WATER);
  bool motionDetected = digitalRead(SENSOR_MOTION);
  bool faultDetected  = digitalRead(SENSOR_FAULT);
  int  coinValue      = analogRead(SENSOR_COIN);

  // ─── 1) POST /api/bay/:id/sensors/report ──────────────
  StaticJsonDocument<512> sensorDoc;
  sensorDoc["waterLevel"]      = waterLevel;
  sensorDoc["motionDetected"]  = motionDetected;
  sensorDoc["faultDetected"]   = faultDetected;
  sensorDoc["coinValue"]       = coinValue;
  JsonArray relayArr = sensorDoc.createNestedArray("relayStates");
  relayArr.add(relay.water);
  relayArr.add(relay.foam);
  relayArr.add(relay.air);
  relayArr.add(relay.wax);
  relayArr.add(relay.tyre);

  String sensorJson;
  serializeJson(sensorDoc, sensorJson);

  String sensorPath = "/api/bay/" + String(BAY_ID) + "/sensors/report";
  String sensorResp = "";
  // เรียก POST และอ่าน response เพื่อเช็ก fault_detected จาก server
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClient client;
    HTTPClient http;
    http.begin(client, String(SERVER_URL) + sensorPath);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(5000);
    int code = http.POST(sensorJson);
    if (code == 200) {
      sensorResp = http.getString();
    }
    http.end();

    // ถ้า server ตอบว่า fault → หยุด relay ทันที
    if (sensorResp.indexOf("fault_detected") > 0) {
      Serial.println("[SERVER] ⚠️ Server confirmed fault → STOP all relays");
      stopAllRelays();
      lastCommand = "";
    }
  }

  // ─── 2) POST /api/bay/:id/status ──────────────────────
  StaticJsonDocument<64> statusDoc;
  statusDoc["status"] = isBusy ? "BUSY" : "IDLE";
  String statusJson;
  serializeJson(statusDoc, statusJson);
  httpPost("/api/bay/" + String(BAY_ID) + "/status", statusJson);

  Serial.printf("[STATUS] Bay%d: %s | Water:%d Motion:%d Coin:%d Fault:%d\n",
    BAY_ID, isBusy ? "BUSY" : "IDLE", waterLevel, motionDetected, coinValue, faultDetected);
}

// ════════════════════════════════════════════════════════════════
//   👤  CHECK ACTIVE SESSION
//   GET /api/bay/:id/session
// ════════════════════════════════════════════════════════════════

void checkSession() {
  if (millis() - lastSessionCheck < SESSION_CHECK_INTERVAL) return;
  lastSessionCheck = millis();

  String path = "/api/bay/" + String(BAY_ID) + "/session";
  String body = httpGet(path);
  if (body.length() == 0) return;

  StaticJsonDocument<512> doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) return;

  bool prevSession = hasActiveSession;
  hasActiveSession = !doc["session"].isNull();

  if (hasActiveSession) {
    const char* userName    = doc["session"]["user_name"] | "Unknown";
    int         userBalance = doc["session"]["user_balance"] | 0;
    Serial.printf("[SESSION] Active: %s (Balance: %d)\n", userName, userBalance);

    // ถ้ายอดเงินหมด → ส่ง STOP
    if (userBalance <= 0 && isBusy) {
      Serial.println("[SESSION] ⚠️ Balance empty → STOP");
      stopAllRelays();
      lastCommand = "";
    }
  } else {
    if (prevSession && isBusy) {
      Serial.println("[SESSION] Session ended → STOP all relays");
      stopAllRelays();
      lastCommand = "";
    }
    Serial.printf("[SESSION] Bay %d: No active session\n", BAY_ID);
  }
}

// ════════════════════════════════════════════════════════════════
//   📶  WIFI MANAGEMENT
// ════════════════════════════════════════════════════════════════

void ensureWifi() {
  if (millis() - lastWifiCheck < WIFI_RECONNECT_INTERVAL) return;
  lastWifiCheck = millis();

  if (WiFi.status() == WL_CONNECTED) return;

  Serial.print("[WiFi] Reconnecting");
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[WiFi] Connected → IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n[WiFi] Failed — will retry");
  }
}

// ════════════════════════════════════════════════════════════════
//   ⚠️  LOCAL FAULT HANDLER
// ════════════════════════════════════════════════════════════════

void checkFaultSensor() {
  if (digitalRead(SENSOR_FAULT) == HIGH) {
    Serial.println("\n[FAULT] ⚠️  Local fault detected! Stopping all relays!");
    stopAllRelays();
    lastCommand = "";
    delay(3000);
  }
}

// ════════════════════════════════════════════════════════════════
//   🔌  SETUP
// ════════════════════════════════════════════════════════════════

void setup() {
  Serial.begin(115200);
  delay(200);

  Serial.println("\n\n╔══════════════════════════════════╗");
  Serial.printf( "║  CAR WASH BOARD — BAY %d STARTUP ║\n", BAY_ID);
  Serial.println("╚══════════════════════════════════╝");

  // ── Relay Pins ────────────────────────────────
  pinMode(RELAY_WATER, OUTPUT);
  pinMode(RELAY_FOAM,  OUTPUT);
  pinMode(RELAY_AIR,   OUTPUT);
  pinMode(RELAY_WAX,   OUTPUT);
  pinMode(RELAY_TYRE,  OUTPUT);
  stopAllRelays();

  // ── Sensor Pins ───────────────────────────────
  pinMode(SENSOR_WATER,  INPUT);
  pinMode(SENSOR_MOTION, INPUT);
  pinMode(SENSOR_FAULT,  INPUT);

  // ── WiFi Connect ──────────────────────────────
  Serial.printf("[WiFi] Connecting to %s ", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 30) {
    delay(500);
    Serial.print(".");
    tries++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[WiFi] ✅ Connected → IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n[WiFi] ⚠️  No connection — running offline mode");
  }

  Serial.printf("[INIT] Server: %s\n", SERVER_URL);
  Serial.printf("[INIT] Bay ID: %d\n", BAY_ID);
  Serial.println("[INIT] ✅ Board ready!\n");
  Serial.println("[INIT] API Endpoints:");
  Serial.printf("  GET  %s/api/bay/%d/command\n",        SERVER_URL, BAY_ID);
  Serial.printf("  POST %s/api/bay/%d/status\n",         SERVER_URL, BAY_ID);
  Serial.printf("  POST %s/api/bay/%d/sensors/report\n", SERVER_URL, BAY_ID);
  Serial.printf("  GET  %s/api/bay/%d/session\n",        SERVER_URL, BAY_ID);
  Serial.printf("  GET  %s/api/pricing\n",               SERVER_URL);
}

// ════════════════════════════════════════════════════════════════
//   🔄  MAIN LOOP
// ════════════════════════════════════════════════════════════════

void loop() {
  ensureWifi();        // ตรวจ WiFi / reconnect
  pollCommand();       // ดึง command จาก Server  (ทุก 2s)
  reportStatus();      // รายงาน sensor + status   (ทุก 10s)
  checkSession();      // ตรวจ session / ยอดเงิน   (ทุก 30s)
  checkFaultSensor();  // ตรวจ fault local

  yield(); // ให้ ESP8266 watchdog
}
