// ─────────────────────────────────────────────
//  HistoryRail.jsx  –  slim left navigation rail
//  Icon stack (Beranda, Data Riwayat) with an optional exit icon
//  pinned to the bottom. Hidden on narrow windows (the top bar has the tabs).
//
//  Props:
//    tab        – 'home' | 'history'
//    onNavigate – (tabId) => void
//    onExit     – () => void    optional; the exit icon is hidden when omitted
//                               (Beranda has nowhere to exit to)
// ─────────────────────────────────────────────

import { HistoryIcon, HomeIcon, LogoutIcon } from '../icons'

const ITEMS = [
  { id: 'home',    label: 'Beranda',      Icon: HomeIcon },
  { id: 'history', label: 'Data Riwayat', Icon: HistoryIcon },
]

export function HistoryRail({ tab, onNavigate, onExit }) {
  return (
    <aside
      className="hidden md:flex shrink-0 w-[68px] flex-col items-center justify-between py-4
                 bg-white border-r border-[#dbe6f7] sticky top-16 h-[calc(100svh-4rem)]"
    >
      <nav className="flex flex-col items-center gap-2" aria-label="Menu samping">
        {ITEMS.map(({ id, label, Icon }) => {
          const active = tab === id
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              title={label}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className={`grid place-items-center w-11 h-11 rounded-xl cursor-pointer transition-colors ${
                active
                  ? 'bg-[var(--vg-blue-soft)] text-[var(--vg-tab-active)]'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon size={22} />
            </button>
          )
        })}
      </nav>

      {onExit ? (
        <button
          onClick={onExit}
          title="Keluar ke Beranda"
          aria-label="Keluar ke Beranda"
          className="grid place-items-center w-11 h-11 rounded-xl text-slate-500 hover:bg-red-50 hover:text-red-600 cursor-pointer transition-colors"
        >
          <LogoutIcon size={22} />
        </button>
      ) : (
        <span />
      )}
    </aside>
  )
}
