// ─────────────────────────────────────────────
//  CheckModeScreen.jsx  –  STATE C · CHECK_MODE
//
//  Measuring (≈2 min) → compares current HRV with the stored baseline →
//  "Fatigue Detected" when most indicators dropped significantly.
//  Afterwards: continue working (writes 1) or end the session.
//
//  Props: g = result of useGlassesSession()
// ─────────────────────────────────────────────

import { useState } from 'react'
import { Card } from './Card'
import { RingProgress } from './RingProgress'
import { hasContact } from '../services/glassesSession'

const REASONS = {
  too_short: 'Not enough data was collected.',
  no_signal: 'No pulse signal was found. Make sure the glasses sit snugly against your skin.',
  too_few_beats: 'Too few heartbeats were detected.',
  too_noisy: 'The signal was too noisy. Sit still during the measurement.',
  data_loss: 'Bluetooth dropped too many samples.',
}
const LABELS = { rmssd: 'RMSSD', sdnn: 'SDNN', pnn50: 'pNN50' }
const UNITS = { rmssd: 'ms', sdnn: 'ms', pnn50: '%' }

const Btn = ({ onClick, children, kind = 'primary', disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50 ${
      kind === 'primary' ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-white border border-[#dbe6f7] text-slate-700 hover:bg-slate-50'
    }`}
  >
    {children}
  </button>
)

export function CheckModeScreen({ g }) {
  const { s, session } = g
  const { outcome, progress } = s.check
  const [busy, setBusy] = useState(false)
  const totalS = session.cfg.checkMs / 1000
  const contact = hasContact(g.ppg)

  const run = async (fn) => { setBusy(true); try { await fn() } finally { setBusy(false) } }

  // ── measuring ──
  if (!outcome) {
    const left = Math.ceil(totalS * (1 - progress))
    return (
      <Card title="Fatigue check" dot="#f59e0b" className="max-w-3xl mx-auto w-full">
        <div className="flex flex-col items-center gap-4 text-center py-4">
          <h3 className="m-0 text-lg font-extrabold text-slate-800">Measuring… please sit still</h3>
          <p className="m-0 text-sm text-slate-500 max-w-md">Relax and breathe normally for about {Math.round(totalS / 60 * 10) / 10 || 1} minutes.</p>
          <RingProgress value={progress} color="#f59e0b" label={`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`} sub="remaining" />
          {!g.offline && !contact && (
            <p className="m-0 text-sm font-semibold text-amber-700">Weak signal – check that the glasses sit snugly.</p>
          )}
          {g.offline && (
            <p className="m-0 text-sm font-semibold text-amber-700">Connection lost – the measurement restarts when the glasses reconnect.</p>
          )}
        </div>
      </Card>
    )
  }

  // ── failed measurement ──
  if (!outcome.ok) {
    return (
      <Card title="Fatigue check" dot="#f59e0b" className="max-w-3xl mx-auto w-full">
        <div className="flex flex-col items-center gap-4 text-center py-4">
          <h3 className="m-0 text-lg font-extrabold text-slate-800">Measurement failed</h3>
          <p className="m-0 text-sm text-slate-500 max-w-md">{REASONS[outcome.reason] || 'Something went wrong.'}</p>
          <div className="flex gap-2">
            <Btn onClick={() => session.retryCheck()}>Measure again</Btn>
            <Btn kind="secondary" disabled={busy || g.offline} onClick={() => run(() => session.continueWork())}>Back to work</Btn>
          </div>
          {g.error && <p className="m-0 text-sm text-amber-700">{g.error}</p>}
        </div>
      </Card>
    )
  }

  // ── result ──
  const fatigued = outcome.fatigued
  const m = outcome.cmp.metrics
  return (
    <Card title="Fatigue check" dot={fatigued ? '#ef4444' : '#22c55e'} className="max-w-3xl mx-auto w-full">
      <div className="flex flex-col items-center gap-4 text-center py-4">
        <div className={`rounded-2xl px-5 py-3 border ${fatigued ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
          <div className="text-2xl font-extrabold">{fatigued ? 'Fatigue Detected' : 'No fatigue detected'}</div>
          <div className="text-sm">
            {fatigued ? 'Your HRV dropped clearly below your baseline. Consider taking a break.' : 'Your HRV is close to your baseline.'}
          </div>
        </div>

        <table className="text-sm w-full max-w-md">
          <thead>
            <tr className="text-slate-500 text-xs">
              <th className="text-left font-semibold py-1">Indicator</th>
              <th className="font-semibold">Baseline</th>
              <th className="font-semibold">Now</th>
              <th className="font-semibold">Change</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(LABELS).map((k) => (
              <tr key={k} className="border-t border-[#e8eef9]">
                <td className="text-left py-1.5 font-semibold text-slate-700">{LABELS[k]}</td>
                {m[k].usable ? (
                  <>
                    <td className="tabular-nums">{m[k].base.toFixed(1)} {UNITS[k]}</td>
                    <td className="tabular-nums">{m[k].cur.toFixed(1)} {UNITS[k]}</td>
                    <td className={`tabular-nums font-bold ${m[k].dropped ? 'text-red-600' : 'text-slate-600'}`}>
                      {m[k].dropPct > 0 ? '−' : '+'}{Math.abs(m[k].dropPct).toFixed(0)}%
                    </td>
                  </>
                ) : (
                  <td colSpan={3} className="text-slate-400">not usable</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex gap-2 flex-wrap justify-center">
          <Btn disabled={busy || g.offline} onClick={() => run(() => session.continueWork())}>Continue working</Btn>
          <Btn kind="secondary" disabled={busy} onClick={() => run(() => session.endSession())}>End session</Btn>
        </div>
        {g.error && <p className="m-0 text-sm text-amber-700">{g.error}</p>}
      </div>
    </Card>
  )
}
