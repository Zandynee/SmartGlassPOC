// ─────────────────────────────────────────────
//  StatusCard.jsx  –  "Status Koneksi" card
//  Shows BLE / simulation state and the glasses' battery level.
//
//  Props:
//    connected  – boolean; real BLE link is up
//    simulating – boolean; simulation mode is running
//    battery    – 0–100, or null/undefined when the firmware
//                 doesn't report it yet (ring stays empty, shows "—")
// ─────────────────────────────────────────────

import { Card } from './Card'

function BatteryRing({ percent }) {
  const R = 40
  const C = 2 * Math.PI * R
  const known = typeof percent === 'number' && !Number.isNaN(percent)
  const pct = known ? Math.min(100, Math.max(0, percent)) : 0
  const color = !known ? '#94a3b8' : pct < 20 ? '#ef4444' : pct < 50 ? '#f59e0b' : '#22c55e'

  return (
    <svg
      viewBox="0 0 100 100"
      className="w-[88px] h-[88px]"
      role="img"
      aria-label={known ? `Baterai ${Math.round(pct)} persen` : 'Baterai tidak diketahui'}
    >
      <circle cx="50" cy="50" r={R} fill="none" stroke="#e8eef9" strokeWidth="9" />
      <circle
        cx="50" cy="50" r={R}
        fill="none"
        stroke={color}
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={`${(pct / 100) * C} ${C}`}
        transform="rotate(-90 50 50)"
        style={{ transition: 'stroke-dasharray 0.5s' }}
      />
      <text
        x="50" y="50"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="22"
        fontWeight="800"
        fill="#0f172a"
      >
        {known ? `${Math.round(pct)}%` : '—'}
      </text>
    </svg>
  )
}

export function StatusCard({ connected, simulating, battery }) {
  const live = connected || simulating
  const label = connected ? 'Terhubung' : simulating ? 'Simulasi' : 'Tidak terhubung'
  const dot = connected ? '#22c55e' : simulating ? '#fbbf24' : '#94a3b8'

  return (
    <Card title="Status Koneksi" dot={dot}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p
            className={`m-0 text-3xl font-extrabold tracking-tight ${
              connected ? 'text-green-600' : simulating ? 'text-amber-600' : 'text-slate-500'
            }`}
          >
            {label}
          </p>
          <p className="mt-1 text-sm text-slate-500">VisioGuard</p>
        </div>

        <div className="flex flex-col items-center gap-1 shrink-0">
          <BatteryRing percent={live ? battery : null} />
          <span className="text-xs font-semibold text-slate-500">Baterai</span>
        </div>
      </div>
    </Card>
  )
}
