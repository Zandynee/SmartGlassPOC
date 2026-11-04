// ─────────────────────────────────────────────
//  PpgReadings.jsx  –  "Heart Rate" card
//  Layout:
//    left   – BPM circle + status pill (Aman / Lelah)
//    right  – oscilloscope + one-line fatigue caption
//    below  – collapsible raw-signal details (IR / Red / fatigue index)
//
//  Props:
//    ppg  – { hrBpm, fatigueIndex, fatigueStatus,
//              irRaw, redRaw, hrDetectable }
//    live – boolean; true when receiving real/simulated data
// ─────────────────────────────────────────────

import { Card } from './Card'
import { BpmOscilloscope } from './BpmOscilloscope'

// MAX30102 is 18-bit (0 – 262 143)
const IR_MAX = 262143

// ── BPM circle ─────────────────────────────────
function BpmCircle({ hrBpm, hrDetectable, live }) {
  const acquiring = live && !hrDetectable

  return (
    <div
      className={`flex flex-col items-center justify-center rounded-full bg-[var(--vg-blue-soft)] border-4 border-[var(--vg-blue)]
                  w-32 h-32 ${acquiring ? 'animate-pulse' : ''}`}
      title={acquiring ? 'Mengukur… letakkan sensor dengan benar' : undefined}
    >
      <span className="text-4xl font-extrabold tabular-nums leading-none">
        {!live ? '—' : acquiring ? '…' : Math.round(hrBpm)}
      </span>
      <span className="mt-1 text-xs font-semibold text-slate-500">bpm</span>
    </div>
  )
}

// ── Status pill ────────────────────────────────
function StatusPill({ fatigueStatus, hrDetectable, live, abnormal }) {
  let text  = '—'
  let style = 'bg-slate-100 text-slate-500'

  if (live && abnormal) {
    text  = 'Abnormal'
    style = 'bg-red-100 text-red-600'
  } else if (live && !hrDetectable) {
    text  = 'Mengukur…'
    style = 'bg-amber-100 text-amber-700'
  } else if (live && fatigueStatus === 'FATIGUED') {
    text  = 'Lelah'
    style = 'bg-red-100 text-red-600'
  } else if (live && fatigueStatus !== 'UNKNOWN') {
    text  = 'Aman'
    style = 'bg-[var(--vg-blue-soft)] text-[var(--vg-tab-active)]'
  }

  return (
    <span className={`inline-block rounded-full px-5 py-1 text-sm font-bold ${style}`}>
      {text}
    </span>
  )
}

// ── Fatigue caption under the scope ────────────
function FatigueCaption({ fatigueStatus, live }) {
  const fatigued = live && fatigueStatus === 'FATIGUED'
  return (
    <p className="m-0 text-sm font-semibold text-slate-600">
      {!live
        ? 'Menunggu data sensor'
        : fatigued
        ? 'Terdeteksi mulai '
        : 'Tidak dalam keadaan '}
      {live && <em className="font-bold">Mental Fatigue</em>}
    </p>
  )
}

// ── Change vs. calibration baseline ────────────
function DeltaCaption({ delta, abnormal, pending }) {
  if (pending) {
    return <p className="m-0 text-xs text-slate-500">Menunggu pembacaan valid untuk titik awal…</p>
  }
  if (!delta) return null
  const sign = (n) => (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(0)
  return (
    <p className={`m-0 text-xs font-semibold tabular-nums ${abnormal ? 'text-red-600' : 'text-slate-500'}`}>
      Dari titik awal: {sign(delta.hrBpm)} bpm · indeks kelelahan {sign(delta.fatigueIndex)}
      {abnormal && ' · di luar batas normal'}
    </p>
  )
}

// ── Raw signal details (kept for engineers) ────
function RawDetails({ ppg, live }) {
  const row = (label, value, pct, color) => (
    <div className="flex items-center gap-2">
      <span className="w-8 text-slate-400">{label}</span>
      <span className="tabular-nums w-16">{live ? value.toLocaleString() : '—'}</span>
      <div className="h-1.5 w-28 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-200"
          style={{ width: `${live ? pct : 0}%`, background: color }}
        />
      </div>
    </div>
  )

  return (
    <details className="mt-4 pt-3 border-t border-slate-100 text-xs font-mono">
      <summary className="cursor-pointer text-slate-500 hover:text-slate-900">Detail sinyal PPG</summary>
      <div className="mt-2 flex flex-col gap-1.5">
        {row('IR',  ppg.irRaw,  Math.min(100, (ppg.irRaw  / IR_MAX) * 100), '#818cf8')}
        {row('Red', ppg.redRaw, Math.min(100, (ppg.redRaw / IR_MAX) * 100), '#f87171')}
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Indeks kelelahan</span>
          <span className="tabular-nums">{live ? `${Math.round(ppg.fatigueIndex)} / 100` : '—'}</span>
        </div>
      </div>
    </details>
  )
}

// ── Root component ─────────────────────────────
export function PpgReadings({ ppg, live = false, delta = null, abnormal = false, baselinePending = false }) {
  return (
    <Card title="Heart Rate" dot="#ef4444">
      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-5 items-center">
        {/* Left column */}
        <div className="flex flex-col items-center gap-3">
          <BpmCircle hrBpm={ppg.hrBpm} hrDetectable={ppg.hrDetectable} live={live} />
          <StatusPill
            fatigueStatus={ppg.fatigueStatus}
            hrDetectable={ppg.hrDetectable}
            live={live}
            abnormal={abnormal}
          />
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-2 min-w-0">
          <BpmOscilloscope live={live} />
          <FatigueCaption fatigueStatus={ppg.fatigueStatus} live={live} />
          <DeltaCaption delta={delta} abnormal={abnormal} pending={baselinePending} />
        </div>
      </div>

      <RawDetails ppg={ppg} live={live} />
    </Card>
  )
}
