// ─────────────────────────────────────────────
//  baselineStore.js  –  persists the user's baseline (v2)
//
//  Baseline = resting HRV  (RMSSD / SDNN = MEDIAN of the valid 60 s windows,
//                           glasses on the table, finger on the temple sensor)
//           + upright posture (IMU pitch, glasses ON, sitting straight)
//           + the 1-5 fitness answer of that day
//  It is taken at the start of work and REFRESHED DAILY: `dateKey` is the local
//  date it was made; a baseline from another day is "stale" (see isBaselineStale).
//  Stored locally only (localStorage). Never leaves the device.
//
//  Shape:
//   { version: 2, createdAt, dateKey, fitness,
//     hrv:     { hrBpm, sdnn, rmssd, validWindows, totalWindows, windowS, measuredAt },
//     posture: { pitchDeg, sdDeg, samples, measuredAt } }
//  createdAt / dateKey = when the user CONFIRMED this baseline (today when an older HRV or
//  posture part was re-used on purpose); measuredAt = when that part was actually measured.
//
//  v1 baselines (single 2-minute recording) are ignored: the protocol changed.
// ─────────────────────────────────────────────

const KEY = 'visioguard.baseline.v2'
export const BASELINE_VERSION = 2

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const pad = (n) => String(n).padStart(2, '0')

/** Local calendar day, "2026-11-05". */
export function dateKey(ms = Date.now()) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** True when there is no baseline or it was not made today. */
export function isBaselineStale(b, now = Date.now()) {
  return !b || b.dateKey !== dateKey(now)
}

/** True if `b` has every field the rest of the app relies on. */
export function validateBaseline(b) {
  if (!b || typeof b !== 'object') return false
  if (b.version !== BASELINE_VERSION) return false
  if (typeof b.dateKey !== 'string') return false
  const h = b.hrv, p = b.posture
  if (!h || !p) return false
  return (
    isNum(h.sdnn) && h.sdnn > 0 &&
    isNum(h.rmssd) && h.rmssd > 0 &&
    isNum(h.hrBpm) &&
    isNum(h.validWindows) && isNum(h.totalWindows) &&
    isNum(p.pitchDeg)
  )
}

/**
 * Builds a baseline object.
 * @param hrv      buildBaseline() output (ok === true)
 * @param posture  { pitchDeg, sdDeg, samples }
 * @param extra    { fitness, windowS }
 */
export function makeBaseline(hrv, posture, { fitness = null, windowS = 60 } = {}) {
  const now = Date.now()
  return {
    version: BASELINE_VERSION,
    createdAt: now,
    dateKey: dateKey(now),
    fitness,
    hrv: {
      hrBpm: hrv.hrBpm,
      sdnn: hrv.sdnn,
      rmssd: hrv.rmssd,
      validWindows: hrv.validWindows,
      totalWindows: hrv.totalWindows,
      windowS: hrv.windowS ?? windowS,
      measuredAt: hrv.measuredAt ?? now,
    },
    posture: {
      pitchDeg: posture.pitchDeg,
      sdDeg: posture.sdDeg ?? 0,
      samples: posture.samples ?? 0,
      measuredAt: posture.measuredAt ?? now,
    },
  }
}

export function saveBaseline(b) {
  if (!validateBaseline(b)) throw new Error('Baseline tidak valid')
  try { localStorage.setItem(KEY, JSON.stringify(b)) }
  catch (e) { throw new Error('Baseline tidak bisa disimpan: ' + (e?.message || e)) }
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
