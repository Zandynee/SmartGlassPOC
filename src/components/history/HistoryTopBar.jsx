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
  info:    'border-l-info',
  warning: 'border-l-caution',
  danger:  'border-l-alert',
}

const TONE_DOT = {
  on:  'bg-ok-solid',
  sim: 'bg-warning-bright',
  off: 'bg-ink-faint',
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
    <header className="sticky top-0 z-header grid grid-cols-topbar items-center h-topbar px-3 sm:px-4 md:px-6 bg-white border-b border-line">
      {/* ── Logo ── */}
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="grid place-items-center size-logo-tile shrink-0 rounded-xl bg-ink-faint shadow-sm border border-wash">
          <img src="/visioguard.png" className="size-touch object-contain" alt="VisioGuard Logo" />
        </span>
        <span className="hidden sm:inline text-lg font-extrabold tracking-tight text-ink-strong">VisioGuard</span>
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
              className={`relative h-full px-2 sm:px-4 md:px-6 whitespace-nowrap text-label sm:text-sm md:text-nav font-bold cursor-pointer transition-colors ${
                active ? 'text-brand' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {t.label}
              {active && (
                <span className="absolute left-2 right-2 bottom-0 h-stroke rounded-t-full bg-brand" />
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
          className="relative grid place-items-center size-touch rounded-full text-ink-soft hover:bg-wash cursor-pointer"
        >
          <BellIcon />
          {unread > 0 && (
            <span className="absolute top-1 right-1 min-w-count-badge h-count-badge px-1 rounded-full bg-alert text-white text-micro font-bold grid place-items-center">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>

        {/* Notification popover */}
        {menu === 'bell' && (
          <div className="absolute right-0 top-dropdown w-popover max-h-overlay overflow-y-auto rounded-2xl bg-white border border-line shadow-xl p-3">
            <p className="px-1 pb-2 text-sm font-extrabold">Notifikasi</p>
            {notifications.length === 0 && (
              <p className="px-1 py-3 text-sm text-ink-muted">Belum ada notifikasi.</p>
            )}
            <ul className="flex flex-col gap-2">
              {notifications.slice(0, 8).map((n) => (
                <li
                  key={n.id}
                  className={`rounded-lg border border-hairline border-l-4 px-3 py-2 ${
                    LEVEL_BORDER[n.level] ?? LEVEL_BORDER.info
                  }`}
                >
                  <p className="text-label font-semibold leading-snug">{n.message}</p>
                  <time className="block mt-1 text-right text-caption font-bold text-ink-muted tabular-nums">
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
