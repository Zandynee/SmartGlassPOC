// ─────────────────────────────────────────────
// hrv.js – PPG → Heart Rate Variability (PRV)
//
// Pipeline:
// Raw PPG → Filtering → Peak Detection → IBI
// → SDNN, RMSSD, pNN50 → Perbandingan dengan Baseline
//
// Cek sensor: 60 detik
// Baseline PRV: 5 menit
//
// Versi ini hanya menampilkan perubahan parameter PRV.
// Tidak melakukan klasifikasi kelelahan.
// ─────────────────────────────────────────────

import { PPG_SAMPLE_RATE_HZ } from './bleConfig'

// ── KONFIGURASI ──
export const IBI_MIN_MS = 300
export const IBI_MAX_MS = 2000
export const IBI_OUTLIER_RATIO = 0.25
export const MIN_VALID_IBIS = 30
export const MIN_VALID_RATIO = 0.6

export const SENSOR_CHECK_SECONDS = 60
export const BASELINE_SECONDS = 300

// ── HELPER ──
const median = (arr) => {
  const a = Array.from(arr).sort((x, y) => x - y)
  const n = a.length

  if (!n) return NaN

  return n % 2
    ? a[(n - 1) / 2]
    : (a[n / 2 - 1] + a[n / 2]) / 2
}

const mean = (a) =>
  a.reduce((s, v) => s + v, 0) / a.length

const stdSample = (a) => {
  if (a.length < 2) return NaN

  const m = mean(a)

  return Math.sqrt(
    a.reduce((s, v) => s + (v - m) ** 2, 0) /
    (a.length - 1)
  )
}

// ── MOVING AVERAGE ──
export function movingAverage(x, win) {
  const n = x.length
  const half = Math.floor(win / 2)

  const pre = new Float64Array(n + 1)

  for (let i = 0; i < n; i++) {
    pre[i + 1] = pre[i] + x[i]
  }

  const out = new Float64Array(n)

  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - half)
    const hi = Math.min(n - 1, i + half)

    out[i] =
      (pre[hi + 1] - pre[lo]) / (hi - lo + 1)
  }

  return out
}

// ── FILTERING PPG ──
export function filterPpg(raw, fs) {
  const hp = Math.max(3, Math.round(fs * 1.0))
  const lp = Math.max(3, Math.round(fs * 0.05)) | 1

  const base = movingAverage(raw, hp)
  const ac = new Float64Array(raw.length)

  for (let i = 0; i < raw.length; i++) {
    ac[i] = raw[i] - base[i]
  }

  return movingAverage(
    movingAverage(ac, lp),
    lp
  )
}

// ── DETEKSI PUNCAK ──
export function detectPeaks(
  y,
  fs,
  { minDistS = 0.3, relThresh = 0.4 } = {}
) {
  const n = y.length
  const edge = Math.round(fs * 0.5)
  const win = Math.round(fs * 1.5)

  const cands = []

  // Mencari kandidat puncak lokal
  for (
    let i = Math.max(1, edge);
    i < n - Math.max(1, edge);
    i++
  ) {
    if (
      y[i] > 0 &&
      y[i] > y[i - 1] &&
      y[i] >= y[i + 1]
    ) {
      cands.push(i)
    }
  }

  // Seleksi berdasarkan amplitudo lokal
  const gated = []

  for (const i of cands) {
    let localMax = 0

    for (
      let j = Math.max(0, i - win);
      j <= Math.min(n - 1, i + win);
      j++
    ) {
      if (y[j] > localMax) {
        localMax = y[j]
      }
    }

    if (y[i] >= relThresh * localMax) {
      gated.push(i)
    }
  }

  // Refractory period
  const minDist = Math.round(minDistS * fs)
  const kept = []

  for (const i of gated) {
    const last = kept[kept.length - 1]

    if (last === undefined || i - last >= minDist) {
      kept.push(i)
    } else if (y[i] > y[last]) {
      kept[kept.length - 1] = i
    }
  }

  // Interpolasi parabola
  return kept.map((i) => {
    const y0 = y[i - 1]
    const y1 = y[i]
    const y2 = y[i + 1]

    const den = y0 - 2 * y1 + y2

    const off =
      den !== 0
        ? (0.5 * (y0 - y2)) / den
        : 0

    return i + Math.max(-0.5, Math.min(0.5, off))
  })
}

// ── DETEKSI PUNCAK ADAPTIF ──
export function detectPeaksAdaptive(y, fs) {
  const first = detectPeaks(y, fs, {
    minDistS: 0.3
  })

  if (first.length < 4) {
    return first
  }

  const ibi = []

  for (let i = 1; i < first.length; i++) {
    ibi.push(
      ((first[i] - first[i - 1]) / fs) * 1000
    )
  }

  const med = median(ibi) / 1000

  return detectPeaks(y, fs, {
    minDistS: Math.max(0.3, 0.55 * med)
  })
}

// ── VALIDASI IBI ──
export function flagValidIbis(ibis) {
  const n = ibis.length

  const plausible = ibis.map(
    (v) =>
      v >= IBI_MIN_MS &&
      v <= IBI_MAX_MS
  )

  const valid = new Array(n).fill(false)

  for (let i = 0; i < n; i++) {
    if (!plausible[i]) continue

    const neigh = []

    for (
      let j = Math.max(0, i - 5);
      j <= Math.min(n - 1, i + 5);
      j++
    ) {
      if (plausible[j]) {
        neigh.push(ibis[j])
      }
    }

    const m = median(neigh)

    valid[i] =
      Math.abs(ibis[i] - m) <=
      IBI_OUTLIER_RATIO * m
  }

  return valid
}

// ── PERHITUNGAN PARAMETER PRV ──
export function hrvMetrics(ibis, valid) {
  const vals = ibis.filter(
    (_, i) => valid[i]
  )

  const diffs = []

  for (let i = 0; i + 1 < ibis.length; i++) {
    if (valid[i] && valid[i + 1]) {
      diffs.push(
        ibis[i + 1] - ibis[i]
      )
    }
  }

  const meanIbiMs =
    vals.length ? mean(vals) : NaN

  return {
    meanIbiMs,

    hrBpm: vals.length
      ? 60000 / meanIbiMs
      : NaN,

    sdnn: stdSample(vals),

    rmssd: diffs.length
      ? Math.sqrt(
          mean(diffs.map((d) => d * d))
        )
      : NaN,

    pnn50: diffs.length
      ? (
          100 *
          diffs.filter(
            (d) => Math.abs(d) > 50
          ).length
        ) / diffs.length
      : NaN,

    pairs: diffs.length,
  }
}

// ── ANALISIS PPG ──
export function analyzePpg(
  raw,
  fs = PPG_SAMPLE_RATE_HZ,
  opts = {}
) {
  const o = {
    minValidIbis: MIN_VALID_IBIS,
    minValidRatio: MIN_VALID_RATIO,
    minAcStd: 8,
    ...opts
  }

  const n = raw.length

  const quality = {
    samples: n,
    fs,
    durationS: n / fs,
    beats: 0,
    validIbis: 0,
    validRatio: 0,
    pairs: 0
  }

  const fail = (reason) => ({
    ok: false,
    reason,
    quality,
    hrBpm: null,
    meanIbiMs: null,
    sdnn: null,
    rmssd: null,
    pnn50: null,
    ibis: [],
    peaksMs: [],
  })

  if (n < fs * 10) {
    return fail('too_short')
  }

  const y = filterPpg(raw, fs)

  // Pemeriksaan keberadaan sinyal
  const e = Math.round(fs)

  const mid = Array.from(
    y.subarray(e, n - e)
  )

  if (!(stdSample(mid) >= o.minAcStd)) {
    return fail('no_signal')
  }

  // Deteksi puncak
  const peaks = detectPeaksAdaptive(y, fs)

  quality.beats = peaks.length

  if (peaks.length < 3) {
    return fail('too_few_beats')
  }

  // Konversi posisi puncak menjadi waktu
  const peaksMs = peaks.map(
    (p) => (p / fs) * 1000
  )

  // Ekstraksi IBI
  const ibis = []

  for (let i = 1; i < peaksMs.length; i++) {
    ibis.push(
      peaksMs[i] - peaksMs[i - 1]
    )
  }

  // Validasi IBI
  const valid = flagValidIbis(ibis)

  // Perhitungan PRV
  const m = hrvMetrics(ibis, valid)

  quality.validIbis =
    valid.filter(Boolean).length

  quality.validRatio =
    quality.validIbis / ibis.length

  quality.pairs = m.pairs

  if (
    quality.validIbis <
    Math.min(
      o.minValidIbis,
      Math.floor((n / fs) * 0.25)
    )
  ) {
    return fail('too_few_beats')
  }

  if (quality.validRatio < o.minValidRatio) {
    return fail('too_noisy')
  }

  return {
    ok: true,
    reason: null,
    quality,

    hrBpm: m.hrBpm,
    meanIbiMs: m.meanIbiMs,
    sdnn: m.sdnn,
    rmssd: m.rmssd,
    pnn50: m.pnn50,

    ibis: ibis.filter(
      (_, i) => valid[i]
    ),

    peaksMs,
  }
}

// ── CEK SENSOR 60 DETIK ──
/**
 * Memeriksa kontak jari dan kualitas sinyal.
 * Hasilnya bukan baseline PRV dan bukan klasifikasi kelelahan.
 */
export function checkPpgSensor(
  raw,
  fs = PPG_SAMPLE_RATE_HZ,
  opts = {}
) {
  const requiredSeconds =
    opts.requiredSeconds ?? SENSOR_CHECK_SECONDS

  if (raw.length / fs < requiredSeconds) {
    return {
      ready: false,
      reason: 'check_too_short',
      requiredSeconds,
      durationS: raw.length / fs,
      analysis: null
    }
  }

  const analysis = analyzePpg(raw, fs, opts)

  return {
    ready: analysis.ok,
    reason: analysis.reason,
    requiredSeconds,
    durationS: analysis.quality.durationS,
    quality: analysis.quality,

    metrics: analysis.ok
      ? {
          hrBpm: analysis.hrBpm,
          sdnn: analysis.sdnn,
          rmssd: analysis.rmssd,
          pnn50: analysis.pnn50
        }
      : null,
  }
}

// ── BASELINE PRV 5 MENIT ──
/**
 * Membuat baseline personal dari satu rekaman kontinu 5 menit.
 * Jangan menggabungkan beberapa sesi cek sensor yang terpisah.
 */
export function analyzePpgBaseline(
  raw,
  fs = PPG_SAMPLE_RATE_HZ,
  opts = {}
) {
  const requiredSeconds =
    opts.requiredSeconds ?? BASELINE_SECONDS

  if (raw.length / fs < requiredSeconds) {
    return {
      ok: false,
      reason: 'baseline_too_short',
      requiredSeconds,
      durationS: raw.length / fs,
      baseline: null
    }
  }

  const analysis = analyzePpg(raw, fs, opts)

  if (!analysis.ok) {
    return {
      ok: false,
      reason: analysis.reason,
      requiredSeconds,
      durationS: analysis.quality.durationS,
      baseline: null,
      quality: analysis.quality
    }
  }

  return {
    ok: true,
    reason: null,
    requiredSeconds,
    durationS: analysis.quality.durationS,
    quality: analysis.quality,

    baseline: {
      hrBpm: analysis.hrBpm,
      sdnn: analysis.sdnn,
      rmssd: analysis.rmssd,
      pnn50: analysis.pnn50,
    },
  }
}

// ── PPG RECORDER ──
export class PpgRecorder {
  constructor({
    nominalHz = PPG_SAMPLE_RATE_HZ,
    maxSeconds = 300
  } = {}) {
    this.nominalHz = nominalHz
    this.maxSamples =
      Math.round(maxSeconds * nominalHz * 1.2)

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

  get count() {
    return this.ir.length
  }

  get elapsedMs() {
    return this.ir.length > 1
      ? this.ts[this.ts.length - 1] -
        this.ts[0]
      : 0
  }

  get effectiveHz() {
    const n = this.ir.length

    if (n < 50 || this.elapsedMs <= 0) {
      return this.nominalHz
    }

    return ((n - 1) / this.elapsedMs) * 1000
  }

  get rateOk() {
    return (
      this.effectiveHz >=
      this.nominalHz * 0.9
    )
  }

  // Analisis rekaman PPG
  analyze({ lastSeconds = null, ...opts } = {}) {
    const fs = this.effectiveHz

    let raw = this.ir

    if (lastSeconds) {
      raw = raw.slice(
        -Math.round(lastSeconds * fs)
      )
    }

    const res = analyzePpg(raw, fs, opts)

    if (!this.rateOk && res.ok) {
      return {
        ...res,
        ok: false,
        reason: 'data_loss',
        quality: {
          ...res.quality,
          fs,
          nominalHz: this.nominalHz
        }
      }
    }

    res.quality.nominalHz = this.nominalHz

    return res
  }

  // Cek kualitas sensor menggunakan 60 detik terakhir
  checkSensor(opts = {}) {
    const fs = this.effectiveHz

    const seconds =
      opts.requiredSeconds ?? SENSOR_CHECK_SECONDS

    const raw = this.ir.slice(
      -Math.round(seconds * fs)
    )

    if (!this.rateOk) {
      return {
        ready: false,
        reason: 'data_loss',
        durationS: raw.length / fs,
        quality: {
          fs,
          nominalHz: this.nominalHz
        }
      }
    }

    return checkPpgSensor(raw, fs, opts)
  }

  // Analisis rekaman baseline kontinu 5 menit
  analyzeBaseline(opts = {}) {
    const fs = this.effectiveHz

    const seconds =
      opts.requiredSeconds ?? BASELINE_SECONDS

    const raw = this.ir.slice(
      -Math.round(seconds * fs)
    )

    if (!this.rateOk) {
      return {
        ok: false,
        reason: 'data_loss',
        durationS: raw.length / fs,
        baseline: null,
        quality: {
          fs,
          nominalHz: this.nominalHz
        }
      }
    }

    return analyzePpgBaseline(raw, fs, opts)
  }
}

// ── PERBANDINGAN BASELINE DAN PENGUKURAN SAAT INI ──
/**
 * Membandingkan parameter PRV saat ini dengan baseline.
 *
 * Tidak menggunakan ambang penurunan dan tidak menghasilkan
 * klasifikasi kelelahan.
 *
 * Hasil:
 * - baseline: nilai parameter saat baseline
 * - current: nilai parameter saat pengukuran saat ini
 * - difference: selisih current - baseline
 * - changePct: perubahan persentase terhadap baseline
 *
 * Jika baseline nol atau nilai tidak valid, changePct = null.
 */
export function compareHrv(base, cur) {
  const metrics = {}

  for (const key of ['sdnn', 'rmssd', 'pnn50']) {
    const b = base?.[key]
    const c = cur?.[key]

    const valid =
      Number.isFinite(b) &&
      Number.isFinite(c)

    const difference =
      valid ? c - b : null

    metrics[key] = {
      baseline: Number.isFinite(b) ? b : null,
      current: Number.isFinite(c) ? c : null,
      difference,

      changePct:
        valid && b !== 0
          ? (difference / Math.abs(b)) * 100
          : null,

      usable: valid,
    }
  }

  // HR ditampilkan sebagai informasi tambahan
  const baseHr = base?.hrBpm
  const currentHr = cur?.hrBpm

  const hrValid =
    Number.isFinite(baseHr) &&
    Number.isFinite(currentHr)

  return {
    metrics,

    hrBpm: {
      baseline: Number.isFinite(baseHr)
        ? baseHr
        : null,

      current: Number.isFinite(currentHr)
        ? currentHr
        : null,

      difference: hrValid
        ? currentHr - baseHr
        : null,

      changePct:
        hrValid && baseHr !== 0
          ? (
              (currentHr - baseHr) /
              Math.abs(baseHr)
            ) * 100
          : null,

      usable: hrValid,
    },

    classification: null,

    note:
      'Perbandingan deskriptif PRV; bukan klasifikasi kelelahan.',
  }
}