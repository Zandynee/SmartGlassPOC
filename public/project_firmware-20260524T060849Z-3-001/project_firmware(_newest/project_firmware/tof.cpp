#include "tof.h"
#include <Wire.h>

// ─────────────────────────────────────────
//  Instance sensor (internal, tidak expose ke luar)
// ─────────────────────────────────────────
static VL53L0X _sensor;
static bool    _initialized = false;
static bool    _tofSleeping = false; // MOVED HERE: global scope declaration

// ─────────────────────────────────────────
//  tofInit()
//  Inisialisasi sensor VL53L0X via I2C.
//  Kembalikan true jika berhasil.
// ─────────────────────────────────────────
bool tofInit() {
  _sensor.setTimeout(500);

  if (!_sensor.init()) {
    Serial.println("[TOF] ERROR: Sensor tidak ditemukan. Periksa wiring/daya.");
    _initialized = false;
    return false;
  }

  // Mode high accuracy — lebih lambat tapi presisi untuk jarak < 1.2m
  _sensor.setMeasurementTimingBudget(200000); // 200ms per pengukuran

  _initialized = true;
  Serial.println("[TOF] Sensor siap.");
  return true;
}

void tofSleep() {
  _tofSleeping = true;
  Serial.println("[TOF] Tier 2: Sleeping (I2C Gated)");
}

void tofWake() {
  _tofSleeping = false;
  Serial.println("[TOF] Tier 2: Waking up");
}

// ─────────────────────────────────────────
//  tofRead()
//  Baca jarak satu kali, kembalikan TofReading.
//  Harus dipanggil setelah tofInit() berhasil.
// ─────────────────────────────────────────
TofReading tofRead() {
  TofReading result = { 0.0f, TofStatus::SENSOR_ERROR };
  
  // FIXED: Corrected the brackets for the if statement
  if (!_initialized || _tofSleeping) {
    Serial.println("[TOF] ERROR: Sensor belum diinisialisasi atau sedang sleep.");
    return result;
  }

  uint16_t rawMm = _sensor.readRangeSingleMillimeters();

  // Cek timeout Pololu (nilai > 8190 mm biasanya indikasi timeout)
  if (_sensor.timeoutOccurred() || rawMm > 8190) {
    Serial.println("[TOF] WARNING: Timeout atau pembacaan tidak valid.");
    result.status = TofStatus::SENSOR_ERROR;
    return result;
  }

  // Hitung jarak dalam cm dan kurangi dengan offset kalibrasi 10cm
  float distanceCm = (rawMm / 10.0f) - TOF_OFFSET_CM;
  
  // Cegah nilai minus jika pembacaan asli lebih kecil dari offset
  if (distanceCm < 0.0f) {
    distanceCm = 0.0f;
  }
  
  result.distanceCm = distanceCm;

  // Evaluasi status berdasarkan threshold hasil kalibrasi
  if (distanceCm > TOF_MAX_RANGE_CM) {
    result.status = TofStatus::OUT_OF_RANGE;
  } else if (distanceCm < TOF_SAFE_DISTANCE_CM) {
    result.status = TofStatus::TOO_CLOSE;
  } else {
    result.status = TofStatus::OK;
  }

  return result;
}

// ─────────────────────────────────────────
//  tofStatusToString()
//  Konversi enum status ke string (untuk debug / BLE)
// ─────────────────────────────────────────
const char* tofStatusToString(TofStatus status) {
  switch (status) {
    case TofStatus::OK:            return "OK";
    case TofStatus::TOO_CLOSE:     return "TOO_CLOSE";
    case TofStatus::OUT_OF_RANGE:  return "OUT_OF_RANGE";
    case TofStatus::SENSOR_ERROR:  return "SENSOR_ERROR";
    default:                       return "UNKNOWN";
  }
}