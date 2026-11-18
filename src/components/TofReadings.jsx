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
import { CloseIcon } from './icons'
import { SAFE_MIN_CM, formatDuration } from '../hooks/useSafeDistanceTimer'

const BAR_MAX_CM = 60   // same scale as the Data Riwayat "Jarak dengan Layar" card

export function TofReadings({ tof, live = false, safe = null, safeSeconds = 0 }) {
  const sensorFault = live && tof.status && tof.status !== 'OK' && tof.status !== 'UNKNOWN'
  const pct = live ? Math.min(100, Math.max(0, (tof.distanceCm / BAR_MAX_CM) * 100)) : 0
  const barColor = safe === false ? '#d9453f' : '#2563eb'
  const dot = safe === false ? '#d9453f' : safe ? '#2f9e6e' : '#85857f'

  return (
    <Card title="Jarak dengan layar" dot={dot} className="flex-1">
      <p className="m-0 flex items-baseline gap-2">
        <span className="font-mono text-4xl font-medium tabular-nums">
          {live ? tof.distanceCm.toFixed(0) : '—'}
        </span>
        <span className="text-base text-ink-muted">cm</span>
      </p>

      <div
        className="mt-3 h-bar rounded-full bg-wash overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={BAR_MAX_CM}
        aria-valuenow={live ? Math.round(tof.distanceCm) : 0}
        aria-label="Jarak dengan layar"
      >
        <div
          className="h-full w-full origin-left transition-transform duration-500"
          style={{ transform: `scaleX(${pct / 100})`, background: barColor }}
        />
      </div>
      <p className="mt-2 text-xs text-ink-muted">Aman jika ≥ {SAFE_MIN_CM} cm</p>

      <div className="mt-3 text-sm leading-snug">
        {!live && <p className="m-0 text-ink-muted">Menunggu data sensor…</p>}

        {live && safe && (
          <p className="m-0 text-ink-soft">
            Dalam jarak aman selama{' '}
            <span className="font-mono font-medium tabular-nums text-ink">
              {formatDuration(safeSeconds)}
            </span>
          </p>
        )}

        {live && safe === false && (
          <>
            <p className="m-0 font-medium text-danger">Terlalu dekat dengan layar</p>
            <p className="m-0 text-ink-soft">Jaga jarak minimal {SAFE_MIN_CM} cm</p>
          </>
        )}

        {sensorFault && (
          <p className="mt-1 flex items-center gap-2 text-xs font-mono text-danger"><CloseIcon size={14} className="shrink-0" /> Sensor ToF: {tof.status}</p>
        )}
      </div>
    </Card>
  )
}
