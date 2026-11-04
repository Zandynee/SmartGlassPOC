// ─────────────────────────────────────────────
//  TabBar.jsx  –  top navigation
//  Two equal-width tabs: Beranda (live dashboard) and
//  Data Riwayat (recorded sessions).
// ─────────────────────────────────────────────

const TABS = [
  { id: 'home',    label: 'Beranda' },
  { id: 'history', label: 'Data Riwayat' },
]

export function TabBar({ tab, onChange }) {
  return (
    <nav className="grid grid-cols-2 h-[clamp(52px,4.2vw,80px)]" role="tablist">
      {TABS.map((t) => {
        const active = tab === t.id
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={`text-[clamp(18px,2.1vw,40px)] font-bold text-black cursor-pointer transition-colors ${
              active
                ? 'bg-[var(--vg-tab-active)]'
                : 'bg-[var(--vg-tab-idle)] hover:bg-[#bcd8ff]'
            }`}
          >
            {t.label}
          </button>
        )
      })}
    </nav>
  )
}
