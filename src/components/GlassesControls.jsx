// ─────────────────────────────────────────────
//  GlassesControls.jsx  –  replaces Controls.jsx
//    • Connect / Disconnect (supervisor keeps reconnecting until you press Disconnect)
//    • Mode switch: real glasses ⇄ simulation (only while disconnected)
//    • Simulation test knobs (finger, fatigue, slouch, distance, link drop, reboot)
//
//  Props: g = useGlassesSession() result · simulate · onSimulate(bool)
// ─────────────────────────────────────────────

import { useReducer } from 'react'
import { GLASSES_STATE } from '../services/bleConfig'
import { LINK } from '../services/bleService'

const btn =
  'inline-flex items-center gap-2 h-10 px-4 rounded-full bg-white border border-[#c9d9f2] text-sm font-semibold ' +
  'cursor-pointer transition-colors hover:border-[var(--vg-tab-active)] disabled:cursor-not-allowed disabled:opacity-40'

function Spinner() {
  return <span className="inline-block w-4 h-4 rounded-full border-2 border-[var(--vg-tab-active)] border-t-transparent animate-spin" aria-hidden="true" />
}

function SimKnobs({ sim }) {
  const [, force] = useReducer((x) => x + 1, 0)
  const set = (k, v) => { sim[k] = v; force() }
  const row = 'flex items-center gap-2 text-xs font-semibold text-slate-600'

  return (
    <details open className="w-full max-w-xl rounded-xl border border-[#dbe6f7] bg-white px-3 py-2 text-left">
      <summary className="cursor-pointer text-xs font-bold text-slate-500">Panel simulasi (uji tanpa perangkat)</summary>
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
        <label className={row}>
          <input type="checkbox" checked={sim.fingerOn} onChange={(e) => set('fingerOn', e.target.checked)} /> Jari di sensor
        </label>
        <label className={row}>
          <input type="checkbox" checked={sim.fatigued} onChange={(e) => set('fatigued', e.target.checked)} /> Kondisi lelah (HRV turun)
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
        <button className={`${btn} h-8 text-xs`} onClick={() => sim.dropLink(5000)}>Putuskan 5 dtk</button>
        <button className={`${btn} h-8 text-xs`} onClick={() => sim.setFirmwareState(GLASSES_STATE.BASELINE_CREATION)}>
          Reboot kacamata (→ BASELINE)
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
        <p className="max-w-xl text-xs font-mono text-red-600 border border-red-300 bg-red-50 rounded-xl px-3 py-1.5">✕ {g.error}</p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <div role="group" aria-label="Sumber data" className="inline-flex p-1 rounded-full bg-white border border-[#c9d9f2]">
          {[[false, 'Perangkat'], [true, 'Simulasi']].map(([v, label]) => (
            <button
              key={label}
              disabled={g.enabled}
              onClick={() => onSimulate(v)}
              title={g.enabled ? 'Putuskan dulu untuk mengganti sumber' : undefined}
              className={`h-8 px-3 rounded-full text-sm font-bold disabled:cursor-not-allowed ${
                simulate === v ? 'bg-[var(--vg-tab-active)] text-white' : 'text-slate-600 hover:bg-slate-100 disabled:hover:bg-transparent'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          className={`${btn} ${online ? 'text-green-700' : 'text-[var(--vg-tab-active)]'}`}
          onClick={g.enabled ? g.disconnect : g.connect}
          aria-busy={searching}
        >
          {searching ? <Spinner /> : (
            <span className={`inline-block w-2 h-2 rounded-full ${online ? 'bg-green-500' : 'bg-gray-400'}`} />
          )}
          {!g.enabled ? 'Hubungkan' : searching ? 'Batalkan pencarian' : 'Putuskan'}
        </button>
      </div>

      {simulate && g.sim && <SimKnobs sim={g.sim} />}
    </div>
  )
}
