// ─────────────────────────────────────────────
//  hrv.js  –  PPG → pulse-rate variability (PRV), merged version
//
//  The firmware only sends raw IR/Red. This module turns ~100 Hz raw IR into:
//    peaks → inter-beat intervals (IBI) → HR, SDNN, RMSSD, pNN50
//  and compares a fresh measurement against the stored baseline.
//
//  Protocol (handoff v2): the recording is cut into non-overlapping 60 s windows,
//  each analysed on its own (analyzePpg). Baseline / check decisions are made from the
//  window results in decision.js (medians, >=5/6 and >=2/3 valid windows).
//
//  Pipeline (analyzePpg):
//    1. invert + band-pass   the MAX30102 reads LOWER when blood volume rises, so the
//                     raw IR is inverted (systolic peak = maximum), then a 0.7–5 Hz
//                     Butterworth band-pass (2nd-order high-pass + 2nd-order low-pass,
//                     biquads computed from the real sample rate)
//    2. peak finding  adaptive threshold + refractory period, 2 passes
//                     (2nd pass uses the median IBI to reject dicrotic-notch peaks),
//                     parabolic interpolation → sub-sample peak times
//    3. IBI cleaning  plausibility (300–2000 ms) + rolling-median outlier rejection
//    4. metrics       SDNN over valid IBIs; RMSSD / pNN50 over *adjacent* valid pairs
//    5. quality       validRatio, coverage (catches long gaps), perfusion index
//
//  Timing: BLE notifications arrive in bursts, so arrival times are too jittery
//  for RMSSD. PpgRecorder treats samples as uniformly spaced and derives the real
//  sample rate from (count / elapsed time) over the analysed window. It also
//  reports data loss, which makes a window unusable.
//
//  pNN50 is still computed but is NOT used in any decision and is not shown.
// ─────────────────────────────────────────────

import { PPG_SAMPLE_RATE_HZ } from './bleConfig.js'

// ── tunables ──
export const IBI_MIN_MS = 300           // 200 bpm
export const IBI_MAX_MS = 2000          //  30 bpm
export const IBI_OUTLIER_RATIO = 0.25   // reject IBIs >25 % away from the local median
export const MIN_VALID_IBIS = 30        // for a ~2 min window
export const MIN_VALID_RATIO = 0.85     // quality gate q = min(validRatio, coverage) >= 0.85 (handoff §4)
export const PEAK_REL_THRESH = 0.3      // peak must reach k × local max (handoff: k = 0.3)
export const WINDOW_SECONDS = 60        // non-overlapping analysis window
export const BP_LOW_HZ = 0.7            // band-pass corners: drops baseline wander / respiration drift …
export const BP_HIGH_HZ = 5             // … and noise above the pulse harmonics

export const SENSOR_CHECK_SECONDS = 60
const DURATION_TOLERANCE_S = 1          // a time-sliced window is never exactly N s long

// ── small helpers ──
const median = (arr) => {
  const a = Array.from(arr).sort((x, y) => x - y)
  const n = a.length
  if (!n) return NaN
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2
}
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length
const stdSample = (a) => {
  if (a.length < 2) return NaN
  const m = mean(a)
  return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1))
}

/** Centred moving average (window shrinks at the edges). O(n). */
export function movingAverage(x, win) {
  const n = x.length
  const half = Math.floor(win / 2)
  const pre = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + x[i]
  const out = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - half)
    const hi = Math.min(n - 1, i + half)
    out[i] = (pre[hi + 1] - pre[lo]) / (hi - lo + 1)
  }
  return out
}

// ── filtering ──
/** 2nd-order Butterworth biquad (RBJ cookbook, Q = 1/√2) for sample rate fs. */
export function biquadCoeffs(type, fc, fs) {
  const fcc = Math.min(fc, 0.45 * fs)             // keep the corner below Nyquist
  const w0 = (2 * Math.PI * fcc) / fs
  const cosw = Math.cos(w0)
  const alpha = Math.sin(w0) / (2 * Math.SQRT1_2)
  const lp = type === 'lowpass'
  const b0 = lp ? (1 - cosw) / 2 : (1 + cosw) / 2
  const b1 = lp ? 1 - cosw : -(1 + cosw)
  const a0 = 1 + alpha
  return { b0: b0 / a0, b1: b1 / a0, b2: b0 / a0, a1: (-2 * cosw) / a0, a2: (1 - alpha) / a0 }
}

/** Causal biquad (direct form I). The state starts at the steady state for a constant
 *  input x[0], so the large DC offset of raw PPG does not cause a start-up transient. */
export function applyBiquad(x, c, type) {
  const y = new Float64Array(x.length)
  if (!x.length) return y
  let x1 = x[0], x2 = x[0]
  let y1 = type === 'lowpass' ? x[0] : 0
  let y2 = y1
  for (let i = 0; i < x.length; i++) {
    const v = c.b0 * x[i] + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2
    x2 = x1; x1 = x[i]
    y2 = y1; y1 = v
    y[i] = v
  }
  return y
}

/** Invert (MAX30102: blood volume ↑ → reading ↓) and band-pass 0.7–5 Hz. */
export function filterPpg(raw, fs) {
  const x = new Float64Array(raw.length)
  for (let i = 0; i < raw.length; i++) x[i] = -raw[i]
  const hp = applyBiquad(x, biquadCoeffs('highpass', BP_LOW_HZ, fs), 'highpass')
  return applyBiquad(hp, biquadCoeffs('lowpass', BP_HIGH_HZ, fs), 'lowpass')
}

// ── peak detection ──
/**
 * Find pulse peaks in a filtered signal.
 * Returns peak positions in (fractional) sample indices.
 */
export function detectPeaks(y, fs, { minDistS = 0.3, relThresh = PEAK_REL_THRESH } = {}) {
  const n = y.length
  const edge = Math.round(fs * 0.5)
  const win = Math.round(fs * 1.5)

  // candidates: local maxima above zero, not near the edges
  const cands = []
  for (let i = Math.max(1, edge); i < n - Math.max(1, edge); i++) {
    if (y[i] > 0 && y[i] > y[i - 1] && y[i] >= y[i + 1]) cands.push(i)
  }

  // amplitude gate: a peak must reach relThresh × the local maximum (±1.5 s)
  const gated = []
  for (const i of cands) {
    let localMax = 0
    for (let j = Math.max(0, i - win); j <= Math.min(n - 1, i + win); j++) if (y[j] > localMax) localMax = y[j]
    if (y[i] >= relThresh * localMax) gated.push(i)
  }

  // refractory period: keep the taller of two peaks that are too close
  const minDist = Math.round(minDistS * fs)
  const kept = []
  for (const i of gated) {
    const last = kept[kept.length - 1]
    if (last === undefined || i - last >= minDist) kept.push(i)
    else if (y[i] > y[last]) kept[kept.length - 1] = i
  }

  // sub-sample position (parabolic interpolation)
  return kept.map((i) => {
    const y0 = y[i - 1], y1 = y[i], y2 = y[i + 1]
    const den = y0 - 2 * y1 + y2
    const off = den !== 0 ? (0.5 * (y0 - y2)) / den : 0
    return i + Math.max(-0.5, Math.min(0.5, off))
  })
}

/** Two-pass detection: the 2nd pass widens the refractory period from the median IBI. */
export function detectPeaksAdaptive(y, fs) {
  const first = detectPeaks(y, fs, { minDistS: 0.3 })
  if (first.length < 4) return first
  const ibi = []
  for (let i = 1; i < first.length; i++) ibi.push(((first[i] - first[i - 1]) / fs) * 1000)
  const med = median(ibi) / 1000
  return detectPeaks(y, fs, { minDistS: Math.max(0.3, 0.55 * med) })
}

// ── IBI validation + metrics ──
/** Plausibility + rolling-median outlier test. Returns a boolean per IBI. */
export function flagValidIbis(ibis) {
  const n = ibis.length
  const plausible = ibis.map((v) => v >= IBI_MIN_MS && v <= IBI_MAX_MS)
  const valid = new Array(n).fill(false)
  for (let i = 0; i < n; i++) {
    if (!plausible[i]) continue
    const neigh = []
    for (let j = Math.max(0, i - 5); j <= Math.min(n - 1, i + 5); j++) if (plausible[j]) neigh.push(ibis[j])
    const m = median(neigh)
    valid[i] = Math.abs(ibis[i] - m) <= IBI_OUTLIER_RATIO * m
  }
  return valid
}

/** PRV time-domain metrics from an IBI series + validity flags. */
export function hrvMetrics(ibis, valid) {
  const vals = ibis.filter((_, i) => valid[i])
  const diffs = []
  for (let i = 0; i + 1 < ibis.length; i++) {
    if (valid[i] && valid[i + 1]) diffs.push(ibis[i + 1] - ibis[i])   // adjacent intervals only
  }
  const meanIbiMs = vals.length ? mean(vals) : NaN
  return {
    meanIbiMs,
    hrBpm: vals.length ? 60000 / meanIbiMs : NaN,
    sdnn: stdSample(vals),
    rmssd: diffs.length ? Math.sqrt(mean(diffs.map((d) => d * d))) : NaN,
    pnn50: diffs.length ? (100 * diffs.filter((d) => Math.abs(d) > 50).length) / diffs.length : NaN,
    pairs: diffs.length,
  }
}

// ── full analysis ──
/**
 * Full analysis of a raw IR window sampled at `fs` Hz.
 * @returns {{ ok, reason, hrBpm, meanIbiMs, sdnn, rmssd, pnn50, quality, ibis, peaksMs }}
 *   reason (when !ok): 'too_short' | 'no_signal' | 'low_perfusion' | 'too_few_beats' | 'too_noisy'
 *   quality.perfusionIndex = AC std / DC mean × 100 (%). It is only REPORTED unless
 *   opts.minPerfusionIndex is set ('low_perfusion'): no threshold is validated yet,
 *   take one from your own recordings (good contact vs. loose / pressed finger).
 */
export function analyzePpg(raw, fs = PPG_SAMPLE_RATE_HZ, opts = {}) {
  const o = { minValidIbis: MIN_VALID_IBIS, minValidRatio: MIN_VALID_RATIO, minAcStd: 8, minPerfusionIndex: null, ...opts }
  const n = raw.length
  const quality = { samples: n, fs, durationS: n / fs, beats: 0, validIbis: 0, validRatio: 0, coverage: 0, pairs: 0, perfusionIndex: null }
  const fail = (reason) => ({
    ok: false, reason, quality,
    hrBpm: null, meanIbiMs: null, sdnn: null, rmssd: null, pnn50: null, ibis: [], peaksMs: [],
  })

  if (n < fs * 10) return fail('too_short')

  const y = filterPpg(raw, fs)

  // signal present? (std of the AC part, ignoring the edges)
  const e = Math.round(fs)
  const mid = Array.from(y.subarray(e, n - e))
  const acStd = stdSample(mid)
  if (!(acStd >= o.minAcStd)) return fail('no_signal')
  quality.perfusionIndex = (acStd / Math.abs(mean(raw))) * 100
  if (o.minPerfusionIndex != null && quality.perfusionIndex < o.minPerfusionIndex) return fail('low_perfusion')

  const peaks = detectPeaksAdaptive(y, fs)
  quality.beats = peaks.length
  if (peaks.length < 3) return fail('too_few_beats')

  const peaksMs = peaks.map((p) => (p / fs) * 1000)
  const ibis = []
  for (let i = 1; i < peaksMs.length; i++) ibis.push(peaksMs[i] - peaksMs[i - 1])
  const valid = flagValidIbis(ibis)
  const m = hrvMetrics(ibis, valid)

  quality.validIbis = valid.filter(Boolean).length
  quality.validRatio = quality.validIbis / ibis.length
  // A stretch with no detectable peaks leaves ONE long (invalid) IBI behind, not many, so
  // validRatio alone barely notices it. coverage compares the valid IBIs with the number a
  // window of this length should contain at the median heart rate.
  const medIbi = median(ibis.filter((_, i) => valid[i]))
  quality.coverage = Number.isFinite(medIbi) ? Math.min(1, quality.validIbis / (((n / fs) * 1000) / medIbi)) : 0
  quality.pairs = m.pairs

  if (quality.validIbis < Math.min(o.minValidIbis, Math.floor((n / fs) * 0.25))) return fail('too_few_beats')
  if (Math.min(quality.validRatio, quality.coverage) < o.minValidRatio) return fail('too_noisy')

  return {
    ok: true, reason: null, quality,
    hrBpm: m.hrBpm, meanIbiMs: m.meanIbiMs, sdnn: m.sdnn, rmssd: m.rmssd, pnn50: m.pnn50,
    ibis: ibis.filter((_, i) => valid[i]), peaksMs,
  }
}

// ── 60 s sensor check ──
/**
 * Checks finger contact and signal quality.
 * The result is NOT a PRV baseline and NOT a fatigue classification.
 */
export function checkPpgSensor(raw, fs = PPG_SAMPLE_RATE_HZ, opts = {}) {
  const { requiredSeconds = SENSOR_CHECK_SECONDS, ...analyzeOpts } = opts
  const durationS = raw.length / fs

  if (durationS < requiredSeconds - DURATION_TOLERANCE_S) {
    return { ready: false, reason: 'check_too_short', requiredSeconds, durationS, quality: null, metrics: null }
  }

  const a = analyzePpg(raw, fs, analyzeOpts)
  return {
    ready: a.ok,
    reason: a.reason,
    requiredSeconds,
    durationS: a.quality.durationS,
    quality: a.quality,
    metrics: a.ok ? { hrBpm: a.hrBpm, sdnn: a.sdnn, rmssd: a.rmssd, pnn50: a.pnn50 } : null,
  }
}

// ─────────────────────────────────────────────
//  Recorder: collects the raw 100 Hz stream (arrival-timestamped)
// ─────────────────────────────────────────────
export class PpgRecorder {
  constructor({ nominalHz = PPG_SAMPLE_RATE_HZ, maxSeconds = 300 } = {}) {
    this.nominalHz = nominalHz
    this.maxSamples = Math.round(maxSeconds * nominalHz * 1.2)
    this.reset()
  }

  reset() {
    this.ir = []
    this.ts = []
  }

  push(ir, tMs = Date.now()) {
    if (!Number.isFinite(ir)) return
    this.ir.push(ir)
    this.ts.push(tMs)
    if (this.ir.length > this.maxSamples + 1000) {
      this.ir.splice(0, 1000)
      this.ts.splice(0, 1000)
    }
  }

  get count() { return this.ir.length }

  /** wall-clock span of the retained samples */
  get elapsedMs() {
    return this.ir.length > 1 ? this.ts[this.ts.length - 1] - this.ts[0] : 0
  }

  /** real sample rate over the whole retained buffer (robust against BLE bursts) */
  get effectiveHz() {
    const n = this.ir.length
    if (n < 50 || this.elapsedMs <= 0) return this.nominalHz
    return ((n - 1) / this.elapsedMs) * 1000
  }

  /** false when many notifications were lost (effective rate far below nominal) */
  get rateOk() {
    return this.effectiveHz >= this.nominalHz * 0.9
  }

  /**
   * The last `seconds` of wall-clock time (default: everything), with the sample rate
   * and rate check computed for THAT window only, so an old gap outside the window
   * cannot reject a good recording (and vice versa).
   */
  _window(seconds = null) {
    let start = 0
    if (seconds && this.ts.length) {
      const cutoff = this.ts[this.ts.length - 1] - seconds * 1000
      while (start < this.ts.length - 1 && this.ts[start] < cutoff) start++
    }
    const raw = this.ir.slice(start)
    const elapsed = raw.length > 1 ? this.ts[this.ts.length - 1] - this.ts[start] : 0
    const fs = raw.length >= 50 && elapsed > 0 ? ((raw.length - 1) / elapsed) * 1000 : this.nominalHz
    return { raw, fs, rateOk: fs >= this.nominalHz * 0.9 }
  }

  /** Analyse the last `lastSeconds` (default: everything). */
  analyze({ lastSeconds = null, ...opts } = {}) {
    const { raw, fs, rateOk } = this._window(lastSeconds)
    const res = analyzePpg(raw, fs, opts)
    res.quality.nominalHz = this.nominalHz
    if (!rateOk && res.ok) return { ...res, ok: false, reason: 'data_loss' }
    return res
  }

  /** 60 s sensor check on the most recent window. */
  checkSensor(opts = {}) {
    const seconds = opts.requiredSeconds ?? SENSOR_CHECK_SECONDS
    const { raw, fs, rateOk } = this._window(seconds)
    if (!rateOk) {
      return {
        ready: false, reason: 'data_loss', requiredSeconds: seconds,
        durationS: raw.length / fs, metrics: null,
        quality: { fs, nominalHz: this.nominalHz },
      }
    }
    return checkPpgSensor(raw, fs, opts)
  }
}
