// ─────────────────────────────────────────────
//  tofService.js  –  Time-of-Flight sensor logic
//  Covers: VL53L0X / tof.h + tof.cpp
//
//  Responsibilities:
//    • DEFAULT_TOF state
//    • nextSimulatedTof() — sim loop
//    • parseBleTof()      — parse firmware JSON
//
//  Firmware JSON format (buildTofJson in firmware):
//    {"distance_cm":X,"status":"OK"}
// ─────────────────────────────────────────────

/** Default ToF state (sensor not yet active). */
export const DEFAULT_TOF = {
  distanceCm: 0,
  status:     'UNKNOWN',
}

// ── Simulation ────────────────────────────────

/**
 * Produce the next simulated ToF reading (call every 50 ms).
 * Mirrors the 10–50 cm dummy range from the firmware POC.
 */
export function nextSimulatedTof(prev) {
  const delta      = (Math.random() - 0.5) * 6
  const raw        = (prev?.distanceCm ?? 30) + delta
  const distanceCm = Math.min(50, Math.max(10, raw))
  return { distanceCm, status: 'OK' }
}

// ── BLE parser ────────────────────────────────

/**
 * Parse the ToF JSON characteristic emitted by buildTofJson() in firmware.
 * Returns null on parse failure or missing required fields.
 */
export function parseBleTof(raw) {
  try {
    const d = JSON.parse(raw)
    if (d.distance_cm === undefined) return null
    return {
      distanceCm: d.distance_cm,
      status:     d.status ?? 'UNKNOWN',
    }
  } catch {
    return null
  }
}