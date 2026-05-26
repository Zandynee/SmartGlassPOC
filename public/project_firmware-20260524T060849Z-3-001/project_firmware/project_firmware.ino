// ═══════════════════════════════════════════════════════════
//  Smart Glasses Health Monitor — Main Firmware
//  Target MCU : XIAO nRF52840
//  Author     : [Nama Tim]
//  Version    : 0.1.0 (POC)
// ═══════════════════════════════════════════════════════════

#include <Wire.h>
#include <ArduinoBLE.h>

#include "tof.h"
#include "imu.h"
#include "ppg.h"

// ─────────────────────────────────────────
//  Konfigurasi BLE
//  TODO: Ganti UUID di bawah dengan UUID dari tim web
//        UUID bisa di-generate di: https://www.uuidgenerator.net/
// ─────────────────────────────────────────
#define BLE_DEVICE_NAME         "SmartGlasses"
#define BLE_SERVICE_UUID        "19b10000-e8f2-537e-4f6c-d104768a1214"
#define BLE_CHAR_TOF_UUID       "19b10001-e8f2-537e-4f6c-d104768a1214"
#define BLE_CHAR_IMU_UUID       "19b10002-e8f2-537e-4f6c-d104768a1214"
#define BLE_CHAR_PPG_UUID       "19b10003-e8f2-537e-4f6c-d104768a1214"

// ─────────────────────────────────────────
//  Konfigurasi interval pembacaan sensor
// ─────────────────────────────────────────
#define INTERVAL_TOF_MS   50     // Baca ToF setiap 50ms  (20 Hz)
#define INTERVAL_IMU_MS   20     // Baca IMU setiap 20ms  (50 Hz)
#define INTERVAL_PPG_MS   100    // Baca PPG setiap 100ms (10 Hz, non-blocking, raw data)

// ─────────────────────────────────────────
//  BLE Service & Characteristics
//  Setiap characteristic mengirim JSON string
// ─────────────────────────────────────────
BLEService healthService(BLE_SERVICE_UUID);

BLEStringCharacteristic tofChar(
  BLE_CHAR_TOF_UUID,
  BLERead | BLENotify,
  64    // max panjang string JSON
);

BLEStringCharacteristic imuChar(
  BLE_CHAR_IMU_UUID,
  BLERead | BLENotify,
  128   // diperbesar untuk menampung field gyroscope tambahan
);

BLEStringCharacteristic ppgChar(
  BLE_CHAR_PPG_UUID,
  BLERead | BLENotify,
  64
);

// ─────────────────────────────────────────
//  Timestamp terakhir pembacaan tiap sensor
// ─────────────────────────────────────────
static unsigned long _lastTofMs = 0;
static unsigned long _lastImuMs = 0;
static unsigned long _lastPpgMs = 0;

// ─────────────────────────────────────────
//  Forward declaration fungsi lokal
// ─────────────────────────────────────────
bool     initBLE();
void     handleTof();
void     handleImu();
void     handlePpg();
String   buildTofJson(const TofReading &r);
String   buildImuJson(const ImuReading &r);
String   buildPpgJson(const PpgReading &r);

// ═══════════════════════════════════════════════════════════
//  SETUP
// ═══════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  while (!Serial) delay(10);

  Serial.println("============================");
  Serial.println(" Smart Glasses — Booting...");
  Serial.println("============================");

  Wire.begin();

  // ── Inisialisasi Sensor ──
  bool tofOk = tofInit();
  bool imuOk = imuInit();
  bool ppgOk = ppgInit();

  if (!tofOk) Serial.println("[BOOT] WARNING: ToF gagal init.");
  if (!imuOk) Serial.println("[BOOT] WARNING: IMU gagal init.");
  if (!ppgOk) Serial.println("[BOOT] WARNING: PPG gagal init.");

  // ── Inisialisasi BLE ──
  if (!initBLE()) {
    Serial.println("[BOOT] FATAL: BLE gagal init. System halt.");
    while (1);   // Berhenti jika BLE gagal — tidak ada gunanya lanjut
  }

  Serial.println("[BOOT] Siap. Menunggu koneksi BLE...");
}

// ═══════════════════════════════════════════════════════════
//  LOOP
// ═══════════════════════════════════════════════════════════
void loop() {
  // Cek dan update koneksi BLE
  BLEDevice central = BLE.central();

  if (central) {
    Serial.print("[BLE] Terhubung ke: ");
    Serial.println(central.address());

    // Selama central terhubung, baca sensor sesuai interval
    while (central.connected()) {
      unsigned long now = millis();

      if (now - _lastTofMs >= INTERVAL_TOF_MS) {
        handleTof();
        _lastTofMs = now;
      }

      if (now - _lastImuMs >= INTERVAL_IMU_MS) {
        handleImu();
        _lastImuMs = now;
      }

      if (now - _lastPpgMs >= INTERVAL_PPG_MS) {
        handlePpg();
        _lastPpgMs = now;
      }
    }

    Serial.println("[BLE] Koneksi terputus.");
  }
}

// ═══════════════════════════════════════════════════════════
//  INISIALISASI BLE
// ═══════════════════════════════════════════════════════════
bool initBLE() {
  if (!BLE.begin()) {
    Serial.println("[BLE] ERROR: Gagal memulai BLE.");
    return false;
  }

  BLE.setLocalName(BLE_DEVICE_NAME);
  BLE.setAdvertisedService(healthService);

  // Daftarkan semua characteristic ke service
  healthService.addCharacteristic(tofChar);
  healthService.addCharacteristic(imuChar);
  healthService.addCharacteristic(ppgChar);

  // Daftarkan service ke BLE stack
  BLE.addService(healthService);

  // Set nilai awal characteristic (kosong)
  tofChar.setValue("{}");
  imuChar.setValue("{}");
  ppgChar.setValue("{}");

  BLE.advertise();
  Serial.print("[BLE] Advertising sebagai: ");
  Serial.println(BLE_DEVICE_NAME);
  return true;
}

// ═══════════════════════════════════════════════════════════
//  HANDLER SENSOR
// ═══════════════════════════════════════════════════════════

// ── ToF ──
void handleTof() {
  TofReading r = tofRead();
  String json  = buildTofJson(r);

  tofChar.setValue(json);   // Notify otomatis ke client

  // Serial.print("[TOF] ");
  // Serial.println(json);
}

// ── IMU ──
void handleImu() {
  ImuReading r = imuRead();
  String json  = buildImuJson(r);

  imuChar.setValue(json);

  // Serial.print("[IMU] ");
  // Serial.println(json);
}

// ── PPG ──
void handlePpg() {
  PpgReading r = ppgRead();
  String json  = buildPpgJson(r);

  ppgChar.setValue(json);

  Serial.print("[PPG] ");
  Serial.println(json);
}

// ═══════════════════════════════════════════════════════════
//  JSON BUILDER
//  Format JSON sederhana tanpa library tambahan
// ═══════════════════════════════════════════════════════════

String buildTofJson(const TofReading &r) {
  String s = "{";
  s += "\"distance_cm\":"  + String(r.distanceCm, 1) + ",";
  s += "\"status\":\""     + String(tofStatusToString(r.status)) + "\"";
  s += "}";
  return s;
}

String buildImuJson(const ImuReading &r) {
  String s = "{";
  s += "\"pitch_deg\":"     + String(r.pitchDeg, 1) + ",";
  s += "\"ax\":"            + String(r.ax, 3)        + ",";
  s += "\"ay\":"            + String(r.ay, 3)        + ",";
  s += "\"az\":"            + String(r.az, 3)        + ",";
  s += "\"gx\":"            + String(r.gx, 2)        + ",";
  s += "\"gy\":"            + String(r.gy, 2)        + ",";
  s += "\"gz\":"            + String(r.gz, 2)        + ",";
  s += "\"fhp_status\":\"" + String(fhpStatusToString(r.fhpStatus)) + "\"";
  s += "}";
  return s;
}

String buildPpgJson(const PpgReading &r) {
  String s = "{";
  s += "\"ir\":"               + String(r.irValue)                              + ",";
  s += "\"red\":"              + String(r.redValue)                             + ",";
  s += "\"contact_status\":\"" + String(contactStatusToString(r.contactStatus)) + "\"";
  s += "}";
  return s;
}
