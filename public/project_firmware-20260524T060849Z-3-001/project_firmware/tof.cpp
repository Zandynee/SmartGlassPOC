#include "tof.h"
#include <Wire.h>

// ─────────────────────────────────────────
//  Instance sensor (internal, tidak expose ke luar)
// ─────────────────────────────────────────
static VL53L0X _sensor;
static bool    _initialized = false;

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

  // Mode balanced — 20ms budget cocok untuk polling 50ms (20 Hz)
  // Akurasi sedikit berkurang (~±3 mm) tapi masih lebih dari cukup untuk deteksi postur
  _sensor.setMeasurementTimingBudget(20000);  // 20ms per pengukuran

  _initialized = true;
  Serial.println("[TOF] Sensor siap.");
  return true;
}

// ─────────────────────────────────────────
//  tofRead()
//  Baca jarak satu kali, kembalikan TofReading.
//  Harus dipanggil setelah tofInit() berhasil.
// ─────────────────────────────────────────
TofReading tofRead() {
  TofReading result = { 0.0f, TofStatus::SENSOR_ERROR };

  if (!_initialized) {
    Serial.println("[TOF] ERROR: Sensor belum diinisialisasi.");
    return result;
  }

  uint16_t rawMm = _sensor.readRangeSingleMillimeters();

  // Cek timeout Pololu (nilai > 8190 mm biasanya indikasi timeout)
  if (_sensor.timeoutOccurred() || rawMm > 8190) {
    Serial.println("[TOF] WARNING: Timeout atau pembacaan tidak valid.");
    result.status = TofStatus::SENSOR_ERROR;
    return result;
  }

  float distanceCm = rawMm / 10.0f;
  result.distanceCm = distanceCm;

  // Evaluasi status berdasarkan threshold
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