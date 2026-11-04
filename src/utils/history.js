// ─────────────────────────────────────────────
//  utils/history.js  –  pure helpers for the "Data Riwayat" page
//  No React, no database: easy to test and reuse.
//
//  Data model (same tables SessionHistory already read):
//    session   { id, mode, started_at, ended_at }
//    history   { imu: [{t, roll, pitch, yaw, fhp_status}],
//                ppg: [{t, hr_bpm, fatigue_index, fatigue_status}],
//                tof: [{t, distance_cm, status}] }
// ─────────────────────────────────────────────

export const MIN = 60_000
export const HOUR = 60 * MIN
export const DAY = 24 * HOUR

// ── Timeframes (segmented selector) ────────────
export const TIMEFRAMES = [
  { id: 'day',    label: 'Hari' },
  { id: 'week',   label: 'Minggu' },
  { id: 'month',  label: 'Bulan' },
  { id: 'year',   label: 'Tahun' },
  { id: 'custom', label: 'Kustom' },
]

// ── Metrics (toggle buttons / chart lines / summary cards) ──
//  pick(row) → number | null   (null = row carries no usable value)
//  zones     → horizontal threshold bands drawn behind the chart
export const METRICS = [
  {
    id: 'hr',
    label: 'Detak Jantung',
    unit: 'bpm',
    color: '#e5484d',
    table: 'ppg',
    decimals: 0,
    domain: [40, 140],
    pick: (r) => {
      const v = Number(r.hr_bpm)
      return Number.isFinite(v) && v > 0 ? v : null     // 0 = "undetectable"
    },
    zones: [{ from: 60, to: 100, color: '#22c55e', label: 'Normal (60–100 bpm)' }],
  },
  {
    id: 'fatigue',
    label: 'Kelelahan',
    unit: '/100',
    color: '#8b5cf6',
    table: 'ppg',
    decimals: 0,
    domain: [0, 100],
    pick: (r) => {
      const v = Number(r.fatigue_index)
      if (!Number.isFinite(v) || r.fatigue_status === 'UNKNOWN') return null
      return Math.min(100, Math.max(0, v))
    },
    zones: [
      { from: 0,  to: 50,  color: '#22c55e', label: 'Segar (< 50)' },
      { from: 50, to: 75,  color: '#f59e0b', label: 'Waspada (50–75)' },
      { from: 75, to: 100, color: '#ef4444', label: 'Lelah (≥ 75)' },
    ],
  },
  {
    id: 'distance',
    label: 'Jarak Layar',
    unit: 'cm',
    color: '#3a8dff',
    table: 'tof',
    decimals: 1,
    domain: [0, 80],
    pick: (r) => {
      const v = Number(r.distance_cm)
      if (!Number.isFinite(v) || v < 0) return null
      // ignore sensor faults, keep OK / UNKNOWN (same rule as TofReadings)
      if (r.status && r.status !== 'OK' && r.status !== 'UNKNOWN') return null
      return v
    },
    zones: [
      { from: 0,  to: 40,  color: '#ef4444', label: 'Terlalu dekat (< 40 cm)' },
      { from: 40, to: 80,  color: '#22c55e', label: 'Jarak aman (≥ 40 cm)' },
    ],
  },
  {
    id: 'posture',
    label: 'Postur',
    unit: '%',
    color: '#0d9488',
    table: 'imu',
    decimals: 0,
    domain: [0, 100],
    // value = % of readings with good posture (0 = poor, 100 = ok)
    pick: (r) => {
      if (!r.fhp_status || r.fhp_status === 'UNKNOWN') return null
      return r.fhp_status === 'POOR_POSTURE' ? 0 : 100
    },
    zones: [
      { from: 0,  to: 50,  color: '#ef4444', label: 'Buruk (< 50%)' },
      { from: 50, to: 80,  color: '#f59e0b', label: 'Cukup (50–80%)' },
      { from: 80, to: 100, color: '#22c55e', label: 'Baik (≥ 80%)' },
    ],
  },
]

export const METRIC_BY_ID = Object.fromEntries(METRICS.map((m) => [m.id, m]))

// ── Date ranges ────────────────────────────────
const startOfDay = (t) => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const addDays = (t, n) => {
  const d = new Date(t)
  d.setDate(d.getDate() + n)
  return d.getTime()
}

// Monday-first weeks (Indonesian convention)
const startOfWeek = (t) => {
  const d = new Date(startOfDay(t))
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}

/**
 * Range = [start, end) in ms.
 * `custom` = { from: ms, to: ms } (inclusive days), only used for 'custom'.
 */
export function getRange(timeframe, anchor, custom) {
  const a = new Date(anchor)
  switch (timeframe) {
    case 'day': {
      const start = startOfDay(anchor)
      return { start, end: addDays(start, 1) }
    }
    case 'week': {
      const start = startOfWeek(anchor)
      return { start, end: addDays(start, 7) }
    }
    case 'month':
      return {
        start: new Date(a.getFullYear(), a.getMonth(), 1).getTime(),
        end:   new Date(a.getFullYear(), a.getMonth() + 1, 1).getTime(),
      }
    case 'year':
      return {
        start: new Date(a.getFullYear(), 0, 1).getTime(),
        end:   new Date(a.getFullYear() + 1, 0, 1).getTime(),
      }
    default: {
      let from = startOfDay(custom.from)
      let to = startOfDay(custom.to)
      if (to < from) [from, to] = [to, from]
      return { start: from, end: addDays(to, 1) }
    }
  }
}

/** Move the anchor one period back (-1) or forward (+1). */
export function shiftAnchor(timeframe, anchor, dir) {
  const d = new Date(anchor)
  switch (timeframe) {
    case 'day':   d.setDate(d.getDate() + dir); break
    case 'week':  d.setDate(d.getDate() + 7 * dir); break
    case 'month': d.setDate(1); d.setMonth(d.getMonth() + dir); break
    case 'year':  d.setDate(1); d.setFullYear(d.getFullYear() + dir); break
    default: break
  }
  return d.getTime()
}

/** Custom range jumps by its own length. */
export function shiftCustom(custom, dir) {
  const span = Math.max(
    1,
    Math.round((startOfDay(custom.to) - startOfDay(custom.from)) / DAY) + 1
  )
  return {
    from: addDays(startOfDay(custom.from), span * dir),
    to:   addDays(startOfDay(custom.to),   span * dir),
  }
}

// ── <input type="date"> ⇄ ms ───────────────────
const pad = (n) => String(n).padStart(2, '0')

export function toDateInput(ms) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fromDateInput(str) {
  if (!str) return null
  const [y, m, d] = str.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d).getTime()
}

// ── Buckets (x-axis) ───────────────────────────
//  day → 15 min · week → 1 h · month → 1 day · year → 1 month
export function pickUnit(start, end) {
  const span = end - start
  if (span <= 1.5 * DAY) return 'min15'
  if (span <= 8.5 * DAY) return 'hour'
  if (span <= 100 * DAY) return 'day'
  return 'month'
}

function alignStart(unit, t) {
  const d = new Date(t)
  switch (unit) {
    case 'min15': d.setMinutes(Math.floor(d.getMinutes() / 15) * 15, 0, 0); break
    case 'hour':  d.setMinutes(0, 0, 0); break
    case 'day':   d.setHours(0, 0, 0, 0); break
    default:      d.setDate(1); d.setHours(0, 0, 0, 0)
  }
  return d.getTime()
}

function nextBoundary(unit, t) {
  const d = new Date(t)
  switch (unit) {
    case 'min15': return t + 15 * MIN
    case 'hour':  return t + HOUR
    case 'day':   d.setDate(d.getDate() + 1); return d.getTime()
    default:      d.setMonth(d.getMonth() + 1); return d.getTime()
  }
}

export function makeBuckets(start, end, unit = pickUnit(start, end)) {
  const buckets = []
  let t = alignStart(unit, start)
  let guard = 0
  while (t < end && guard++ < 5000) {
    const n = nextBoundary(unit, t)
    buckets.push({ t0: t, t1: n })
    t = n
  }
  return { unit, buckets }
}

function bucketIndex(buckets, t) {
  let lo = 0
  let hi = buckets.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (t < buckets[mid].t0) hi = mid - 1
    else if (t >= buckets[mid].t1) lo = mid + 1
    else return mid
  }
  return -1
}

// ── Aggregation ────────────────────────────────
/**
 * @param buckets   from makeBuckets()
 * @param histories array of { imu, ppg, tof }
 * @param range     { start, end } – rows outside are ignored
 * @returns {
 *   points:  [{ t0, t1, values: {hr,fatigue,distance,posture}, counts }]
 *   summary: { hr: {avg,count}, ... }     // over ALL readings in range
 * }
 */
export function aggregate(buckets, histories, range) {
  const n = buckets.length
  const acc = {}
  const total = {}
  for (const m of METRICS) {
    acc[m.id] = { sum: new Float64Array(n), cnt: new Uint32Array(n) }
    total[m.id] = { sum: 0, cnt: 0 }
  }

  for (const h of histories) {
    if (!h) continue
    for (const m of METRICS) {
      for (const r of h[m.table] ?? []) {
        if (r.t < range.start || r.t >= range.end) continue
        const v = m.pick(r)
        if (v == null) continue
        const i = bucketIndex(buckets, r.t)
        if (i < 0) continue
        acc[m.id].sum[i] += v
        acc[m.id].cnt[i] += 1
        total[m.id].sum += v
        total[m.id].cnt += 1
      }
    }
  }

  const points = buckets.map((b, i) => {
    const values = {}
    const counts = {}
    for (const m of METRICS) {
      const c = acc[m.id].cnt[i]
      counts[m.id] = c
      values[m.id] = c ? acc[m.id].sum[i] / c : null
    }
    return { t0: b.t0, t1: b.t1, values, counts }
  })

  const summary = {}
  for (const m of METRICS) {
    const t = total[m.id]
    summary[m.id] = { avg: t.cnt ? t.sum / t.cnt : null, count: t.cnt }
  }
  return { points, summary }
}

/** Averages for one session (no range clipping). */
export function summarizeHistory(history) {
  const out = {}
  for (const m of METRICS) {
    let sum = 0
    let cnt = 0
    for (const r of history?.[m.table] ?? []) {
      const v = m.pick(r)
      if (v != null) { sum += v; cnt++ }
    }
    out[m.id] = cnt ? sum / cnt : null
  }
  return out
}

/** Sessions that touch [range.start, range.end). Running sessions end "now". */
export function overlapsRange(session, range, now = Date.now()) {
  const start = session.started_at ?? 0
  const end = session.ended_at ?? now
  return start < range.end && end >= range.start
}

// ── Axis helpers ───────────────────────────────
export function niceTicks(min, max, target = 5) {
  const span = max - min || 1
  const raw = span / target
  const pow = 10 ** Math.floor(Math.log10(raw))
  const f = raw / pow
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow
  const ticks = []
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) {
    ticks.push(Number(v.toFixed(10)))
  }
  return ticks
}

/** Default domain, widened if data falls outside it. */
export function domainFor(metric, values) {
  let [lo, hi] = metric.domain
  for (const v of values) {
    if (v == null) continue
    if (v < lo) lo = Math.floor(v)
    if (v > hi) hi = Math.ceil(v)
  }
  return [lo, hi]
}

const TICK_STEPS = {
  min15: [1, 2, 4, 8, 12, 16, 24, 48],
  hour:  [1, 2, 3, 6, 12, 24, 48],
  day:   [1, 2, 3, 5, 7, 10, 14, 30],
  month: [1, 2, 3, 6, 12],
}

/** Which bucket indexes get an x-axis label. */
export function tickIndices(unit, n, maxTicks) {
  const steps = TICK_STEPS[unit] ?? [1]
  const need = Math.ceil(n / Math.max(1, maxTicks))
  const step = steps.find((s) => s >= need) ?? steps[steps.length - 1]
  const out = []
  for (let i = 0; i < n; i += step) out.push(i)
  return out
}

// ── Formatting (always id-ID wording, 24 h with ":") ──
const fmtShort = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' })
const fmtLong = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
})
const fmtDayFull = new Intl.DateTimeFormat('id-ID', {
  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
})
const fmtMonthLong = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' })
const fmtMonthShort = new Intl.DateTimeFormat('id-ID', { month: 'short' })

export const fmtClock = (t) => {
  const d = new Date(t)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatDateShort(t) {
  return fmtShort.format(new Date(t))
}

export function formatDayHeading(t) {
  return fmtDayFull.format(new Date(t))
}

export function formatRangeLabel(timeframe, range) {
  const s = new Date(range.start)
  const e = new Date(range.end - 1)
  if (timeframe === 'day') return fmtLong.format(s)
  if (timeframe === 'month') return fmtMonthLong.format(s)
  if (timeframe === 'year') return String(s.getFullYear())
  if (startOfDay(s) === startOfDay(e)) return fmtLong.format(s)
  const sameYear = s.getFullYear() === e.getFullYear()
  return `${fmtShort.format(s)}${sameYear ? '' : ' ' + s.getFullYear()} – ${fmtShort.format(e)} ${e.getFullYear()}`
}

/** x-axis tick label */
export function formatBucketLabel(unit, t0) {
  const d = new Date(t0)
  switch (unit) {
    case 'min15': return fmtClock(t0)
    case 'hour':  return d.getHours() === 0 ? fmtShort.format(d) : fmtClock(t0)
    case 'day':   return fmtShort.format(d)
    default:      return `${fmtMonthShort.format(d)} ${d.getFullYear()}`
  }
}

/** Tooltip heading */
export function formatBucketRange(unit, b) {
  switch (unit) {
    case 'min15': return `${fmtClock(b.t0)} – ${fmtClock(b.t1)}`
    case 'hour':  return `${fmtDayFull.format(new Date(b.t0))} · ${fmtClock(b.t0)} – ${fmtClock(b.t1)}`
    case 'day':   return fmtDayFull.format(new Date(b.t0))
    default:      return fmtMonthLong.format(new Date(b.t0))
  }
}

export function formatDuration(ms) {
  if (ms == null || ms < 0) return '—'
  const m = Math.round(ms / MIN)
  if (m < 1) return '< 1 mnt'
  if (m < 60) return `${m} mnt`
  return `${Math.floor(m / 60)} j ${m % 60} mnt`
}

export function formatValue(v, decimals = 0) {
  if (v == null || Number.isNaN(v)) return '—'
  return v.toFixed(decimals)
}

/** 'ble' → "Bluetooth (BLE)", 'simulation' → "Simulasi" */
export function modeLabel(mode) {
  const m = String(mode ?? '').toLowerCase()
  if (m.includes('sim')) return 'Simulasi'
  if (m.includes('ble') || m.includes('blue')) return 'Bluetooth (BLE)'
  return mode ? String(mode) : 'Tidak diketahui'
}

export const isSimMode = (mode) => String(mode ?? '').toLowerCase().includes('sim')
