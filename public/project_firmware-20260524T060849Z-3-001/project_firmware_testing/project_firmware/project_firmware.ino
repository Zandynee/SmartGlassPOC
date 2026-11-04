//  Smart Glasses Health Monitor — semua sensor aktif sejak boot (tanpa state machine)
//
//  Dua keluaran data:
//   1) BLE  : JSON seperti sebelumnya (untuk app).
//   2) Serial 115200 : aliran MENTAH untuk rekam_sinkron.py, satu baris per sampel:
//        P,<t_us>,<ir>                            PPG 100 sps
//        M,<t_us>,<ax>,<ay>,<az>,<gx>,<gy>,<gz>   IMU  50 Hz (g dan derajat/detik)
//        S,<t_us>                                 balasan untuk perintah 'S' dari laptop
//      t_us = jam perangkat (mikrodetik, 64-bit, tidak wrap) — samping t_host_ns di Python.
//      Tidak ada teks lain yang dicetak saat jalan (selain pesan boot) agar baris tidak rusak.
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
#define BLE_CHAR_STATE_UUID "19b10004-e8f2-537e-4f6c-d104768a1214"
#define BLE_CHAR_CMD_UUID   "19b10005-e8f2-537e-4f6c-d104768a1214" // dipertahankan, perintah diabaikan

BLEService healthService(BLE_SERVICE_UUID);

BLEStringCharacteristic tofChar(BLE_CHAR_TOF_UUID, BLERead | BLENotify, 64);
BLEStringCharacteristic imuChar(BLE_CHAR_IMU_UUID, BLERead | BLENotify, 128);
BLEStringCharacteristic ppgChar(BLE_CHAR_PPG_UUID, BLERead | BLENotify, 256);

BLEStringCharacteristic stateChar(BLE_CHAR_STATE_UUID, BLERead | BLENotify, 32);
BLEByteCharacteristic   cmdChar(BLE_CHAR_CMD_UUID, BLEWrite);

// ─────────────────────────────────────────
//  Laju sampel (harus sama dengan NOMINAL di rekam_sinkron.py)
// ─────────────────────────────────────────
#define PPG_PERIOD_US     10000UL   // 100 sps
#define IMU_PERIOD_US     20000UL   // 50 Hz
#define INTERVAL_PPG_MS   100       // kuras FIFO PPG tiap 100 ms (~10 sampel)
#define BLE_IMU_DIV       5         // IMU ke BLE tiap 5 sampel = 10 Hz
#define SERIAL_WAIT_TIMEOUT_MS 3000

static unsigned long _lastPpgMs = 0;
static float _lastDistanceCm = 999.0f;
static volatile bool _bleConnected = false;
static uint32_t _ppgSeqNum = 0;

// ─────────────────────────────────────────
//  Jam perangkat 64-bit (mikrodetik, tidak wrap setelah 71 menit)
// ─────────────────────────────────────────
static uint64_t nowUs64() {
  static uint32_t lastLo = 0;
  static uint32_t hi = 0;
  uint32_t lo = micros();
  if (lo < lastLo) hi++;
  lastLo = lo;
  return ((uint64_t)hi << 32) | lo;
}

static void printU64(uint64_t v) {
  char buf[21];
  int i = 20;
  buf[i] = 0;
  do { buf[--i] = '0' + (char)(v % 10); v /= 10; } while (v);
  Serial.print(&buf[i]);
}

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
  // hapticInit();
  initBLE();

  tofWake();
  imuWake();
  ppgWake();     // sekaligus mem-flush FIFO PPG
  stateChar.setValue("ACTIVE");

  Serial.println("[SYSTEM] Semua sensor aktif: TOF, IMU, PPG");
}

// ═══════════════════════════════════════════════════════════
//  PPG: beri cap waktu tiap sampel.
//  FIFO MAX30102 tidak membawa cap waktu, jadi waktu sampel dihitung mundur dari saat FIFO dibaca
//  (sampel terbaru = saat baca, sampel sebelumnya mundur 10 ms), lalu dihaluskan dengan koreksi
//  lambat (1/16 per paket) agar jitter pembacaan tidak masuk ke data. Bila FIFO overflow atau
//  waktu melompat >30 ms, jam di-resync keras sehingga celah (sampel hilang) tampak di Python.
// ═══════════════════════════════════════════════════════════
static bool    _ppgClkValid = false;
static int64_t _ppgNext = 0;      // cap waktu sampel berikutnya (us)

static void servicePpg() {
  PpgBatch b;
  uint64_t tRead = nowUs64();
  if (ppgReadBatch(b) <= 0) return;

  int64_t first = (int64_t)tRead - (int64_t)(b.n + b.remaining - 1) * (int64_t)PPG_PERIOD_US;
  if (!_ppgClkValid || b.overflow) {
    _ppgNext = first;
    _ppgClkValid = true;
  } else {
    int64_t err = first - _ppgNext;
    if (err > 30000 || err < -30000) _ppgNext = first;
    else _ppgNext += err / 16;
  }

  // ── Serial: satu baris per sampel ──
  for (int i = 0; i < b.n; i++) {
    Serial.print("P,");
    printU64((uint64_t)(_ppgNext + (int64_t)i * (int64_t)PPG_PERIOD_US));
    Serial.print(',');
    Serial.println(b.ir[i]);
  }
  _ppgNext += (int64_t)b.n * (int64_t)PPG_PERIOD_US;

  // ── BLE: batch JSON ──
  String payload = buildPpgJsonBatch(b, _ppgSeqNum++);
  if (_bleConnected) ppgChar.setValue(payload);
}

// ═══════════════════════════════════════════════════════════
static uint64_t _nextImuUs = 0;
static uint8_t  _imuBleCount = 0;

static void serviceImu(uint64_t nowUs) {
  if (_nextImuUs == 0 || nowUs - _nextImuUs > 100000ULL) _nextImuUs = nowUs;  // start / catch-up
  _nextImuUs += IMU_PERIOD_US;

  ImuReading r = imuRead();
  if (r.fhpStatus == FhpStatus::SENSOR_ERROR) return;   // jangan kirim nol palsu

  Serial.print("M,");
  printU64(nowUs);
  Serial.print(','); Serial.print(r.ax, 5);
  Serial.print(','); Serial.print(r.ay, 5);
  Serial.print(','); Serial.print(r.az, 5);
  Serial.print(','); Serial.print(r.gx, 3);
  Serial.print(','); Serial.print(r.gy, 3);
  Serial.print(','); Serial.println(r.gz, 3);

  if (++_imuBleCount >= BLE_IMU_DIV) {
    _imuBleCount = 0;
    if (_bleConnected) imuChar.setValue(buildImuJson(r));
  }
}

// ═══════════════════════════════════════════════════════════
void loop() {
  BLE.poll();

  // ── Perintah sinkron dari laptop: balas segera dengan jam perangkat ──
  while (Serial.available()) {
    if (Serial.read() == 'S') {
      Serial.print("S,");
      printU64(nowUs64());
      Serial.println();
    }
  }

  uint64_t nowUs = nowUs64();
  unsigned long nowMs = millis();

  // ── PPG ──
  if (nowMs - _lastPpgMs >= INTERVAL_PPG_MS) {
    servicePpg();
    _lastPpgMs = nowMs;
  }

  // ── IMU ──
  if (nowUs >= _nextImuUs) serviceImu(nowUs);

  // ── ToF (mode kontinu, tidak memblokir) ──
  if (tofDataReady()) {
    TofReading r = tofRead();
    _lastDistanceCm = (r.status == TofStatus::SENSOR_ERROR) ? 999.0f : r.distanceCm;
    if (_bleConnected) tofChar.setValue(buildTofJson(r.distanceCm, tofStatusToString(r.status)));
  }

  // ── Haptic (non-blocking) ──
  // hapticUpdate(_lastDistanceCm)
}

// ═══════════════════════════════════════════════════════════
void onBleCommandReceived(BLEDevice central, BLECharacteristic characteristic) {
  // Perintah app diabaikan — tidak ada lagi perpindahan state. (Tidak mencetak ke serial.)
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

String buildPpgJsonBatch(const PpgBatch &b, uint32_t seq) {
  String json = "{\"s\":" + String(seq) + ",\"ir\":[";
  for (int i = 0; i < b.n; i++) {
    json += String(b.ir[i]);
    if (i < b.n - 1) json += ",";
  }
  json += "],\"contact_status\":\"" + String(contactStatusToString(b.contactStatus)) + "\"}";
  return json;
}
