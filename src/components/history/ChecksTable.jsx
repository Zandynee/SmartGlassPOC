// ─────────────────────────────────────────────
//  components/history/ChecksTable.jsx  –  HRV checks (time, work duration, RMSSD change, status)
//  Used by SessionDetail and DailyChecks.
//  Props: rows – check rows ([{ t, status, work_duration_s, rmssd_change_pct, sdnn_change_pct,
//                               valid_windows, total_windows }]);  title – optional heading (null = none)
//  No "kelelahan" label and no pNN50 (handoff §5). INVALID checks are greyed and never in the trend.
// ─────────────────────────────────────────────

import { STATUS_LABEL } from '../../services/measureMessages'

const fmtTime = (ms) => (ms ? new Date(ms).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '—')
const pct = (v) => (v == null || !Number.isFinite(Number(v)) ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(0)}%`)
const work = (s) => (s == null ? '—' : `${Math.round(s / 60)} mnt`)

const STATUS_CLS = {
  DROP: 'text-warning-strong',
  SOFT: 'text-info-strong',
  STABLE: 'text-ok',
  INVALID: 'text-ink-muted',
}

export function ChecksTable({ rows = [], title = 'Cek kondisi' }) {
  return (
    <div>
      {title && (
        <p className="text-sm font-medium mb-2">
          {title} <span className="font-normal text-ink-muted">· {rows.length} pengukuran</span>
        </p>
      )}
      {!rows.length ? (
        <p className="text-xs font-mono text-ink-muted">Belum ada pengukuran.</p>
      ) : (
        <div className="overflow-auto border border-line rounded-lg bg-white">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="bg-wash">
                {['waktu', 'lama kerja', 'RMSSD', 'SDNN', 'kualitas', 'status'].map((h) => (
                  <th key={h} className="text-left px-2 py-1 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const invalid = r.status === 'INVALID'
                return (
                  <tr key={r.id} className={`border-t border-wash ${invalid ? 'bg-mist text-ink-muted' : ''}`}>
                    <td className="px-2 py-1 tabular-nums whitespace-nowrap">{fmtTime(r.t)}</td>
                    <td className="px-2 py-1 tabular-nums whitespace-nowrap">{work(r.work_duration_s)}</td>
                    <td className="px-2 py-1 tabular-nums whitespace-nowrap">{invalid ? '—' : pct(r.rmssd_change_pct)}</td>
                    <td className="px-2 py-1 tabular-nums whitespace-nowrap">{invalid ? '—' : pct(r.sdnn_change_pct)}</td>
                    <td className="px-2 py-1 tabular-nums whitespace-nowrap">
                      {r.valid_windows != null ? `${r.valid_windows} dari ${r.total_windows}` : '—'}
                    </td>
                    <td className={`px-2 py-1 whitespace-nowrap font-medium ${STATUS_CLS[r.status] || 'text-ink-muted'}`}>
                      {STATUS_LABEL[r.status] || '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
