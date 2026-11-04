// ─────────────────────────────────────────────
//  baselineStore.js  –  persists the user's baseline (made in BASELINE_CREATION)
//
//  Baseline = HRV at rest (SDNN / RMSSD / pNN50, glasses OFF, finger on sensor)
//           + upright posture (IMU pitch, glasses ON, sitting straight)
//  Stored locally only (localStorage). Never leaves the device.
//
//  Shape:
//   { version, createdAt,
//     hrv:     { hrBpm, meanIbiMs, sdnn, rmssd, pnn50, nBeats, quality },
//     posture: { pitchDeg, sdDeg, samples } }
// ─────────────────────────────────────────────

const KEY = 'visioguard.baseline.v1'
export const BASELINE_VERSION = 1

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

/** True if `b` has every field the rest of the app relies on. */
export function validateBaseline(b) {
  if (!b || typeof b !== 'object') return false
  if (b.version !== BASELINE_VERSION) return false
  const h = b.hrv, p = b.posture
  if (!h || !p) return false
  return (
    isNum(h.sdnn) && h.sdnn > 0 &&
    isNum(h.rmssd) && h.rmssd > 0 &&
    isNum(h.pnn50) &&
    isNum(h.hrBpm) &&
    isNum(p.pitchDeg)
  )
}

/** Builds a baseline object from the two wizard results. */
export function makeBaseline(hrvResult, posture) {
  return {
    version: BASELINE_VERSION,
    createdAt: Date.now(),
    hrv: {
      hrBpm: hrvResult.hrBpm,
      meanIbiMs: hrvResult.meanIbiMs,
      sdnn: hrvResult.sdnn,
      rmssd: hrvResult.rmssd,
      pnn50: hrvResult.pnn50,
      nBeats: hrvResult.ibis ? hrvResult.ibis.length : 0,
      quality: hrvResult.quality ?? null,
    },
    posture: {
      pitchDeg: posture.pitchDeg,
      sdDeg: posture.sdDeg ?? 0,
      samples: posture.samples ?? 0,
    },
  }
}

export function saveBaseline(b) {
  if (!validateBaseline(b)) throw new Error('Invalid baseline')
  try { localStorage.setItem(KEY, JSON.stringify(b)) }
  catch (e) { throw new Error('Could not save baseline: ' + (e?.message || e)) }
  return b
}

/** Returns the stored baseline, or null if none / corrupt / old version. */
export function loadBaseline() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const b = JSON.parse(raw)
    return validateBaseline(b) ? b : null
  } catch {
    return null
  }
}

export function clearBaseline() {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}
