#pragma once

#include <Arduino.h>

// ─────────────────────────────────────────
//  Threshold (override dari config.h nanti)
// ─────────────────────────────────────────
#ifndef IMU_FHP_WARNING_DEG
  #define IMU_FHP_WARNING_DEG 15.0f   // Pitch > nilai ini = FHP terdeteksi
#endif

#ifndef IMU_FHP_CRITICAL_DEG
  #define IMU_FHP_CRITICAL_DEG 30.0f  // Pitch > nilai ini = FHP parah
#endif

// ─────────────────────────────────────────
//  Register MPU-6050
// ─────────────────────────────────────────
#define MPU_ADDR         0x68
#define REG_PWR_MGMT_1   0x6B
#define REG_CONFIG       0x1A     // DLPF (Digital Low-Pass Filter) config
#define REG_GYRO_CONFIG  0x1B     // Gyro full-scale select
#define REG_ACCEL_CONFIG 0x1C     // Accel full-scale select
#define REG_ACCEL_XOUT   0x3B     // Register awal akselerometer (6 byte: ax, ay, az)
#define REG_GYRO_XOUT    0x43     // Register awal gyroscope    (6 byte: gx, gy, gz)

// Gyro: ±500 °/s (FS_SEL=1) — lebih cocok untuk gerakan kepala cepat
// Rumus: rawValue / GYRO_SCALE = nilai dalam °/s
#define GYRO_FS_SEL      0x08     // FS_SEL = 1 → ±500 °/s
#define GYRO_SCALE       65.5f    // 65.5 LSB/°/s pada ±500 °/s

// Accel: ±2g (AFS_SEL=0) — cukup untuk deteksi pitch/postur
#define ACCEL_FS_SEL     0x00     // AFS_SEL = 0 → ±2g
#define ACCEL_SCALE      16384.0f // 16384 LSB/g pada ±2g

// DLPF_CFG = 1 → bandwidth 188 Hz, delay 1.9 ms
// Cukup responsif untuk 50 Hz sampling, tapi filter noise tinggi
#define DLPF_CFG         0x01

// ─────────────────────────────────────────
//  Status FHP
// ─────────────────────────────────────────
enum class FhpStatus {
  NORMAL,
  WARNING,
  CRITICAL,
  SENSOR_ERROR
};

// ─────────────────────────────────────────
//  Struct hasil pembacaan IMU
// ─────────────────────────────────────────
struct ImuReading {
  float     ax, ay, az;   // Akselerasi dalam satuan g
  float     gx, gy, gz;   // Kecepatan sudut dalam °/s
  float     pitchDeg;     // Sudut pitch dalam derajat
  FhpStatus fhpStatus;    // Status postur kepala
};

// ─────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────
bool       imuInit();
ImuReading imuRead();
const char* fhpStatusToString(FhpStatus status);