// ─────────────────────────────────────────────
//  decision.js  –  window results → baseline / check decision  (pure, no React)
//
//  Implements handoff §4:
//    • Baseline = N windows (default 6 × 60 s). Valid when >= minValidBaselineWindows (5)
//      pass the quality gate. RMSSD / SDNN baseline = MEDIAN of the valid windows.
//    • Check    = M windows (default 3 × 60 s). Needs >= minValidCheckWindows (2) valid,
//      otherwise status INVALID and NO decision is made.
//    • Compare the median RMSSD / SDNN of the valid check windows with the baseline.
//        RMSSD down >= dropThr (20 %) AND SDNN down  → DROP   (advice to rest)
//        RMSSD down >= dropThr only                  → SOFT   (softer message)
//        otherwise                                   → STABLE
//    • HR and pNN50 are NOT used in the decision (HR is returned for display only).
//
//  dropThr = 0.20 is a conservative, NOT yet validated starting value (handoff §4.7),
//  therefore it is a parameter (Params.drop_thr in the reference code).
// ─────────────────────────────────────────────

export const CHECK_STATUS = Object.freeze({
  STABLE: 'STABLE',
  SOFT: 'SOFT',
  DROP: 'DROP',
  INVALID: 'INVALID',
})

export const DECISION_DEFAULTS = Object.freeze({
  baselineWindows: 6,
  minValidBaselineWindows: 5,
  checkWindows: 3,
  minValidCheckWindows: 2,
  dropThr: 0.2,
})

const finite = (v) => typeof v === 'number' && Number.isFinite(v)

export function median(values) {
  const a = values.filter(finite).sort((x, y) => x - y)
  const n = a.length
  if (!n) return NaN
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2
}

/** analyzePpg() output → the small object we keep per window. */
export function summarizeWindow(res) {
  if (!res || !res.ok) {
    return { ok: false, reason: res?.reason || 'no_signal', hrBpm: null, sdnn: null, rmssd: null }
  }
  return {
    ok: true,
    reason: null,
    hrBpm: res.hrBpm,
    sdnn: res.sdnn,
    rmssd: res.rmssd,
    validRatio: res.quality?.validRatio ?? null,
    coverage: res.quality?.coverage ?? null,
  }
}

/** Most frequent failure reason among the invalid windows (null when all are valid). */
export function mainReason(wins) {
  const count = {}
  for (const w of wins) if (!w.ok) count[w.reason] = (count[w.reason] || 0) + 1
  let best = null
  for (const [r, c] of Object.entries(count)) if (!best || c > count[best]) best = r
  return best
}

const cfgOf = (p) => ({ ...DECISION_DEFAULTS, ...(p || {}) })

/**
 * @param wins  [{ ok, reason, hrBpm, sdnn, rmssd }]  (one per finished baseline window)
 * @returns { ok, reason, cause, validWindows, totalWindows, rmssd, sdnn, hrBpm, windows }
 */
export function buildBaseline(wins, params) {
  const c = cfgOf(params)
  const valid = wins.filter((w) => w.ok)
  const base = { validWindows: valid.length, totalWindows: c.baselineWindows, windows: wins }
  if (valid.length < c.minValidBaselineWindows) {
    return { ok: false, reason: 'baseline_invalid', cause: mainReason(wins), ...base, rmssd: null, sdnn: null, hrBpm: null }
  }
  return {
    ok: true,
    reason: null,
    cause: null,
    ...base,
    rmssd: median(valid.map((w) => w.rmssd)),
    sdnn: median(valid.map((w) => w.sdnn)),
    hrBpm: median(valid.map((w) => w.hrBpm)),
  }
}

const pct = (cur, base) => (finite(cur) && finite(base) && base !== 0 ? ((cur - base) / Math.abs(base)) * 100 : null)

/**
 * @param baseline  stored baseline ({ hrv: { rmssd, sdnn, hrBpm } })
 * @param wins      finished check windows
 * @returns {
 *   ok            true when a decision could be made (status != INVALID)
 *   status        'STABLE' | 'SOFT' | 'DROP' | 'INVALID'
 *   reason        null | 'check_invalid' | 'no_baseline'
 *   cause         most common window failure reason (for the message), or null
 *   validWindows, totalWindows
 *   rmssd, sdnn   { base, cur, changePct }      (changePct < 0 = drop)
 *   hrBpm         { cur }  – information only
 *   dropThr, windows
 * }
 */
export function decideCheck(baseline, wins, params) {
  const c = cfgOf(params)
  const valid = wins.filter((w) => w.ok)
  const out = {
    ok: false,
    status: CHECK_STATUS.INVALID,
    reason: null,
    cause: mainReason(wins),
    validWindows: valid.length,
    totalWindows: c.checkWindows,
    rmssd: { base: null, cur: null, changePct: null },
    sdnn: { base: null, cur: null, changePct: null },
    hrBpm: { cur: null },
    dropThr: c.dropThr,
    windows: wins,
  }

  const b = baseline?.hrv
  if (!b || !finite(b.rmssd) || !finite(b.sdnn)) return { ...out, reason: 'no_baseline' }
  if (valid.length < c.minValidCheckWindows) return { ...out, reason: 'check_invalid' }

  const curRmssd = median(valid.map((w) => w.rmssd))
  const curSdnn = median(valid.map((w) => w.sdnn))
  const rmssd = { base: b.rmssd, cur: curRmssd, changePct: pct(curRmssd, b.rmssd) }
  const sdnn = { base: b.sdnn, cur: curSdnn, changePct: pct(curSdnn, b.sdnn) }

  const rmssdDrop = finite(rmssd.changePct) && rmssd.changePct <= -c.dropThr * 100
  const sdnnDrop = finite(sdnn.changePct) && sdnn.changePct < 0
  const status = rmssdDrop && sdnnDrop ? CHECK_STATUS.DROP : rmssdDrop ? CHECK_STATUS.SOFT : CHECK_STATUS.STABLE

  return {
    ...out,
    ok: true,
    status,
    cause: null,
    rmssd,
    sdnn,
    hrBpm: { cur: median(valid.map((w) => w.hrBpm)) },
  }
}
