#include "imu.h"
#include <Wire.h>

// ─────────────────────────────────────────
//  State internal
// ─────────────────────────────────────────
static bool _initialized = false;

// ─────────────────────────────────────────
//  Helper: tulis satu byte ke register MPU
// ─────────────────────────────────────────
static bool _writeRegister(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  Wire.write(value);
  uint8_t err = Wire.endTransmission();
  return (err == 0);
}

// ─────────────────────────────────────────
//  Helper: evaluasi pitch ke FhpStatus
// ─────────────────────────────────────────
static FhpStatus _evaluateFhp(float pitchDeg) {
  float absPitch = abs(pitchDeg);
  if (absPitch >= IMU_FHP_CRITICAL_DEG) return FhpStatus::CRITICAL;
  if (absPitch >= IMU_FHP_WARNING_DEG)  return FhpStatus::WARNING;
  return FhpStatus::NORMAL;
}

// ─────────────────────────────────────────
//  imuInit()
//  Wake up MPU-6050 dari sleep mode via I2C.
//  Kembalikan true jika berhasil.
// ─────────────────────────────────────────
bool imuInit() {
  Wire.beginTransmission(MPU_ADDR);
  uint8_t err = Wire.endTransmission();

  if (err != 0) {
    Serial.println("[IMU] ERROR: MPU-6050 tidak ditemukan. Periksa wiring/daya.");
    _initialized = false;
    return false;
  }

  // Clear sleep bit — MPU-6050 default menyala dalam mode sleep
  if (!_writeRegister(REG_PWR_MGMT_1, 0x00)) {
    Serial.println("[IMU] ERROR: Gagal wake up MPU-6050.");
    _initialized = false;
    return false;
  }

  delay(100); // Tunggu sensor stabil setelah wake up

  _initialized = true;
  Serial.println("[IMU] Sensor siap.");
  return true;
}

// ─────────────────────────────────────────
//  imuRead()
//  Baca data akselerometer 3-axis, hitung pitch,
//  evaluasi status FHP. Kembalikan ImuReading.
// ─────────────────────────────────────────
ImuReading imuRead() {
  ImuReading result = { 0, 0, 0, 0, 0, 0, 0, FhpStatus::SENSOR_ERROR };

  if (!_initialized) {
    Serial.println("[IMU] ERROR: Sensor belum diinisialisasi.");
    return result;
  }

  // ── Baca Akselerometer (register 0x3B, 6 byte) ──
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(REG_ACCEL_XOUT);
  Wire.endTransmission(false);
  Wire.requestFrom(MPU_ADDR, 6, true);

  if (Wire.available() < 6) {
    Serial.println("[IMU] ERROR: Data akselerometer tidak lengkap.");
    return result;
  }

  int16_t rawAx = (Wire.read() << 8) | Wire.read();
  int16_t rawAy = (Wire.read() << 8) | Wire.read();
  int16_t rawAz = (Wire.read() << 8) | Wire.read();

  result.ax = rawAx / ACCEL_SCALE;
  result.ay = rawAy / ACCEL_SCALE;
  result.az = rawAz / ACCEL_SCALE;

  // ── Baca Gyroscope (register 0x43, 6 byte) ──
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(REG_GYRO_XOUT);
  Wire.endTransmission(false);
  Wire.requestFrom(MPU_ADDR, 6, true);

  if (Wire.available() < 6) {
    Serial.println("[IMU] ERROR: Data gyroscope tidak lengkap.");
    return result;
  }

  int16_t rawGx = (Wire.read() << 8) | Wire.read();
  int16_t rawGy = (Wire.read() << 8) | Wire.read();
  int16_t rawGz = (Wire.read() << 8) | Wire.read();

  result.gx = rawGx / GYRO_SCALE;
  result.gy = rawGy / GYRO_SCALE;
  result.gz = rawGz / GYRO_SCALE;

  // ── Hitung Pitch dari akselerometer ──
  // Formula: atan2(ax, sqrt(ay² + az²))
  result.pitchDeg = atan2(result.ax,
                          sqrt(result.ay * result.ay + result.az * result.az))
                    * 180.0f / PI;

  // ── Evaluasi status FHP dari pitch ──
  result.fhpStatus = _evaluateFhp(result.pitchDeg);

  return result;
}

// ─────────────────────────────────────────
//  fhpStatusToString()
//  Konversi enum status ke string (untuk debug / BLE)
// ─────────────────────────────────────────
const char* fhpStatusToString(FhpStatus status) {
  switch (status) {
    case FhpStatus::NORMAL:       return "NORMAL";
    case FhpStatus::WARNING:      return "WARNING";
    case FhpStatus::CRITICAL:     return "CRITICAL";
    case FhpStatus::SENSOR_ERROR: return "SENSOR_ERROR";
    default:                      return "UNKNOWN";
  }
}
