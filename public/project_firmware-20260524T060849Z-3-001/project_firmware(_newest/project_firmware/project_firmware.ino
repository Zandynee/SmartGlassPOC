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
// ─────────────────────────────────────────
enum SysState {
  STATE_BASELINE_CREATION, 
  STATE_WORK_MODE,         
  STATE_CHECK_MODE         
};

SysState _globalState = STATE_BASELINE_CREATION; 
bool _stateJustChanged = true;

// Intervals
#define INTERVAL_TOF_MS   200
#define INTERVAL_IMU_MS   100
// UPDATED: Now fetches batches every 100ms (approx 10Hz notification rate)[cite: 6]
#define INTERVAL_PPG_MS   100 
#define SERIAL_WAIT_TIMEOUT_MS 3000

static unsigned long _lastTofMs = 0;
static unsigned long _lastImuMs = 0;
static unsigned long _lastPpgMs = 0;
static float _lastDistanceCm = 999.0f;
static volatile bool _bleConnected = false;

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
    case STATE_WORK_MODE:
      if (_stateJustChanged) {
        stateChar.setValue("WORK_MODE");
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
        digitalWrite(HAPTIC_PIN, LOW); // Force haptic off
        
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
void onBleCommandReceived(BLEDevice central, BLECharacteristic characteristic) {
  uint8_t cmd = cmdChar.value();
  
  if (cmd == 1) { 
    _globalState = STATE_WORK_MODE;
    _stateJustChanged = true;
    Serial.println("[TIER 1] App command: Transition to WORK_MODE");
  } 
  else if (cmd == 2) { 
    _globalState = STATE_CHECK_MODE;
    _stateJustChanged = true;
    Serial.println("[TIER 1] App command: Transition to CHECK_MODE");
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
void onBleDisconnected(BLEDevice central) { _bleConnected = false; BLE.advertise(); }

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