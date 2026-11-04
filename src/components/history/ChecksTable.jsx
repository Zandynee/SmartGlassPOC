// ─────────────────────────────────────────────
//  components/history/ChecksTable.jsx  –  fatigue checks of one session
//  Used inside SessionDetail (see BATCH4_README.md for the 3-line patch).
//  Props: rows – history.checks  ([{ t, hr_bpm, sdnn, rmssd, pnn50, base_*, fatigue_index, fatigued }])
// ─────────────────────────────────────────────

const fmtTime = (ms) => (ms ? new Date(ms).toLocaleTimeString('id-ID') : '—')
const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—')

/** "52.0 (−18%)" : value and change vs baseline */
function withDelta(cur, base) {
  if (!Number.isFinite(cur)) return '—'
  if (!Number.isFinite(base) || base <= 0) return f(cur)
  const pct = ((cur - base) / base) * 100
  return `${f(cur)} (${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(0)}%)`
}

export function ChecksTable({ rows = [] }) {
  return (
    <div>
      <p className="text-sm font-bold mb-1.5">
        Cek kelelahan <span className="font-normal text-slate-400">· {rows.length} pengukuran</span>
      </p>
      {!rows.length ? (
        <p className="text-xs font-mono text-slate-400">Belum ada pengukuran pada sesi ini.</p>
      ) : (
        <div className="overflow-auto border border-[#dbe6f7] rounded-xl bg-white">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="bg-[var(--vg-blue-soft)]">
                {['waktu', 'hr', 'sdnn (ms)', 'rmssd (ms)', 'pnn50 (%)', 'hasil'].map((h) => (
                  <th key={h} className="text-left px-2 py-1 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-2 py-1 tabular-nums whitespace-nowrap">{fmtTime(r.t)}</td>
                  <td className="px-2 py-1 tabular-nums whitespace-nowrap">{f(r.hr_bpm, 0)}</td>
                  <td className="px-2 py-1 tabular-nums whitespace-nowrap">{withDelta(r.sdnn, r.base_sdnn)}</td>
                  <td className="px-2 py-1 tabular-nums whitespace-nowrap">{withDelta(r.rmssd, r.base_rmssd)}</td>
                  <td className="px-2 py-1 tabular-nums whitespace-nowrap">{withDelta(r.pnn50, r.base_pnn50)}</td>
                  <td className={`px-2 py-1 whitespace-nowrap font-bold ${r.fatigued ? 'text-red-600' : 'text-emerald-600'}`}>
                    {r.fatigued ? 'Lelah' : 'Segar'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
