// ─────────────────────────────────────────────
//  SummaryCards.jsx  –  bottom row of four metric cards
//  Each card: label, big value + unit, threshold note. The value turns amber / red
//  only when it crosses the threshold the note describes.
//
//  Props:
//    summary – { hr: {avg,count}, rmssd, distance, posture }   (aggregate())
// ─────────────────────────────────────────────

import { METRIC_BY_ID, formatValue } from '../../utils/history'

// tone(v) → 'warn' | 'bad' | null ; note = what the threshold is
const CARDS = [
  {
    id: 'hr',
    label: 'Rata-rata detak jantung',
    note: 'Normal 60–100 bpm',
  },
  {
    id: 'rmssd',
    label: 'Perubahan RMSSD (rata-rata cek)',
    note: 'Saran istirahat jika turun ≥ 20%',
    tone: (v) => (v <= -20 ? 'warn' : null),
    signed: true,
  },
  {
    id: 'distance',
    label: 'Jarak dengan layar',
    note: 'Aman jika ≥ 40 cm',
    tone: (v) => (v >= 40 ? null : 'bad'),
  },
  {
    id: 'posture',
    label: 'Postur baik',
    note: 'Kepala tegak',
    tone: (v) => (v >= 80 ? null : v >= 50 ? 'warn' : 'bad'),
  },
]

const TONE_TEXT = { warn: 'text-warning', bad: 'text-danger' }

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
        const tone = has && c.tone ? c.tone(avg) : null

        return (
          <article
            key={c.id}
            className="rounded-2xl bg-white border border-line shadow-sm p-5"
          >
            <h3 className="m-0 text-sm font-medium text-ink-soft">{c.label}</h3>

            <p className={`mt-2 flex items-baseline gap-2 ${TONE_TEXT[tone] ?? 'text-ink'}`}>
              <span className="font-mono text-4xl font-medium tabular-nums">
                {c.signed && avg > 0 ? '+' : ''}{formatValue(avg, 0)}
              </span>
              <span className="text-base text-ink-muted">{m.unit}</span>
            </p>

            <p className="mt-3 flex items-center justify-between gap-2 text-xs text-ink-muted">
              <span>{c.note}</span>
              <span className="font-mono tabular-nums">{count.toLocaleString('id-ID')} {c.id === 'rmssd' ? 'cek' : 'data'}</span>
            </p>
          </article>
        )
      })}
    </section>
  )
}
