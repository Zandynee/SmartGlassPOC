// ─────────────────────────────────────────────
//  SummaryCards.jsx  –  bottom row of four metric cards
//  Each card: label, big value + unit, linear progress bar, note.
//
//  Props:
//    summary – { hr: {avg,count}, fatigue, distance, posture }   (aggregate())
// ─────────────────────────────────────────────

import { METRIC_BY_ID, formatValue } from '../../utils/history'

// progress(v) → 0..1 ; note = what the bar means
const CARDS = [
  {
    id: 'hr',
    label: 'Rata-rata Detak Jantung',
    progress: (v) => v / 120,
    note: 'Normal 60–100 bpm',
  },
  {
    id: 'fatigue',
    label: 'Indeks Kelelahan',
    progress: (v) => v / 100,
    note: 'Lelah jika ≥ 75',
    color: (v) => (v < 50 ? '#22c55e' : v < 75 ? '#f59e0b' : '#ef4444'),
  },
  {
    id: 'distance',
    label: 'Jarak dengan Layar',
    progress: (v) => v / 60,
    note: 'Aman jika ≥ 40 cm',
    color: (v) => (v >= 40 ? '#3a8dff' : '#ef4444'),
  },
  {
    id: 'posture',
    label: 'Postur Baik',
    progress: (v) => v / 100,
    note: 'Kepala tegak',
    color: (v) => (v >= 80 ? '#0d9488' : v >= 50 ? '#f59e0b' : '#ef4444'),
  },
]

export function SummaryCards({ summary }) {
  return (
    <section
      aria-label="Ringkasan"
      className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
    >
      {CARDS.map((c) => {
        const m = METRIC_BY_ID[c.id]
        const { avg, count } = summary[c.id] ?? { avg: null, count: 0 }
        const has = avg != null
        const pct = has ? Math.min(100, Math.max(0, c.progress(avg) * 100)) : 0
        const color = has && c.color ? c.color(avg) : m.color

        return (
          <article
            key={c.id}
            className="rounded-2xl bg-white border border-[#dbe6f7] shadow-sm px-5 py-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="m-0 text-sm font-bold text-slate-600">{c.label}</h3>
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: m.color }} />
            </div>

            <p className="mt-2 flex items-baseline gap-1.5">
              <span className="text-4xl font-extrabold tabular-nums tracking-tight">
                {formatValue(avg, 0)}
              </span>
              <span className="text-base font-semibold text-slate-500">{m.unit}</span>
            </p>

            <div
              className="mt-3 h-2.5 rounded-full bg-slate-100 overflow-hidden"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(pct)}
              aria-label={c.label}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: color }}
              />
            </div>

            <p className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500">
              <span>{c.note}</span>
              <span className="tabular-nums">{count.toLocaleString('id-ID')} data</span>
            </p>
          </article>
        )
      })}
    </section>
  )
}
