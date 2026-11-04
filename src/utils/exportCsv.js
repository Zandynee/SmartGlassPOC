// ─────────────────────────────────────────────
//  utils/exportCsv.js  –  session → CSV
//
//  One row per recording tick (IMU + PPG + ToF merged), with the time split
//  into columns that are easy to read AND easy to sort/filter in Excel:
//
//    tanggal     2026-10-16        (ISO date, local time)
//    waktu       14:41:18.500      (HH:mm:ss.SSS, local time)
//    detik_ke    12.5              (seconds since the session started)
//    ... sensor columns ...
//    epoch_ms    1792136478500     (raw value, for scripts)
//
//  Locale: Excel with an Indonesian regional setting expects ';' as the
//  column separator and ',' as the decimal mark. Set FORMAT to
//  { sep: ',', dec: '.' } if you open the files in Google Sheets / pandas / US Excel.
// ─────────────────────────────────────────────

const FORMAT = { sep: ';', dec: ',' }

const BOM = '﻿'          // makes Excel read the file as UTF-8 (keeps "°" intact)
const GROUP_MS = 250          // readings closer than this belong to the same tick

const pad = (n, len = 2) => String(n).padStart(len, '0')

const fmtDate = (ms) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const fmtTime = (ms) => {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}
const num = (v, dp) =>
  v == null || !Number.isFinite(Number(v)) ? '' : Number(v).toFixed(dp).replace('.', FORMAT.dec)

const cell = (v) => {
  const s = v == null ? '' : String(v)
  return s.includes(FORMAT.sep) || /["\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// IMU / PPG / ToF are inserted a few ms apart, so group them into ticks.
function mergeReadings({ imu = [], ppg = [], tof = [] }) {
  const all = [
    ...imu.map((r) => ['imu', r]),
    ...ppg.map((r) => ['ppg', r]),
    ...tof.map((r) => ['tof', r]),
  ].sort((a, b) => a[1].t - b[1].t)

  const rows = []
  let cur = null
  for (const [kind, r] of all) {
    if (!cur || r.t - cur.t > GROUP_MS || cur[kind]) {
      cur = { t: r.t }
      rows.push(cur)
    }
    cur[kind] = r
  }
  return rows
}

const COLUMNS = [
  ['tanggal',          (row) => fmtDate(row.t)],
  ['waktu',            (row) => fmtTime(row.t)],
  ['detik_ke',         (row, s) => num((row.t - s.started_at) / 1000, 1)],
  ['roll_deg',         (row) => num(row.imu?.roll, 2)],
  ['pitch_deg',        (row) => num(row.imu?.pitch, 2)],
  ['yaw_deg',          (row) => num(row.imu?.yaw, 2)],
  ['ax_g',             (row) => num(row.imu?.ax, 3)],
  ['ay_g',             (row) => num(row.imu?.ay, 3)],
  ['az_g',             (row) => num(row.imu?.az, 3)],
  ['gx_dps',           (row) => num(row.imu?.gx, 2)],
  ['gy_dps',           (row) => num(row.imu?.gy, 2)],
  ['gz_dps',           (row) => num(row.imu?.gz, 2)],
  ['postur',           (row) => row.imu?.fhp_status],
  ['hr_bpm',           (row) => num(row.ppg?.hr_bpm, 1)],
  ['hr_terdeteksi',    (row) => (row.ppg ? (row.ppg.hr_detectable ? 'ya' : 'tidak') : '')],
  ['indeks_kelelahan', (row) => num(row.ppg?.fatigue_index, 0)],
  ['status_kelelahan', (row) => row.ppg?.fatigue_status],
  ['ir_raw',           (row) => row.ppg?.ir_raw],
  ['red_raw',          (row) => row.ppg?.red_raw],
  ['jarak_cm',         (row) => num(row.tof?.distance_cm, 1)],
  ['status_jarak',     (row) => row.tof?.status],
  ['epoch_ms',         (row) => row.t],
]

export function sessionToCsv(session, history) {
  const rows = mergeReadings(history)
  const lines = [COLUMNS.map(([h]) => h).join(FORMAT.sep)]
  for (const row of rows) {
    lines.push(COLUMNS.map(([, get]) => cell(get(row, session))).join(FORMAT.sep))
  }
  return BOM + lines.join('\r\n') + '\r\n'
}

// visioguard_sesi-12_ble_2026-10-16_14-41-18.csv
export function csvFilename(session) {
  const t = fmtTime(session.started_at).slice(0, 8).replace(/:/g, '-')
  return `visioguard_sesi-${session.id}_${session.mode}_${fmtDate(session.started_at)}_${t}.csv`
}

/**
 * Save the text as a file.
 *  • Tauri : native "Save as…" dialog + save_text_file command (src-tauri/src/lib.rs)
 *  • Browser (npm run dev): normal download
 * Returns the saved path (Tauri), the filename (browser) or null if cancelled.
 */
export async function saveCsv(filename, text) {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { invoke } = await import('@tauri-apps/api/core')
    const path = await save({
      defaultPath: filename,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    })
    if (!path) return null
    await invoke('save_text_file', { path, contents: text })
    return path
  }

  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return filename
}