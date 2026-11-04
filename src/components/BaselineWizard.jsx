// ─────────────────────────────────────────────
//  BaselineWizard.jsx  –  STATE A · BASELINE_CREATION (dashboard is locked)
//
//  Part 1  glasses OFF, fingertip on the sensor → ~2 min resting HRV
//          (SDNN / RMSSD / pNN50, computed in the app from raw 100 Hz PPG)
//  Part 2  glasses ON, sit upright → ~5 s of IMU pitch = "straight" reference
//  Then the baseline is stored locally and the app sends cmd 1 (WORK_MODE).
//
//  Props: g = result of useGlassesSession()
// ─────────────────────────────────────────────

import { Card } from './Card'
import { RingProgress } from './RingProgress'
import { STEP, selectWizPart, selectWizProgress, selectWizBlocked } from '../services/glassesMachine'
import { hasContact } from '../services/glassesSession'

const HRV_ERRORS = {
  too_short: 'The recording was too short. Please try again.',
  no_signal: 'No pulse signal was found. Press your fingertip gently but firmly on the sensor.',
  too_few_beats: 'Too few heartbeats were detected. Keep your finger still and try again.',
  too_noisy: 'The signal was too noisy (movement?). Keep your hand still and try again.',
  data_loss: 'Bluetooth dropped too many samples. Move closer to the computer and try again.',
  link_lost: 'The connection to the glasses was lost, so the recording was discarded. It restarts when they reconnect.',
}
const POSTURE_ERRORS = {
  moved: 'You moved too much. Sit straight, look ahead and hold still.',
  too_few: 'Not enough posture data was received. Check the connection and try again.',
}

function Part({ n, active, done, children }) {
  return (
    <div className={`flex items-center gap-2 text-sm font-semibold ${active ? 'text-blue-700' : done ? 'text-emerald-600' : 'text-slate-400'}`}>
      <span className={`w-6 h-6 rounded-full grid place-items-center text-xs text-white ${active ? 'bg-blue-600' : done ? 'bg-emerald-500' : 'bg-slate-300'}`}>
        {done ? '✓' : n}
      </span>
      {children}
    </div>
  )
}

function Metric({ label, value, unit }) {
  return (
    <div className="rounded-xl bg-[#f5f9ff] border border-[#dbe6f7] p-3 text-center">
      <div className="text-[11px] font-semibold text-slate-500">{label}</div>
      <div className="text-xl font-extrabold text-slate-800 tabular-nums">
        {Number.isFinite(value) ? value.toFixed(label === 'HR' ? 0 : 1) : '—'}
        <span className="text-xs font-semibold text-slate-500 ml-1">{unit}</span>
      </div>
    </div>
  )
}

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

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.round(s % 60))).padStart(2, '0')}`

export function BaselineWizard({ g }) {
  const { s, session } = g
  const w = s.wiz
  const part = selectWizPart(s)
  const progress = selectWizProgress(s)
  const blocked = selectWizBlocked(s)
  const contact = hasContact(g.ppg)

  const hrvTotalS = session.cfg.hrvMs / 1000
  const postureTotalS = session.cfg.postureMs / 1000

  let body
  if (blocked) {
    body = (
      <Notice tone="warn" title="Restart the glasses">
        The glasses are already past the setup phase, but this app has no baseline yet. Power-cycle the glasses
        so they re-enter BASELINE_CREATION, then reconnect.
      </Notice>
    )
  } else if (!s.fw) {
    body = (
      <Notice title={g.enabled ? 'Searching for glasses…' : 'Glasses not connected'}>
        {g.enabled ? 'Turn the glasses on and keep them close to this computer.' : 'Press Connect to begin.'}
      </Notice>
    )
  } else {
    switch (w.step) {
      case STEP.FINGER:
        body = (
          <Step
            title="Take the glasses off and place a fingertip on the sensor"
            text="Sit comfortably and keep your hand still. Recording starts by itself once a steady pulse signal is detected."
          >
            <Signal ok={contact} text={contact ? 'Finger detected – hold still…' : 'No finger detected'} />
            {w.hrvError && <Notice tone="warn">{HRV_ERRORS[w.hrvError] || 'Measurement failed. Try again.'}</Notice>}
            {s.baseline && (
              <div className="mt-2 flex items-center gap-3 flex-wrap text-sm text-slate-600">
                A baseline from {new Date(s.baseline.createdAt).toLocaleString()} is saved.
                <Btn kind="secondary" onClick={() => session.useSavedBaseline()}>Use saved baseline</Btn>
              </div>
            )}
          </Step>
        )
        break
      case STEP.HRV:
        body = (
          <Step title="Recording your resting heart rhythm" text="Keep your finger still and breathe normally.">
            <RingProgress value={progress} label={fmtTime(hrvTotalS * (1 - progress))} sub="remaining" />
            <Signal ok={contact} text={contact ? 'Good signal' : 'Signal lost – put your finger back'} />
          </Step>
        )
        break
      case STEP.HRV_DONE: {
        const r = w.hrvResult
        body = (
          <Step title="Resting HRV recorded" text="Now put the glasses on for the posture part.">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-xl">
              <Metric label="HR" value={r.hrBpm} unit="bpm" />
              <Metric label="SDNN" value={r.sdnn} unit="ms" />
              <Metric label="RMSSD" value={r.rmssd} unit="ms" />
              <Metric label="pNN50" value={r.pnn50} unit="%" />
            </div>
            <div className="flex gap-2">
              <Btn onClick={() => session.readyPosture()}>Continue</Btn>
              <Btn kind="secondary" onClick={() => session.retryHrv()}>Redo</Btn>
            </div>
          </Step>
        )
        break
      }
      case STEP.WEAR:
        body = (
          <Step title="Put the glasses on and sit up straight" text="Look straight ahead, shoulders relaxed. This becomes your “good posture” reference.">
            {w.postureError && <Notice tone="warn">{POSTURE_ERRORS[w.postureError]}</Notice>}
            <Btn onClick={() => session.readyPosture()} disabled={g.offline}>I'm sitting straight – start</Btn>
          </Step>
        )
        break
      case STEP.POSTURE:
        body = (
          <Step title="Hold still…" text="Measuring your upright posture.">
            <RingProgress value={progress} label={`${Math.ceil(postureTotalS * (1 - progress))}s`} sub="remaining" />
          </Step>
        )
        break
      case STEP.SAVING:
        body = (
          <Step title="Saving your baseline…">
            {w.saveError && (
              <Notice tone="warn" title="Could not save">
                {w.saveError} <Btn kind="secondary" onClick={() => session.retrySave()}>Try again</Btn>
              </Notice>
            )}
          </Step>
        )
        break
      case STEP.DONE:
      default:
        body = (
          <Step title="Baseline saved" text="Starting Work mode on the glasses…">
            {g.error && <Notice tone="warn">{g.error} – retrying…</Notice>}
          </Step>
        )
    }
  }

  return (
    <Card title="Set up your baseline" dot="#2563eb" className="max-w-3xl mx-auto w-full">
      <div className="flex items-center gap-6 flex-wrap mb-5">
        <Part n={1} active={part === 1} done={part === 2}>Resting HRV (glasses off)</Part>
        <Part n={2} active={part === 2} done={w.step === STEP.DONE}>Posture (glasses on)</Part>
      </div>
      <div className="flex flex-col items-center gap-4 text-center py-4">{body}</div>
      <p className="text-xs text-slate-400 m-0 mt-2">The dashboard unlocks when both parts are saved. Your data stays on this computer.</p>
    </Card>
  )
}

function Step({ title, text, children }) {
  return (
    <>
      <h3 className="m-0 text-lg font-extrabold text-slate-800">{title}</h3>
      {text && <p className="m-0 text-sm text-slate-500 max-w-md">{text}</p>}
      {children}
    </>
  )
}

function Signal({ ok, text }) {
  return (
    <div className={`inline-flex items-center gap-2 text-sm font-semibold ${ok ? 'text-emerald-600' : 'text-slate-500'}`}>
      <span className={`w-2.5 h-2.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-slate-300'}`} />
      {text}
    </div>
  )
}

function Notice({ title, tone = 'info', children }) {
  const c = tone === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-blue-50 border-blue-200 text-blue-800'
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm text-left max-w-md ${c}`}>
      {title && <div className="font-bold mb-0.5">{title}</div>}
      {children}
    </div>
  )
}
