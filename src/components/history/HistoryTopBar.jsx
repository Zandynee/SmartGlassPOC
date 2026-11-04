// ─────────────────────────────────────────────
//  HistoryTopBar.jsx  –  top navigation of the Data Riwayat page
//    left   : logo + "VisioGuard"
//    centre : text tabs (Beranda / Data Riwayat)
//    right  : notification bell (popover) + profile dropdown
//
//  Props:
//    tab            – 'home' | 'history'
//    onNavigate     – (tabId) => void
//    notifications  – [{ id, level, message, at }]  (useNotifications)
//    status         – { label, tone: 'on' | 'sim' | 'off' }
// ─────────────────────────────────────────────

import { useRef, useState } from 'react'
import { useClickOutside } from '../../hooks/useClickOutside'
import { fmtStamp } from '../NotificationPanel'
import { BellIcon, ChevronDown, GlassesIcon, HomeIcon, UserIcon } from '../icons'

const TABS = [
  { id: 'home',    label: 'Beranda' },
  { id: 'history', label: 'Data Riwayat' },
]

const LEVEL_BORDER = {
  info:    'border-l-[#2f8cff]',
  warning: 'border-l-[#ffd400]',
  danger:  'border-l-[#ff3b3b]',
}

const TONE_DOT = {
  on:  'bg-green-500',
  sim: 'bg-amber-400',
  off: 'bg-gray-400',
}

export function HistoryTopBar({ tab, onNavigate, notifications = [], status }) {
  const [menu, setMenu] = useState(null)          // 'bell' | 'user' | null
  const [seen, setSeen] = useState(0)             // how many notifications were opened
  const rightRef = useRef(null)

  useClickOutside(rightRef, () => setMenu(null), menu !== null)

  const unread = Math.max(0, notifications.length - seen)

  const toggleBell = () => {
    setMenu((m) => (m === 'bell' ? null : 'bell'))
    setSeen(notifications.length)
  }

  return (
    <header className="sticky top-0 z-30 grid grid-cols-[1fr_auto_1fr] items-center h-16 px-3 sm:px-4 md:px-6 bg-white border-b border-[#dbe6f7]">
  {/* ── Logo ── */}
  <div className="flex items-center gap-2.5 min-w-0">
    <span className="grid place-items-center w-12 h-12 shrink-0 rounded-xl bg-slate-400 shadow-sm border border-slate-100">
      <img src="/visioguard.png" className="w-10 h-10 object-contain" alt="VisioGuard Logo" />
    </span>
    <span className="hidden sm:inline text-lg font-extrabold tracking-tight text-slate-800">VisioGuard</span>
      </div>

      {/* ── Tabs ── */}
      <nav className="flex h-full" role="tablist" aria-label="Navigasi utama">
        {TABS.map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => onNavigate(t.id)}
              className={`relative h-full px-2 sm:px-4 md:px-6 whitespace-nowrap text-[13px] sm:text-sm md:text-[15px] font-bold cursor-pointer transition-colors ${
                active ? 'text-[var(--vg-tab-active)]' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {t.label}
              {active && (
                <span className="absolute left-2 right-2 bottom-0 h-[3px] rounded-t-full bg-[var(--vg-tab-active)]" />
              )}
            </button>
          )
        })}
      </nav>

      {/* ── Right: bell + profile ── */}
      <div ref={rightRef} className="relative flex items-center justify-end gap-1.5">
        <button
          onClick={toggleBell}
          aria-label="Notifikasi"
          aria-expanded={menu === 'bell'}
          className="relative grid place-items-center w-10 h-10 rounded-full text-slate-600 hover:bg-slate-100 cursor-pointer"
        >
          <BellIcon />
          {unread > 0 && (
            <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#ff3b3b] text-white text-[10px] font-bold grid place-items-center">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>


        {/* Notification popover */}
        {menu === 'bell' && (
          <div className="absolute right-0 top-12 w-[320px] max-h-[70svh] overflow-y-auto rounded-2xl bg-white border border-[#dbe6f7] shadow-xl p-3">
            <p className="px-1 pb-2 text-sm font-extrabold">Notifikasi</p>
            {notifications.length === 0 && (
              <p className="px-1 py-3 text-sm text-slate-500">Belum ada notifikasi.</p>
            )}
            <ul className="flex flex-col gap-2">
              {notifications.slice(0, 8).map((n) => (
                <li
                  key={n.id}
                  className={`rounded-lg border border-slate-200 border-l-4 px-3 py-2 ${
                    LEVEL_BORDER[n.level] ?? LEVEL_BORDER.info
                  }`}
                >
                  <p className="text-[13px] font-semibold leading-snug">{n.message}</p>
                  <time className="block mt-1 text-right text-[11px] font-bold text-slate-500 tabular-nums">
                    {fmtStamp(n.at)}
                  </time>
                </li>
              ))}
            </ul>
          </div>
        )}

  
      </div>
    </header>
  )
}
