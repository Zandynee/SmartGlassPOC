// ─────────────────────────────────────────────
//  PpgReadings.jsx  –  UI component
//  Displays PPG (Photoplethysmography) data:
//  heart rate, oscilloscope waveform, and fatigue.
//
//  Props:
//    ppg  – { hrBpm, fatigueIndex, fatigueStatus }
//    live – boolean; true when receiving real/simulated data
// ─────────────────────────────────────────────

import { BpmOscilloscope } from './BpmOscilloscope'

function HeartRate({ hrBpm, live }) {
  return (
    <div className="mb-[14px]">
      <span className="text-xs font-mono font-semibold block mb-1">
        Heart Rate
        <span className="font-normal opacity-60"> PPG</span>
      </span>
      <div className="flex items-end gap-2">
        <span
          className={`text-2xl font-mono font-bold tabular-nums transition-colors ${
            live ? 'text-[var(--accent)]' : 'text-[var(--text-h)]'
          }`}
        >
          {live ? hrBpm.toFixed(1) : '—'}
        </span>
        <span className="text-xs font-mono opacity-50 mb-1">BPM</span>
      </div>
    </div>
  )
}

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

export function PpgReadings({ ppg, live = false }) {
  return (
    <div className="min-w-[160px]">
      <HeartRate hrBpm={ppg.hrBpm} live={live} />

      {/* Oscilloscope — receives BPM so it can pace its synthetic waveform */}
      <BpmOscilloscope hrBpm={ppg.hrBpm} live={live} />

      <FatigueBar fatigueIndex={ppg.fatigueIndex} live={live} />
      <FatigueStatusBadge fatigueStatus={ppg.fatigueStatus} live={live} />
    </div>
  )
}