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
#define MPU_ADDR        0x68
#define REG_PWR_MGMT_1  0x6B
#define REG_ACCEL_XOUT  0x3B     // Register awal akselerometer (6 byte: ax, ay, az)
#define REG_GYRO_XOUT   0x43     // Register awal gyroscope    (6 byte: gx, gy, gz)
#define ACCEL_SCALE     16384.0f // Sensitivitas ±2g default (LSB/g)
#define GYRO_SCALE      131.0f   // Sensitivitas ±250°/s default (LSB/°/s)

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
