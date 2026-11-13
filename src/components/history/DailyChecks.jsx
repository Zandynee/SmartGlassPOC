// ─────────────────────────────────────────────
//  DailyChecks.jsx  –  "Cek Harian": per day the check list + daily summary
//  (fitness 1-5, number of checks, number of advice) and the CSV export.
//  Props: checks (flattenChecks), baselines (db rows), range, loading
// ─────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { summarizeDays } from '../../utils/dailySummary'
import { checksToCsv, checksCsvFilename, saveCsv } from '../../utils/exportCsv'
import { formatDayHeading } from '../../utils/history'
import { notify } from '../../services/notify'
import { DownloadIcon } from '../icons'
import { ChecksTable } from './ChecksTable'

function Chip({ label, value, tone = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-0.5 text-xs font-semibold text-ink-soft ${tone}`}>
      {label} <b className="text-ink-strong tabular-nums">{value}</b>
    </span>
  )
}

export function DailyChecks({ checks, baselines, range, loading }) {
  const days = useMemo(() => summarizeDays(checks, baselines), [checks, baselines])
  const [busy, setBusy] = useState(false)

  const exportCsv = async () => {
    setBusy(true)
    try {
      const saved = await saveCsv(checksCsvFilename(range), checksToCsv(checks, baselines))
      if (saved) notify('VisioGuard', `CSV cek disimpan: ${saved}`)
    } catch (err) {
      console.error('CSV export failed:', err)
      notify('VisioGuard', `Gagal mengekspor CSV: ${err?.message ?? err}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="Cek harian" className="rounded-2xl bg-white border border-line shadow-sm p-4 md:p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="m-0 text-lg font-extrabold">Cek harian</h2>
          <p className="m-0 text-xs text-ink-muted">
            Perubahan RMSSD terhadap baseline hari itu. Cek tidak valid dicatat terpisah dan tidak masuk grafik tren.
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={busy || !checks.length}
          className="inline-flex items-center gap-1.5 h-control-md px-3.5 rounded-full border border-line-strong bg-white text-sm font-semibold text-brand hover:bg-brand-soft disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <DownloadIcon size={16} /> Ekspor CSV
        </button>
      </div>

      {!days.length && (
        <p className="text-sm text-ink-muted m-0">{loading ? 'Memuat…' : 'Belum ada cek pada rentang ini.'}</p>
      )}

      {days.map((d) => (
        <div key={d.key} className="flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="m-0 text-sm font-bold">{formatDayHeading(d.t)}</h3>
            <Chip label="Kebugaran" value={d.fitness != null ? `${d.fitness}/5` : '—'} />
            <Chip label="Cek" value={d.valid} />
            <Chip label="Saran" value={d.advice} />
            {d.invalid > 0 && <Chip label="Tidak valid" value={d.invalid} tone="text-ink-faint" />}
          </div>
          <ChecksTable rows={d.rows} title={null} />
        </div>
      ))}
    </section>
  )
}
