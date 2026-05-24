// ─────────────────────────────────────────────
//  TofReadings.jsx  –  UI component
//  Displays Time-of-Flight distance sensor data.
//
//  Props:
//    tof  – { distanceCm, status }
//    live – boolean; true when receiving real/simulated data
// ─────────────────────────────────────────────

// Distance ranges for the visual bar (firmware dummy: 10–50 cm)
const MIN_CM = 0
const MAX_CM = 60

function DistanceBar({ distanceCm, live }) {
  const pct = Math.min(100, Math.max(0, ((distanceCm - MIN_CM) / (MAX_CM - MIN_CM)) * 100))

  // Color shifts: green (close) → amber → red (far)
  const barColor =
    pct < 35 ? '#22c55e'
    : pct < 65 ? '#f59e0b'
    : '#ef4444'

  return (
    <div className="mt-2 mb-[18px]">
      <div className="flex items-end gap-2 mb-1">
        <span
          className={`text-2xl font-mono font-bold tabular-nums transition-colors ${
            live ? 'text-[var(--accent)]' : 'text-[var(--text-h)]'
          }`}
        >
          {live ? distanceCm.toFixed(1) : '—'}
        </span>
        <span className="text-xs font-mono opacity-50 mb-1">cm</span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-[var(--border)] overflow-hidden w-36">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width:      `${live ? pct : 0}%`,
            background: barColor,
          }}
        />
      </div>
      <div className="flex justify-between text-[10px] font-mono opacity-40 mt-0.5 w-36">
        <span>{MIN_CM}</span>
        <span>{MAX_CM} cm</span>
      </div>
    </div>
  )
}

function StatusBadge({ status, live }) {
  const isOk      = status === 'OK'
  const isUnknown = !live || status === 'UNKNOWN'
  return (
    <div className="mb-[18px]">
      <span className="text-xs font-mono font-semibold">Sensor Status</span>
      <div className="mt-1">
        <span
          className={`inline-block text-xs font-mono px-2 py-0.5 rounded-full border transition-colors ${
            isUnknown
              ? 'border-gray-300 text-gray-400 bg-gray-100'
              : isOk
              ? 'border-green-500 text-green-600 bg-green-50'
              : 'border-red-400 text-red-500 bg-red-50'
          }`}
        >
          {isUnknown ? '– –' : isOk ? '✓ OK' : `✕ ${status}`}
        </span>
      </div>
    </div>
  )
}

export function TofReadings({ tof, live = false }) {
  return (
    <div className="min-w-[160px]">
      <span className="text-xs font-mono font-semibold block mb-1">
        Distance
        <span className="font-normal opacity-60"> ToF</span>
      </span>
      <DistanceBar distanceCm={tof.distanceCm} live={live} />
      <StatusBadge status={tof.status} live={live} />
    </div>
  )
}