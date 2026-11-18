// ─────────────────────────────────────────────
//  GlassesControls.jsx  –  replaces Controls.jsx
//    • Connect / Disconnect (supervisor keeps reconnecting until you press Disconnect)
//    • Mode switch: real glasses ⇄ simulation (only while disconnected)
//    • Simulation test knobs (finger, HRV drop, slouch, distance, link drop, reboot)
//
//  Props: g = useGlassesSession() result · simulate · onSimulate(bool)
// ─────────────────────────────────────────────

import { useReducer } from 'react'
import { GLASSES_STATE } from '../services/bleConfig'
import { LINK } from '../services/bleService'
import { CloseIcon } from './icons'

const btn =
  'inline-flex items-center gap-2 h-control px-4 rounded-lg bg-white border border-line-strong text-sm font-semibold ' +
  'cursor-pointer transition-colors hover:bg-mist disabled:cursor-not-allowed disabled:opacity-40'

function Spinner() {
  return <span className="inline-block size-spinner rounded-full border-2 border-brand border-t-transparent animate-spin" aria-hidden="true" />
}

function SimKnobs({ sim }) {
  const [, force] = useReducer((x) => x + 1, 0)
  const set = (k, v) => { sim[k] = v; force() }
  const row = 'flex items-center gap-2 text-xs font-semibold text-ink-soft'

  return (
    <details open className="w-full max-w-xl rounded-xl border border-line bg-white px-4 py-3 text-left">
      <summary className="cursor-pointer text-xs font-medium text-ink-muted">Panel simulasi (uji tanpa perangkat)</summary>
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
        <label className={row}>
          <input type="checkbox" checked={sim.fingerOn} onChange={(e) => set('fingerOn', e.target.checked)} /> Jari di sensor
        </label>
        <label className={row}>
          <input type="checkbox" checked={sim.hrvDrop} onChange={(e) => set('hrvDrop', e.target.checked)} /> HRV turun (simulasi)
        </label>
        <label className={row}>
          Membungkuk {sim.slouchDeg}°
          <input type="range" min="0" max="30" value={sim.slouchDeg} onChange={(e) => set('slouchDeg', +e.target.value)} />
        </label>
        <label className={row}>
          Jarak {sim.distanceCm} cm
          <input type="range" min="10" max="80" value={sim.distanceCm} onChange={(e) => set('distanceCm', +e.target.value)} />
        </label>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className={`${btn} h-control-sm text-xs`} onClick={() => sim.dropLink(5000)}>Putuskan 5 dtk</button>
        <button className={`${btn} h-control-sm text-xs`} onClick={() => sim.setFirmwareState(GLASSES_STATE.BASELINE_CREATION)}>
          Reboot kacamata (menuju BASELINE)
        </button>
      </div>
    </details>
  )
}

export function GlassesControls({ g, simulate, onSimulate }) {
  const link = g.s.link
  const online = link === LINK.ONLINE
  const searching = g.enabled && !online

  return (
    <div className="flex flex-col items-end gap-2">
      {g.error && (
        <p className="flex items-center gap-2 max-w-xl text-xs font-mono text-danger border border-danger-line-strong bg-danger-surface rounded-lg px-3 py-2"><CloseIcon size={14} className="shrink-0" /> {g.error}</p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <div role="group" aria-label="Sumber data" className="inline-flex p-1 rounded-xl bg-wash border border-line">
          {[[false, 'Perangkat'], [true, 'Simulasi']].map(([v, label]) => (
            <button
              key={label}
              disabled={g.enabled}
              onClick={() => onSimulate(v)}
              title={g.enabled ? 'Putuskan dulu untuk mengganti sumber' : undefined}
              className={`h-control-sm px-3 rounded-lg text-sm font-medium disabled:cursor-not-allowed ${
                simulate === v ? 'bg-white text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          className={`${btn} text-ink-strong`}
          onClick={g.enabled ? g.disconnect : g.connect}
          aria-busy={searching}
        >
          {searching ? <Spinner /> : (
            <span className={`inline-block size-dot-sm rounded-full ${online ? 'bg-ok-solid' : 'bg-ink-faint'}`} />
          )}
          {!g.enabled ? 'Hubungkan' : searching ? 'Batalkan pencarian' : 'Putuskan'}
        </button>
      </div>

      {simulate && g.sim && <SimKnobs sim={g.sim} />}
    </div>
  )
}
