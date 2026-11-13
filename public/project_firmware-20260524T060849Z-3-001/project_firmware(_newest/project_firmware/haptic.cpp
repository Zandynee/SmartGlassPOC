#include "haptic.h"

// ─────────────────────────────────────────
//  State internal
// ─────────────────────────────────────────
static HapticZone    _currentZone     = HapticZone::SAFE;
static unsigned long _lastPulseToggle = 0;
static bool          _pulseState      = false;

// ─────────────────────────────────────────
//  hapticInit()
//  Inisialisasi pin motor sebagai OUTPUT, pastikan
//  motor dalam keadaan mati saat boot.
// ─────────────────────────────────────────
void hapticInit() {
  pinMode(HAPTIC_PIN, OUTPUT);
  digitalWrite(HAPTIC_PIN, LOW);
  Serial.println("[HAPTIC] Motor siap.");
}

// ─────────────────────────────────────────
//  hapticStop()
//  Matikan motor dan reset state pulse. Dipanggil saat state
//  berubah supaya pulse tidak "bocor" ke state berikutnya.
// ─────────────────────────────────────────
void hapticStop() {
  digitalWrite(HAPTIC_PIN, LOW);
  _pulseState      = false;
  _lastPulseToggle = millis();
}

// ─────────────────────────────────────────
//  hapticEvaluateZone()
//  Tentukan zona berdasarkan jarak (cm).
// ─────────────────────────────────────────
HapticZone hapticEvaluateZone(float distanceCm) {
  if (distanceCm < HAPTIC_ZONE_CLOSE_CM)   return HapticZone::TOO_CLOSE;
  if (distanceCm < HAPTIC_ZONE_WARNING_CM) return HapticZone::WARNING;
  return HapticZone::SAFE;
}

// ─────────────────────────────────────────
//  hapticUpdate()
//  Dipanggil setiap loop — update zona dan
//  kontrol motor sesuai zona aktif.
//
//  Pola output:
//    SAFE      → LOW  (mati)
//    WARNING   → pulse 200ms ON / 400ms OFF
//    TOO_CLOSE → HIGH (nyala terus)
//
//  Fungsi ini non-blocking — menggunakan millis()
//  untuk pulse, tidak ada delay().
// ─────────────────────────────────────────
void hapticUpdate(float distanceCm) {
  _currentZone = hapticEvaluateZone(distanceCm);

  switch (_currentZone) {

    case HapticZone::SAFE:
      digitalWrite(HAPTIC_PIN, LOW);
      _pulseState = false;
      break;

    case HapticZone::TOO_CLOSE:
      digitalWrite(HAPTIC_PIN, HIGH);
      _pulseState = true;
      break;

    case HapticZone::WARNING: {
      unsigned long now     = millis();
      unsigned long elapsed = now - _lastPulseToggle;

      if (_pulseState && elapsed >= HAPTIC_PULSE_ON_MS) {
        // Matikan — masuk fase OFF
        digitalWrite(HAPTIC_PIN, LOW);
        _pulseState      = false;
        _lastPulseToggle = now;

      } else if (!_pulseState && elapsed >= HAPTIC_PULSE_OFF_MS) {
        // Nyalakan — masuk fase ON
        digitalWrite(HAPTIC_PIN, HIGH);
        _pulseState      = true;
        _lastPulseToggle = now;
      }
      break;
    }
  }
}

// ─────────────────────────────────────────
//  hapticZoneToString()
//  Konversi enum zona ke string (untuk debug / BLE)
// ─────────────────────────────────────────
const char* hapticZoneToString(HapticZone zone) {
  switch (zone) {
    case HapticZone::SAFE:      return "SAFE";
    case HapticZone::WARNING:   return "WARNING";
    case HapticZone::TOO_CLOSE: return "TOO_CLOSE";
    default:                    return "UNKNOWN";
  }
}
