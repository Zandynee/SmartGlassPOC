// ─────────────────────────────────────────────
//  TofReadings.jsx  –  "Jarak dengan Layar" card
//  Displays Time-of-Flight distance with a progress bar
//  (same pattern as the Data Riwayat summary cards) and how long
//  the user has stayed at a safe distance.
//
//  Props:
//    tof         – { distanceCm, status }
//    live        – boolean; true when receiving real/simulated data
//    safe        – true / false / null (null = unknown)
//    safeSeconds – consecutive seconds spent at a safe distance
// ─────────────────────────────────────────────

import { Card } from './Card'
import { SAFE_MIN_CM, formatDuration } from '../hooks/useSafeDistanceTimer'

const BAR_MAX_CM = 60   // same scale as the Data Riwayat "Jarak dengan Layar" card

export function TofReadings({ tof, live = false, safe = null, safeSeconds = 0 }) {
  const sensorFault = live && tof.status && tof.status !== 'OK' && tof.status !== 'UNKNOWN'
  const pct = live ? Math.min(100, Math.max(0, (tof.distanceCm / BAR_MAX_CM) * 100)) : 0
  const barColor = safe === false ? '#ef4444' : '#3a8dff'

  return (
    <Card title="Jarak dengan Layar" dot="#f59e0b" className="flex-1">
      <p className="m-0 flex items-baseline gap-1.5">
        <span className="text-4xl font-extrabold tabular-nums tracking-tight">
          {live ? tof.distanceCm.toFixed(0) : '—'}
        </span>
        <span className="text-base font-semibold text-slate-500">cm</span>
      </p>

      <div
        className="mt-3 h-2.5 rounded-full bg-slate-100 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={BAR_MAX_CM}
        aria-valuenow={live ? Math.round(tof.distanceCm) : 0}
        aria-label="Jarak dengan layar"
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>
      <p className="mt-2 text-xs text-slate-500">Aman jika ≥ {SAFE_MIN_CM} cm</p>

      <div className="mt-3 text-sm leading-snug">
        {!live && <p className="m-0 text-slate-500">Menunggu data sensor…</p>}

        {live && safe && (
          <p className="m-0 text-slate-600">
            Dalam jarak aman selama{' '}
            <span className="font-extrabold tabular-nums text-slate-900">
              {formatDuration(safeSeconds)}
            </span>
          </p>
        )}

        {live && safe === false && (
          <>
            <p className="m-0 font-extrabold text-red-600">Terlalu dekat dengan layar!</p>
            <p className="m-0 text-slate-600">Jaga jarak minimal {SAFE_MIN_CM} cm.</p>
          </>
        )}

        {sensorFault && (
          <p className="mt-1 text-xs font-mono text-red-600">✕ Sensor ToF: {tof.status}</p>
        )}
      </div>
    </Card>
  )
}
