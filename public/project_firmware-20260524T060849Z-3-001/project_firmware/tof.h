#pragma once

#include <Arduino.h>
#include <VL53L0X.h>

// ─────────────────────────────────────────
//  Threshold (override dari config.h nanti)
// ─────────────────────────────────────────
#ifndef TOF_SAFE_DISTANCE_CM
  #define TOF_SAFE_DISTANCE_CM 30
#endif

#ifndef TOF_MAX_RANGE_CM
  #define TOF_MAX_RANGE_CM 120   // Di atas ini dianggap out-of-range
#endif

// ─────────────────────────────────────────
//  Status hasil pembacaan
// ─────────────────────────────────────────
enum class TofStatus {
  OK,
  TOO_CLOSE,
  OUT_OF_RANGE,
  SENSOR_ERROR
};

// ─────────────────────────────────────────
//  Struct hasil pembacaan ToF
// ─────────────────────────────────────────
struct TofReading {
  float     distanceCm;   // Jarak dalam cm
  TofStatus status;       // Status hasil baca
};

// ─────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────
bool       tofInit();
TofReading tofRead();
const char* tofStatusToString(TofStatus status);
