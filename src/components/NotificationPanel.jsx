// ─────────────────────────────────────────────
//  NotificationPanel.jsx  –  "Notifikasi" right sidebar
//  Same shell as the Data Riwayat "Log Harian" sidebar
//  (white, left border, sticky, full height). Newest-first list:
//    info    → blue left border    (connection events)
//    warning → yellow left border  (screen time, posture)
//    danger  → red left border     (fatigue)
//
//  Props:
//    items – [{ id, level, message, at }]  (see hooks/useNotifications)
// ─────────────────────────────────────────────

const LEVEL_BORDER = {
  info:    'border-l-[#2f8cff]',
  warning: 'border-l-[#ffd400]',
  danger:  'border-l-[#ff3b3b]',
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
      className="shrink-0 flex flex-col bg-white border-t lg:border-t-0 lg:border-l border-[#dbe6f7]
                 lg:w-[clamp(280px,22vw,400px)] lg:sticky lg:top-16 lg:h-[calc(100svh-4rem)]
                 max-lg:max-h-[70svh]"
    >
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h2 className="m-0 text-lg font-extrabold">Notifikasi</h2>
        <span className="px-2.5 py-0.5 rounded-full bg-[var(--vg-blue-soft)] text-[var(--vg-tab-active)] text-xs font-bold">
          {items.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {items.length === 0 && (
          <p className="px-3 py-6 text-sm text-slate-500">Belum ada notifikasi.</p>
        )}

        <ul className="flex flex-col gap-2">
          {items.map((n) => (
            <li
              key={n.id}
              className={`rounded-xl border border-[#dbe6f7] border-l-4 bg-white px-3 py-2.5 ${
                LEVEL_BORDER[n.level] ?? LEVEL_BORDER.info
              }`}
            >
              <p className="m-0 text-[13px] font-semibold leading-snug">{n.message}</p>
              <time className="block mt-1 text-right text-[11px] font-bold text-slate-500 tabular-nums">
                {fmtStamp(n.at)}
              </time>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}
