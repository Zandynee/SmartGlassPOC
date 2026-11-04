// ─────────────────────────────────────────────
//  DailyLogs.jsx  –  right sidebar "Log Harian"
//  Scrollable list of recorded sessions in the selected range, grouped
//  by day. Row = icon · two text lines · chevron. Click opens SessionDetail.
//
//  Props:
//    sessions   – sessions inside the range (newest first)
//    histories  – { [id]: { imu, ppg, tof } }   (for the stats in line 2)
//    selectedId – highlighted session id
//    onOpen     – (session) => void
//    loading    – boolean
// ─────────────────────────────────────────────

import { useMemo } from 'react'
import {
  fmtClock,
  formatDayHeading,
  formatDuration,
  formatValue,
  isSimMode,
  modeLabel,
  summarizeHistory,
} from '../../utils/history'
import { BluetoothIcon, ChevronRight, PlayIcon } from '../icons'

function dayKey(t) {
  const d = new Date(t)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export function DailyLogs({ sessions, histories, selectedId, onOpen, loading }) {
  // [{ key, heading, items: [session] }]
  const groups = useMemo(() => {
    const out = []
    for (const s of sessions) {
      const key = dayKey(s.started_at)
      let g = out[out.length - 1]
      if (!g || g.key !== key) {
        g = { key, heading: formatDayHeading(s.started_at), items: [] }
        out.push(g)
      }
      g.items.push(s)
    }
    return out
  }, [sessions])

  return (
    <aside
      className="shrink-0 flex flex-col bg-white border-t lg:border-t-0 lg:border-l border-[#dbe6f7]
                 lg:w-[clamp(280px,22vw,400px)] lg:sticky lg:top-16 lg:h-[calc(100svh-4rem)]
                 max-lg:max-h-[70svh]"
    >
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h2 className="m-0 text-lg font-extrabold">Log Harian</h2>
        <span className="px-2.5 py-0.5 rounded-full bg-[var(--vg-blue-soft)] text-[var(--vg-tab-active)] text-xs font-bold">
          {sessions.length} sesi
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {sessions.length === 0 && (
          <p className="px-3 py-6 text-sm text-slate-500">
            {loading ? 'Memuat sesi…' : 'Tidak ada sesi pada rentang ini.'}
          </p>
        )}

        {groups.map((g) => (
          <section key={g.key} className="mb-3">
            <h3 className="sticky top-0 z-[1] m-0 px-2 py-1.5 bg-white/95 text-[11px] font-bold uppercase tracking-wide text-slate-400">
              {g.heading}
            </h3>

            <ul className="flex flex-col gap-1.5">
              {g.items.map((s) => {
                const h = histories[s.id]
                const stats = h ? summarizeHistory(h) : null
                const running = !s.ended_at
                const sim = isSimMode(s.mode)
                const Icon = sim ? PlayIcon : BluetoothIcon
                const selected = selectedId === s.id
                const duration = formatDuration((s.ended_at ?? Date.now()) - s.started_at)

                return (
                  <li key={s.id}>
                    <button
                      onClick={() => onOpen(s)}
                      aria-label={`Buka sesi ${s.id}`}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left cursor-pointer transition-colors border ${
                        selected
                          ? 'bg-[var(--vg-blue-soft)] border-[var(--vg-tab-active)]'
                          : 'border-transparent hover:bg-slate-50 hover:border-[#dbe6f7]'
                      }`}
                    >
                      <span
                        className={`shrink-0 grid place-items-center w-10 h-10 rounded-full ${
                          sim ? 'bg-amber-100 text-amber-600' : 'bg-[var(--vg-blue-soft)] text-[var(--vg-tab-active)]'
                        }`}
                      >
                        <Icon size={18} />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-bold">
                            Sesi #{s.id} · {modeLabel(s.mode)}
                          </span>
                          {running && (
                            <span
                              title="Sesi sedang berjalan"
                              className="shrink-0 w-2 h-2 rounded-full bg-green-500 animate-pulse"
                            />
                          )}
                        </span>
                        <span className="block truncate text-xs text-slate-500 tabular-nums">
                          {fmtClock(s.started_at)} · {running ? `aktif ${duration}` : duration}
                          {stats?.hr != null && ` · ${formatValue(stats.hr, 0)} bpm`}
                          {!stats && ' · …'}
                        </span>
                      </span>

                      <ChevronRight size={18} className="shrink-0 text-slate-400" />
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </aside>
  )
}
