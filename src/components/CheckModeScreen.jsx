// ─────────────────────────────────────────────
//  CheckModeScreen.jsx  –  STATE C · CHECK_MODE
//
//  3 × 60 s windows (glasses still on the table, fingertip on the sensor) →
//  median RMSSD / SDNN vs. today's baseline (decision.js).
//  Result: one main message, RMSSD and SDNN change in %, quality ("2 dari 3 valid"),
//  reason + instruction when it failed, "not a medical device" note.
//  Buttons: "Istirahat sekarang" (back to work, Timer_D reset), "Ukur ulang", and "Batal" at any
//  moment (measuring or result): back to WORK_MODE, Timer_D kept.
//  No single fatigue score, no "kelelahan" label. HR is shown small, pNN50 never.
//
//  Props: g = result of useGlassesSession()
// ─────────────────────────────────────────────

import { useState } from 'react'
import { Card } from './Card'
import { Btn } from './Btn'
import { WindowDots } from './WindowDots'
import { PpgScope } from './PpgScope'
import { RingProgress } from './RingProgress'
import { hasContact } from '../services/glassesSession'
import { CHECK_STATUS } from '../services/decision'
import { isBaselineStale } from '../services/baselineStore'
import { STATUS_TEXT, NOT_MEDICAL, causeText, validText } from '../services/measureMessages'

const TONE = {
  warn: 'bg-warning-surface border-warning-line text-warning-deep',
  soft: 'bg-info-surface border-info-line text-info-strong',
  ok: 'bg-ok-surface border-ok-line text-ok-deep',
  invalid: 'bg-mist border-line text-ink-medium',
}

const pctText = (v) => (Number.isFinite(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(0)}%` : '—')
const ms = (v) => (Number.isFinite(v) ? `${v.toFixed(1)} ms` : '—')

export function CheckModeScreen({ g }) {
  const { s, session } = g
  const { outcome, progress, windows } = s.check
  const [busy, setBusy] = useState(false)
  const nWin = session.cfg.checkWindows
  const totalS = (session.cfg.windowMs / 1000) * nWin
  const contact = hasContact(g.ppg)
  const oldBaseline = s.baseline && isBaselineStale(s.baseline)

  const run = async (fn) => { setBusy(true); try { await fn() } finally { setBusy(false) } }

  // ── measuring ──
  if (!outcome) {
    const left = Math.ceil(totalS * (1 - progress))
    return (
      <Card title="Cek kondisi" dot="#f59e0b" className="max-w-3xl mx-auto w-full">
        <div className="flex flex-col items-center gap-4 text-center py-4">
          <h3 className="m-0 text-lg font-extrabold text-ink-strong">Mengukur… tahan diam</h3>
          <p className="m-0 text-sm text-ink-muted max-w-md">
            Kacamata tetap di meja, ujung jari telunjuk menempel pada sensor dengan tekanan sedang.
            Jangan menggeser jari, jangan mengetuk meja.
          </p>
          <RingProgress value={progress} color="#f59e0b" label={`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`} sub="tersisa" />
          <div className="w-full max-w-xl"><PpgScope session={session} contact={contact} /></div>
          <WindowDots total={nWin} windows={windows} progress={progress} />
          {!g.offline && !contact && <p className="m-0 text-sm font-semibold text-warning-strong">Jari terlepas. Tempel lagi dan tahan.</p>}
          <Btn kind="secondary" disabled={busy} onClick={() => run(() => session.cancelCheck())}>Batal</Btn>
        </div>
      </Card>
    )
  }

  const st = STATUS_TEXT[outcome.status]
  const invalid = outcome.status === CHECK_STATUS.INVALID
  const cause = causeText(outcome.cause)

  return (
    <Card title="Cek kondisi" dot={invalid ? '#94a3b8' : outcome.status === CHECK_STATUS.DROP ? '#f59e0b' : '#22c55e'} className="max-w-3xl mx-auto w-full">
      <div className="flex flex-col items-center gap-4 text-center py-4">
        <div className={`rounded-2xl px-5 py-3 border max-w-md ${TONE[st.tone]}`}>
          <div className="text-xl font-extrabold">{st.title}</div>
          <div className="text-sm">{invalid ? (outcome.reason === 'no_baseline' ? 'Belum ada baseline hari ini.' : `${cause.msg} ${cause.tip}`) : st.text}</div>
        </div>

        {!invalid && (
          <table className="text-sm w-full max-w-md">
            <thead>
              <tr className="text-ink-muted text-xs">
                <th className="text-left font-semibold py-1">Indikator</th>
                <th className="font-semibold">Baseline</th>
                <th className="font-semibold">Sekarang</th>
                <th className="font-semibold">Perubahan</th>
              </tr>
            </thead>
            <tbody>
              {[['RMSSD', outcome.rmssd], ['SDNN', outcome.sdnn]].map(([label, m]) => (
                <tr key={label} className="border-t border-line-faint">
                  <td className="text-left py-1.5 font-semibold text-ink-medium">{label}</td>
                  <td className="tabular-nums">{ms(m.base)}</td>
                  <td className="tabular-nums">{ms(m.cur)}</td>
                  <td className={`tabular-nums font-bold ${m.changePct <= -outcome.dropThr * 100 ? 'text-warning-strong' : 'text-ink-soft'}`}>
                    {pctText(m.changePct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="flex flex-col items-center gap-1">
          <WindowDots total={nWin} windows={outcome.windows} progress={1} />
          <div className="text-caption text-ink-muted">
            Kualitas: {validText(outcome.validWindows, outcome.totalWindows)}
            {!invalid && Number.isFinite(outcome.hrBpm?.cur) && <> · HR {outcome.hrBpm.cur.toFixed(0)} bpm</>}
          </div>
        </div>

        {oldBaseline && (
          <p className="m-0 text-caption text-ink-muted max-w-md">Dibandingkan dengan baseline tanggal {s.baseline.dateKey}.</p>
        )}

        <div className="flex gap-2 flex-wrap justify-center">
          {invalid ? (
            <Btn onClick={() => session.retryCheck()}>Ukur ulang</Btn>
          ) : (
            <Btn disabled={busy || g.offline} onClick={() => run(() => session.continueWork())}>Istirahat sekarang</Btn>
          )}
          {!invalid && <Btn kind="secondary" onClick={() => session.retryCheck()}>Ukur ulang</Btn>}
          <Btn kind="secondary" disabled={busy || g.offline} onClick={() => run(() => session.continueWork())}>
            {invalid ? 'Kembali bekerja' : 'Lanjut bekerja'}
          </Btn>
        </div>
        <button
          disabled={busy || g.offline}
          onClick={() => run(() => session.endSession())}
          className="text-xs text-ink-muted underline cursor-pointer disabled:opacity-50 bg-transparent border-0"
        >
          Akhiri sesi
        </button>
        {g.error && <p className="m-0 text-sm text-warning-strong">{g.error}</p>}
        <p className="m-0 text-caption text-ink-faint max-w-md">{NOT_MEDICAL}</p>
      </div>
    </Card>
  )
}
