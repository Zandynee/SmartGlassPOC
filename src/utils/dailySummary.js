// ─────────────────────────────────────────────
//  utils/dailySummary.js  –  checks per day + daily summary (handoff §5)
//  Pure, no React / DB.
//    check row   { id, t, status, work_duration_s, rmssd_change_pct, sdnn_change_pct,
//                  valid_windows, total_windows, … }   (status NULL = legacy v1 row)
//    baseline    { date_key, fitness, created_at, … }
//  "Saran" = checks that gave a rest message (DROP or SOFT). INVALID checks are counted apart.
// ─────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, '0')

export const dayKey = (ms) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** All checks of the sessions in `sessions`, inside the range, oldest first. */
export function flattenChecks(sessions, histories, range) {
  const rows = []
  for (const s of sessions) {
    for (const c of histories[s.id]?.checks ?? []) {
      if (c.t >= range.start && c.t < range.end) rows.push({ ...c, session_id: s.id })
    }
  }
  return rows.sort((a, b) => a.t - b.t)
}

/** → [{ key, t, fitness, valid, invalid, advice, rows }] newest day first (days without checks are left out) */
export function summarizeDays(checks, baselines = []) {
  const fitnessOf = {}
  for (const b of [...baselines].sort((a, c) => a.created_at - c.created_at)) {
    if (b.fitness != null) fitnessOf[b.date_key] = b.fitness       // the day's latest baseline wins
  }
  const days = new Map()
  for (const c of checks) {
    const key = dayKey(c.t)
    if (!days.has(key)) days.set(key, { key, t: c.t, fitness: fitnessOf[key] ?? null, valid: 0, invalid: 0, advice: 0, rows: [] })
    const d = days.get(key)
    d.rows.push(c)
    if (c.status === 'INVALID') d.invalid++
    else if (c.status) {
      d.valid++
      if (c.status === 'DROP' || c.status === 'SOFT') d.advice++
    }
  }
  return [...days.values()].sort((a, b) => b.key.localeCompare(a.key))
}
