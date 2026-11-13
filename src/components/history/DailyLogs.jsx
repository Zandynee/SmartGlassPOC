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
      className="shrink-0 flex flex-col bg-white border-t lg:border-t-0 lg:border-l border-line
                 lg:w-sidebar lg:sticky lg:top-topbar lg:h-below-topbar
                 max-lg:max-h-overlay"
    >
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h2 className="m-0 text-lg font-extrabold">Log Harian</h2>
        <span className="px-2.5 py-0.5 rounded-full bg-brand-soft text-brand text-xs font-bold">
          {sessions.length} sesi
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {sessions.length === 0 && (
          <p className="px-3 py-6 text-sm text-ink-muted">
            {loading ? 'Memuat sesi…' : 'Tidak ada sesi pada rentang ini.'}
          </p>
        )}

        {groups.map((g) => (
          <section key={g.key} className="mb-3">
            <h3 className="sticky top-0 z-raised m-0 px-2 py-1.5 bg-white/95 text-caption font-bold uppercase tracking-wide text-ink-faint">
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
                          ? 'bg-brand-soft border-brand'
                          : 'border-transparent hover:bg-mist hover:border-line'
                      }`}
                    >
                      <span
                        className={`shrink-0 grid place-items-center size-touch rounded-full ${
                          sim ? 'bg-warning-tint text-warning' : 'bg-brand-soft text-brand'
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
                              className="shrink-0 size-dot-sm rounded-full bg-ok-solid animate-pulse"
                            />
                          )}
                        </span>
                        <span className="block truncate text-xs text-ink-muted tabular-nums">
                          {fmtClock(s.started_at)} · {running ? `aktif ${duration}` : duration}
                          {stats?.hr != null && ` · ${formatValue(stats.hr, 0)} bpm`}
                          {!stats && ' · …'}
                        </span>
                      </span>

                      <ChevronRight size={18} className="shrink-0 text-ink-faint" />
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
