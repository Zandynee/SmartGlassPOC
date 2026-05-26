// ─────────────────────────────────────────────
//  PpgReadings.jsx  –  UI component
//  Displays PPG (Photoplethysmography) data:
//    • Raw IR / Red ADC values with level bars
//    • Heart rate (BPM) with "undetectable" state
//    • Oscilloscope waveform (real IR data)
//    • Fatigue index & status
//
//  Props:
//    ppg  – { hrBpm, fatigueIndex, fatigueStatus,
//              irRaw, redRaw, hrDetectable }
//    live – boolean; true when receiving real/simulated data
// ─────────────────────────────────────────────

import { BpmOscilloscope } from './BpmOscilloscope'

// ── MAX30102 is 18-bit (0 – 262 143) ──────────
const IR_MAX = 262143

// ── Raw IR / Red sensor values ─────────────────
function RawPpgValues({ irRaw, redRaw, live }) {
  const irPct  = Math.min(100, (irRaw  / IR_MAX) * 100)
  const redPct = Math.min(100, (redRaw / IR_MAX) * 100)

  return (
    <div className="mb-[18px]">
      <span className="text-xs font-mono font-semibold block mb-2">
        Raw ADC
        <span className="font-normal opacity-60"> IR / Red</span>
      </span>

      {/* IR channel */}
      <div className="mb-2">
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="text-[10px] font-mono w-7 opacity-50 shrink-0">IR</span>
          <span
            className={`text-sm font-mono tabular-nums transition-colors ${
              live ? 'text-[var(--accent)]' : 'text-[var(--text-h)]'
            }`}
          >
            {live ? irRaw.toLocaleString() : '—'}
          </span>
          {live && (
            <span className="text-[10px] font-mono opacity-40">
              / {IR_MAX.toLocaleString()}
            </span>
          )}
        </div>
        <div className="h-1.5 rounded-full bg-[var(--border)] overflow-hidden w-36">
          <div
            className="h-full rounded-full transition-all duration-200"
            style={{
              width:      `${live ? irPct : 0}%`,
              background: '#818cf8',   // indigo — near-infrared channel
            }}
          />
        </div>
      </div>

      {/* Red channel */}
      <div>
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="text-[10px] font-mono w-7 opacity-50 shrink-0">Red</span>
          <span
            className={`text-sm font-mono tabular-nums transition-colors ${
              live ? 'text-[var(--accent)]' : 'text-[var(--text-h)]'
            }`}
          >
            {live ? redRaw.toLocaleString() : '—'}
          </span>
          {live && (
            <span className="text-[10px] font-mono opacity-40">
              / {IR_MAX.toLocaleString()}
            </span>
          )}
        </div>
        <div className="h-1.5 rounded-full bg-[var(--border)] overflow-hidden w-36">
          <div
            className="h-full rounded-full transition-all duration-200"
            style={{
              width:      `${live ? redPct : 0}%`,
              background: '#f87171',   // red — visible-red channel
            }}
          />
        </div>
      </div>
    </div>
  )
}

// ── Heart rate ─────────────────────────────────
function HeartRate({ hrBpm, hrDetectable, live }) {
  // Three display states:
  //   1. Not live         → '—'  (grey)
  //   2. Live, no reading → 'Undetectable' badge
  //   3. Live, reading OK → BPM value
  const undetectable = live && !hrDetectable

  return (
    <div className="mb-[14px]">
      <span className="text-xs font-mono font-semibold block mb-1">
        Heart Rate
        <span className="font-normal opacity-60"> PPG</span>
      </span>

      {undetectable ? (
        /* Acquiring / no-contact state */
        <div className="flex items-center gap-2">
          <span
            className="inline-block text-xs font-mono px-2 py-0.5 rounded-full border
                       border-amber-400 text-amber-500 bg-amber-50 animate-pulse"
          >
            ⏳ Acquiring…
          </span>
          <span className="text-[10px] font-mono opacity-40">awaiting signal</span>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <span
            className={`text-2xl font-mono font-bold tabular-nums transition-colors ${
              live ? 'text-[var(--accent)]' : 'text-[var(--text-h)]'
            }`}
          >
            {live ? hrBpm.toFixed(1) : '—'}
          </span>
          {live && <span className="text-xs font-mono opacity-50 mb-1">BPM</span>}
        </div>
      )}
    </div>
  )
}

// ── Fatigue bar ────────────────────────────────
function FatigueBar({ fatigueIndex, live }) {
  const pct = Math.min(100, Math.max(0, fatigueIndex))

  const barColor =
    pct < 50  ? '#22c55e'
    : pct < 75 ? '#f59e0b'
    : '#ef4444'

  return (
    <div className="mb-[18px]">
      <span className="text-xs font-mono font-semibold">Fatigue Index</span>
      <div className="flex items-end gap-2 mt-1 mb-1">
        <span
          className={`text-lg font-mono font-bold tabular-nums transition-colors ${
            live ? 'text-[var(--accent)]' : 'text-[var(--text-h)]'
          }`}
        >
          {live ? Math.round(fatigueIndex) : '—'}
        </span>
        <span className="text-xs font-mono opacity-50 mb-0.5">/ 100</span>
      </div>

      <div className="h-1.5 rounded-full bg-[var(--border)] overflow-hidden w-36">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width:      `${live ? pct : 0}%`,
            background: barColor,
          }}
        />
      </div>
      <div className="flex justify-between text-[10px] font-mono opacity-40 mt-0.5 w-36">
        <span>fresh</span>
        <span>fatigued</span>
      </div>
    </div>
  )
}

// ── Fatigue status badge ───────────────────────
function FatigueStatusBadge({ fatigueStatus, live }) {
  const isFatigued = fatigueStatus === 'FATIGUED'
  const isUnknown  = !live || fatigueStatus === 'UNKNOWN'
  return (
    <div className="mb-[18px]">
      <span className="text-xs font-mono font-semibold">Fatigue Status</span>
      <div className="mt-1">
        <span
          className={`inline-block text-xs font-mono px-2 py-0.5 rounded-full border transition-colors ${
            isUnknown
              ? 'border-gray-300 text-gray-400 bg-gray-100'
              : isFatigued
              ? 'border-red-400 text-red-500 bg-red-50'
              : 'border-green-500 text-green-600 bg-green-50'
          }`}
        >
          {isUnknown ? '– –' : isFatigued ? '⚠ FATIGUED' : '✓ FRESH'}
        </span>
      </div>
    </div>
  )
}

// ── Root component ─────────────────────────────
export function PpgReadings({ ppg, live = false }) {
  return (
    <div className="min-w-[160px]">
      {/* Raw ADC values — always at the top so engineers can inspect the signal */}
      <RawPpgValues irRaw={ppg.irRaw} redRaw={ppg.redRaw} live={live} />

      {/* Heart rate with acquiring / undetectable state */}
      <HeartRate hrBpm={ppg.hrBpm} hrDetectable={ppg.hrDetectable} live={live} />

      {/* Oscilloscope driven by the real IR display buffer in imuService */}
      <BpmOscilloscope live={live} />

      <FatigueBar fatigueIndex={ppg.fatigueIndex} live={live} />
      <FatigueStatusBadge fatigueStatus={ppg.fatigueStatus} live={live} />
    </div>
  )
}