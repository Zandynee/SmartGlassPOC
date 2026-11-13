#pragma once

#include <Arduino.h>

// ─────────────────────────────────────────
//  Konfigurasi Pin
// ─────────────────────────────────────────
#ifndef HAPTIC_PIN
  #define HAPTIC_PIN  D2
#endif

// ─────────────────────────────────────────
//  Threshold jarak pemicu getaran (cm)
//  Zona: TOO_CLOSE  → < 20 cm  → getar terus
//        WARNING    → 20–30 cm → getar berpola (pulse)
//        SAFE       → > 30 cm  → diam
// ─────────────────────────────────────────
#ifndef HAPTIC_ZONE_CLOSE_CM
  #define HAPTIC_ZONE_CLOSE_CM   20.0f
#endif

#ifndef HAPTIC_ZONE_WARNING_CM
  #define HAPTIC_ZONE_WARNING_CM 30.0f
#endif

// Durasi pulse untuk zona WARNING (ms)
#ifndef HAPTIC_PULSE_ON_MS
  #define HAPTIC_PULSE_ON_MS  200
#endif

#ifndef HAPTIC_PULSE_OFF_MS
  #define HAPTIC_PULSE_OFF_MS 400
#endif

// ─────────────────────────────────────────
//  Zona haptic
// ─────────────────────────────────────────
enum class HapticZone {
  SAFE,       // > 30cm  → diam
  WARNING,    // 20–30cm → pulse
  TOO_CLOSE   // < 20cm  → kontinyu
};

// ─────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────
void       hapticInit();
void       hapticUpdate(float distanceCm);
HapticZone hapticEvaluateZone(float distanceCm);
const char* hapticZoneToString(HapticZone zone);
void       hapticStop();   // motor off + reset pulse state (call on every state change)
