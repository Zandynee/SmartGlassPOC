//  Smart Glasses Health Monitor — Tier 1 & Tier 2 Architecture
#include <Wire.h>
#include <ArduinoBLE.h>

#include "tof.h"
#include "imu.h"
#include "ppg.h"
#include "haptic.h"

// ─────────────────────────────────────────
//  Konfigurasi BLE
// ─────────────────────────────────────────
#define BLE_DEVICE_NAME   "SmartGlasses"
#define BLE_SERVICE_UUID  "19b10000-e8f2-537e-4f6c-d104768a1214"
#define BLE_CHAR_TOF_UUID "19b10001-e8f2-537e-4f6c-d104768a1214"
#define BLE_CHAR_IMU_UUID "19b10002-e8f2-537e-4f6c-d104768a1214"
#define BLE_CHAR_PPG_UUID "19b10003-e8f2-537e-4f6c-d104768a1214"
#define BLE_CHAR_STATE_UUID "19b10004-e8f2-537e-4f6c-d104768a1214" // Broadcaster
#define BLE_CHAR_CMD_UUID   "19b10005-e8f2-537e-4f6c-d104768a1214" // Receiver

BLEService healthService(BLE_SERVICE_UUID);

BLEStringCharacteristic tofChar(BLE_CHAR_TOF_UUID, BLERead | BLENotify, 64);
BLEStringCharacteristic imuChar(BLE_CHAR_IMU_UUID, BLERead | BLENotify, 128);
// UPDATED: Raised to 256 to fit 10-24 sample JSON arrays[cite: 6]
BLEStringCharacteristic ppgChar(BLE_CHAR_PPG_UUID, BLERead | BLENotify, 256);

BLEStringCharacteristic stateChar(BLE_CHAR_STATE_UUID, BLERead | BLENotify, 32);
BLEByteCharacteristic   cmdChar(BLE_CHAR_CMD_UUID, BLEWrite);

// ─────────────────────────────────────────
//  TIER 1: SYSTEM STATES
//
//  Allowed transitions (anything else is rejected, see requestState()):
//    BASELINE_CREATION → WORK_MODE
//    WORK_MODE         → CHECK_MODE | IDLE
//    CHECK_MODE        → WORK_MODE  | IDLE
//    IDLE              → WORK_MODE
//  BASELINE_CREATION is only entered at boot.
//
//  Commands written to cmdChar:  1 = WORK_MODE, 2 = CHECK_MODE, 3 = IDLE
// ─────────────────────────────────────────
enum SysState {
  STATE_BASELINE_CREATION,
  STATE_WORK_MODE,
  STATE_CHECK_MODE,
  STATE_IDLE               // session ended: every sensor and the haptic motor are off
};

SysState _globalState = STATE_BASELINE_CREATION;
bool _stateJustChanged = true;

// Intervals
#define INTERVAL_TOF_MS   200
#define INTERVAL_IMU_MS   100
// UPDATED: Now fetches batches every 100ms (approx 10Hz notification rate)[cite: 6]
#define INTERVAL_PPG_MS   100
#define SERIAL_WAIT_TIMEOUT_MS 3000

// If the app disappears while the glasses are in CHECK_MODE (PPG LED on, ToF and
// haptic off), fall back to WORK_MODE after this long so the user is protected
// again and the battery is not drained.
#define CHECK_ORPHAN_TIMEOUT_MS 60000UL

static unsigned long _lastTofMs = 0;
static unsigned long _lastImuMs = 0;
static unsigned long _lastPpgMs = 0;
static float _lastDistanceCm = 999.0f;
static volatile bool _bleConnected = false;
static unsigned long _disconnectedSince = 0;

// NEW: Sequence counter for exactly tracking packet drops on the app side
static uint32_t _ppgSeqNum = 0;

// Forward declaration
bool initBLE();
void onBleConnected(BLEDevice central);
void onBleDisconnected(BLEDevice central);
void onBleCommandReceived(BLEDevice central, BLECharacteristic characteristic);
String buildTofJson(float distanceCm, const char* status);
String buildImuJson(const ImuReading &r);
String buildPpgJsonBatch(const PpgBatch &b, uint32_t seq);
const char* stateName(SysState s);
bool canTransition(SysState from, SysState to);
bool requestState(SysState to, const char* why);

// ═══════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  unsigned long serialStart = millis();
  while (!Serial && (millis() - serialStart < SERIAL_WAIT_TIMEOUT_MS)) delay(10);
  Wire.begin();

  tofInit();
  imuInit();
  ppgInit();
  hapticInit();
  initBLE();
}

// ═══════════════════════════════════════════════════════════
void loop() {
  BLE.poll();
  unsigned long now = millis();

  // ── Orphaned CHECK_MODE watchdog ──
  if (_globalState == STATE_CHECK_MODE && !_bleConnected &&
      (now - _disconnectedSince >= CHECK_ORPHAN_TIMEOUT_MS)) {
    requestState(STATE_WORK_MODE, "CHECK_MODE orphaned (app gone)");
  }

  // ── TIER 1: GLOBAL STATE MACHINE ──
  switch (_globalState) {

    // ==========================================
    case STATE_BASELINE_CREATION:
      if (_stateJustChanged) {
        stateChar.setValue("BASELINE_CREATION");
        tofSleep();
        imuWake();
        ppgWake();

        Serial.println("\n[STATE] Entered: BASELINE_CREATION");
        Serial.println("[STATE] Active Sensors: IMU, PPG | Sleeping: TOF");

        _stateJustChanged = false;
      }

      if (now - _lastImuMs >= INTERVAL_IMU_MS) {
        ImuReading r = imuRead();
        if (_bleConnected) imuChar.setValue(buildImuJson(r));
        _lastImuMs = now;
      }
      // UPDATED: Fast batch transmission for PPG[cite: 6]
     if (now - _lastPpgMs >= INTERVAL_PPG_MS) {
        PpgBatch b;
        int count = ppgReadBatch(b);
        if (count > 0) {
          String payload = buildPpgJsonBatch(b, _ppgSeqNum++);

          Serial.print("[BLE-DEBUG] PPG Sending ");
          Serial.print(payload.length());
          Serial.print(" bytes: ");
          Serial.println(payload);

          if (_bleConnected) ppgChar.setValue(payload);
        }
        _lastPpgMs = now;
      }
      break;

    // ==========================================
    case STATE_IDLE:
      if (_stateJustChanged) {
        stateChar.setValue("IDLE");
        hapticStop();
        tofSleep();
        imuSleep();
        ppgSleep();

        Serial.println("\n[STATE] Entered: IDLE");
        Serial.println("[STATE] Active Sensors: none | Sleeping: TOF, IMU, PPG | Haptic: off");

        _stateJustChanged = false;
      }
      break;

    // ==========================================
    case STATE_WORK_MODE:
      if (_stateJustChanged) {
        stateChar.setValue("WORK_MODE");
        hapticStop();
        _lastDistanceCm = 999.0f;   // never act on a distance measured before the last state
        ppgSleep();
        tofWake();
        imuWake();

        Serial.println("\n[STATE] Entered: WORK_MODE");
        Serial.println("[STATE] Active Sensors: TOF, IMU | Sleeping: PPG");

        _stateJustChanged = false;
      }

      if (now - _lastTofMs >= INTERVAL_TOF_MS) {
        TofReading r = tofRead();
        _lastDistanceCm = (r.status == TofStatus::SENSOR_ERROR) ? 999.0f : r.distanceCm;
        if (_bleConnected) tofChar.setValue(buildTofJson(r.distanceCm, tofStatusToString(r.status)));
        _lastTofMs = now;
      }
      if (now - _lastImuMs >= INTERVAL_IMU_MS) {
        ImuReading r = imuRead();
        if (_bleConnected) imuChar.setValue(buildImuJson(r));
        _lastImuMs = now;
      }

      hapticUpdate(_lastDistanceCm);
      break;

    // ==========================================
    case STATE_CHECK_MODE:
      if (_stateJustChanged) {
        stateChar.setValue("CHECK_MODE");
        tofSleep();
        imuWake();
        ppgWake();
        hapticStop();  // Force haptic off (also resets its pulse state)

        Serial.println("\n[STATE] Entered: CHECK_MODE");
        Serial.println("[STATE] Active Sensors: IMU, PPG | Sleeping: TOF");

        _stateJustChanged = false;
      }

      if (now - _lastImuMs >= INTERVAL_IMU_MS) {
        ImuReading r = imuRead();
        if (_bleConnected) imuChar.setValue(buildImuJson(r));
        _lastImuMs = now;
      }
      // UPDATED: Fast batch transmission for PPG[cite: 6]
      if (now - _lastPpgMs >= INTERVAL_PPG_MS) {
        PpgBatch b;
        if (ppgReadBatch(b) > 0) {
          if (_bleConnected) ppgChar.setValue(buildPpgJsonBatch(b, _ppgSeqNum++));
        }
        _lastPpgMs = now;
      }
      break;
  }
}

// ═══════════════════════════════════════════════════════════
//  State transition helpers
// ═══════════════════════════════════════════════════════════
const char* stateName(SysState s) {
  switch (s) {
    case STATE_BASELINE_CREATION: return "BASELINE_CREATION";
    case STATE_WORK_MODE:         return "WORK_MODE";
    case STATE_CHECK_MODE:        return "CHECK_MODE";
    case STATE_IDLE:              return "IDLE";
    default:                      return "UNKNOWN";
  }
}

bool canTransition(SysState from, SysState to) {
  switch (from) {
    case STATE_BASELINE_CREATION: return to == STATE_WORK_MODE;
    case STATE_WORK_MODE:         return to == STATE_CHECK_MODE || to == STATE_IDLE;
    case STATE_CHECK_MODE:        return to == STATE_WORK_MODE  || to == STATE_IDLE;
    case STATE_IDLE:              return to == STATE_WORK_MODE;
    default:                      return false;
  }
}

// Every state change goes through here. Whatever the outcome, the CURRENT state is
// announced again on stateChar, so an app that missed a notification (or asked for
// something that is not allowed) re-syncs immediately instead of waiting for a timeout.
bool requestState(SysState to, const char* why) {
  if (to == _globalState) {
    stateChar.setValue(stateName(_globalState));
    return true;
  }
  if (!canTransition(_globalState, to)) {
    Serial.print("[TIER 1] REJECTED: ");
    Serial.print(stateName(_globalState));
    Serial.print(" -> ");
    Serial.print(stateName(to));
    Serial.print(" (");
    Serial.print(why);
    Serial.println(")");
    stateChar.setValue(stateName(_globalState));
    return false;
  }
  Serial.print("[TIER 1] ");
  Serial.print(why);
  Serial.print(": ");
  Serial.print(stateName(_globalState));
  Serial.print(" -> ");
  Serial.println(stateName(to));
  _globalState = to;
  _stateJustChanged = true;
  return true;
}

// ═══════════════════════════════════════════════════════════
void onBleCommandReceived(BLEDevice central, BLECharacteristic characteristic) {
  uint8_t cmd = cmdChar.value();

  if      (cmd == 1) requestState(STATE_WORK_MODE,  "App command 1");
  else if (cmd == 2) requestState(STATE_CHECK_MODE, "App command 2");
  else if (cmd == 3) requestState(STATE_IDLE,       "App command 3");
  else {
    Serial.print("[TIER 1] Unknown command ignored: ");
    Serial.println(cmd);
  }
}

// ═══════════════════════════════════════════════════════════
bool initBLE() {
  if (!BLE.begin()) return false;
  BLE.setLocalName(BLE_DEVICE_NAME);
  BLE.setAdvertisedService(healthService);

  healthService.addCharacteristic(tofChar);
  healthService.addCharacteristic(imuChar);
  healthService.addCharacteristic(ppgChar);
  healthService.addCharacteristic(stateChar);
  healthService.addCharacteristic(cmdChar);

  BLE.addService(healthService);
  tofChar.setValue("{}"); imuChar.setValue("{}"); ppgChar.setValue("{}");

  BLE.setEventHandler(BLEConnected, onBleConnected);
  BLE.setEventHandler(BLEDisconnected, onBleDisconnected);
  cmdChar.setEventHandler(BLEWritten, onBleCommandReceived);

  BLE.advertise();
  return true;
}

void onBleConnected(BLEDevice central) { _bleConnected = true; }
void onBleDisconnected(BLEDevice central) {
  _bleConnected = false;
  _disconnectedSince = millis();
  if (_globalState == STATE_CHECK_MODE) requestState(STATE_WORK_MODE, "link lost during check");
  BLE.advertise();
}

String buildTofJson(float distanceCm, const char* status) {
  return "{\"distance_cm\":" + String(distanceCm, 1) + ",\"status\":\"" + String(status) + "\"}";
}

String buildImuJson(const ImuReading &r) {
  return "{\"pitch_deg\":" + String(r.pitchDeg, 1) + ",\"fhp_status\":\"" + String(fhpStatusToString(r.fhpStatus)) + "\"}";
}

// NEW: JSON builder formatted explicitly for the app batch parser
String buildPpgJsonBatch(const PpgBatch &b, uint32_t seq) {
  String json = "{\"s\":" + String(seq) + ",\"ir\":[";
  for (int i = 0; i < b.n; i++) {
    json += String(b.ir[i]);
    if (i < b.n - 1) json += ",";
  }
  json += "],\"contact_status\":\"" + String(contactStatusToString(b.contactStatus)) + "\"}";
  return json;
}
