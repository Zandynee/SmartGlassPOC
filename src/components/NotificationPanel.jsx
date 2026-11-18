// ─────────────────────────────────────────────
//  NotificationPanel.jsx  –  "Notifikasi" right sidebar
//  Same shell as the Data Riwayat "Log Harian" sidebar
//  (white, left border, sticky, full height). Newest-first list:
//    info    → blue dot    (connection events)
//    warning → amber dot   (screen time, posture)
//    danger  → red dot     (fatigue)
//
//  Props:
//    items – [{ id, level, message, at }]  (see hooks/useNotifications)
// ─────────────────────────────────────────────

const LEVEL_DOT = {
  info:    'bg-info',
  warning: 'bg-caution',
  danger:  'bg-alert',
}

// 1765000000000 → "18:14, 6 Juni"   (also used by HistoryTopBar)
export function fmtStamp(ms) {
  const d  = new Date(ms)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const month = d.toLocaleDateString('id-ID', { month: 'long' })
  return `${hh}:${mm}, ${d.getDate()} ${month}`
}

export function NotificationPanel({ items }) {
  return (
    <aside
      className="shrink-0 flex flex-col bg-white border-t lg:border-t-0 lg:border-l border-line
                 lg:w-sidebar lg:sticky lg:top-topbar lg:h-below-topbar
                 max-lg:max-h-overlay"
    >
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h2 className="m-0 text-lg font-semibold">Notifikasi</h2>
        <span className="font-mono text-xs text-ink-muted tabular-nums">{items.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {items.length === 0 && (
          <p className="px-3 py-6 text-sm text-ink-muted">Belum ada notifikasi.</p>
        )}

        <ul className="flex flex-col gap-2">
          {items.map((n) => (
            <li key={n.id} className="flex items-start gap-3 rounded-xl border border-line bg-white px-3 py-3">
              <span className={`mt-2 shrink-0 size-dot-sm rounded-full ${LEVEL_DOT[n.level] ?? LEVEL_DOT.info}`} />
              <div className="min-w-0 flex-1">
                <p className="m-0 text-label font-medium leading-snug">{n.message}</p>
                <time className="block mt-1 font-mono text-caption text-ink-muted tabular-nums">
                  {fmtStamp(n.at)}
                </time>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}
