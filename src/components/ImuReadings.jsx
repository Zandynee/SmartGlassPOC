// ─────────────────────────────────────────────
//  ImuReadings.jsx  –  "Data Sensor" card
//  Orientation (relative to the calibration point once calibrated)
//  + raw accelerometer. Rows beyond their limit turn red.
//
//  Props:
//    imu        – { accel, gyro, mag, fhpStatus }
//    roll/pitch/yaw – degrees (relative when calibrated)
//    calibrated – boolean; adds a "Δ" to the angle labels
//    flags      – { roll, pitch, yaw } booleans (abnormal)
//    live       – boolean
// ─────────────────────────────────────────────

import { Card } from './Card'

function Row({ label, value, decimals, live, abnormal = false }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-t border-slate-100 first:border-t-0">
      <span className={`text-sm font-medium ${abnormal ? 'text-red-600' : 'text-slate-500'}`}>{label}</span>
      <span className={`text-lg font-extrabold tabular-nums ${abnormal ? 'text-red-600' : ''}`}>
        {live ? value.toFixed(decimals) : '—'}
      </span>
    </div>
  )
}

export function ImuReadings({ imu, roll, pitch, yaw = 0, calibrated = false, flags = {}, live = false }) {
  const [ax = 0, ay = 0, az = 0] = Object.values(imu.accel ?? {})
  const d = calibrated ? 'Δ ' : ''

  return (
    <Card title="Data Sensor" dot="#0d9488">
      <Row label={`${d}Roll (°)`}  value={roll}  decimals={1} live={live} abnormal={flags.roll} />
      <Row label={`${d}Pitch (°)`} value={pitch} decimals={1} live={live} abnormal={flags.pitch} />
      <Row label={`${d}Yaw (°)`}   value={yaw}   decimals={1} live={live} abnormal={flags.yaw} />
      <Row label="ax (g)" value={ax} decimals={2} live={live} />
      <Row label="ay (g)" value={ay} decimals={2} live={live} />
      <Row label="az (g)" value={az} decimals={2} live={live} />
    </Card>
  )
}
