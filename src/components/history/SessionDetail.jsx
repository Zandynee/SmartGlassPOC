// ─────────────────────────────────────────────
//  SessionDetail.jsx  –  modal opened from a Daily Log row
//  Keeps everything the old SessionHistory offered:
//    • raw readings tables (IMU / PPG / ToF)
//    • delete session (confirm dialog + notify), unchanged logic
//  and adds a small summary of the session.
//
//  Props:
//    session   – { id, mode, started_at, ended_at }
//    history   – { imu, ppg, tof } | undefined while loading
//    onClose   – () => void
//    onDeleted – (id) => void
// ─────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import { ask } from '@tauri-apps/plugin-dialog'
import { deleteSession } from '../../services/db/sessions'
import { notify } from '../../services/notify'
import {
  METRICS,
  fmtClock,
  formatDayHeading,
  formatDuration,
  formatValue,
  modeLabel,
  summarizeHistory,
} from '../../utils/history'
import { CloseIcon, DownloadIcon, TrashIcon } from '../icons'
import { csvFilename, saveCsv, sessionToCsv } from '../../utils/exportCsv'

const MAX_ROWS = 500   // keep the DOM light for very long sessions

const fmtTime = (ms) => (ms ? new Date(ms).toLocaleTimeString('id-ID') : '—')

function ReadingsTable({ title, rows, columns }) {
  return (
    <div>
      <p className="text-sm font-bold mb-1.5">
        {title} <span className="font-normal text-slate-400">· {rows.length.toLocaleString('id-ID')} baris</span>
      </p>
      {!rows.length ? (
        <p className="text-xs font-mono text-slate-400">Tidak ada data.</p>
      ) : (
        <div className="overflow-auto max-h-60 border border-[#dbe6f7] rounded-xl bg-white">
          <table className="w-full text-xs font-mono">
            <thead className="sticky top-0">
              <tr className="bg-[var(--vg-blue-soft)]">
                {columns.map((c) => (
                  <th key={c.key} className="text-left px-2 py-1 whitespace-nowrap">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, MAX_ROWS).map((row, i) => (
                <tr key={row.id ?? i} className="border-t border-slate-100">
                  {columns.map((c) => (
                    <td key={c.key} className="px-2 py-1 tabular-nums whitespace-nowrap">
                      {c.format ? c.format(row[c.key]) : row[c.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > MAX_ROWS && (
        <p className="mt-1 text-[11px] text-slate-400">
          Menampilkan {MAX_ROWS} dari {rows.length.toLocaleString('id-ID')} baris.
        </p>
      )}
    </div>
  )
}

export function SessionDetail({ session, history, onClose, onDeleted }) {
  const [busy, setBusy] = useState(false)
  const stats = useMemo(() => (history ? summarizeHistory(history) : null), [history])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleDelete = async () => {
    const warning = !session.ended_at
      ? '\n\nSesi ini ditandai masih berjalan. Hentikan dulu jika masih merekam.'
      : ''
    const confirmed = await ask(
      `Hapus sesi #${session.id} beserta seluruh datanya? Tindakan ini tidak bisa dibatalkan.${warning}`,
      { title: 'Hapus sesi', kind: 'warning' }
    )
    if (!confirmed) return

    setBusy(true)
    try {
      await deleteSession(session.id)
      notify('VisioGuard', `Sesi #${session.id} dihapus`)
      onDeleted(session.id)
    } finally {
      setBusy(false)
    }
  }

  const hasRows = !!history && (history.imu.length + history.ppg.length + history.tof.length) > 0

  const handleExport = async () => {
    if (!hasRows) return
    setBusy(true)
    try {
      const saved = await saveCsv(csvFilename(session), sessionToCsv(session, history))
      if (saved) notify('VisioGuard', `CSV sesi #${session.id} disimpan: ${saved}`)
    } catch (err) {
      console.error('CSV export failed:', err)
      notify('VisioGuard', `Gagal mengekspor CSV: ${err?.message ?? err}`)
    } finally {
      setBusy(false)
    }
  }

  const end = session.ended_at ?? Date.now()

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4 bg-slate-900/45"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Sesi ${session.id}`}
        className="w-full max-w-4xl max-h-[90svh] overflow-y-auto rounded-3xl bg-[#f4f8ff] shadow-2xl"
      >
        {/* header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 px-6 py-4 bg-[#f4f8ff]/95 backdrop-blur border-b border-[#dbe6f7]">
          <div>
            <h2 className="m-0 text-xl font-extrabold">
              Sesi #{session.id} · {modeLabel(session.mode)}
              {!session.ended_at && (
                <span className="ml-2 align-middle px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-bold">
                  Berjalan
                </span>
              )}
            </h2>
            <p className="mt-1 text-sm text-slate-500 tabular-nums">
              {formatDayHeading(session.started_at)} · {fmtClock(session.started_at)}
              {session.ended_at ? ` – ${fmtClock(session.ended_at)}` : ''} ·{' '}
              {formatDuration(end - session.started_at)}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleExport}
              disabled={busy || !hasRows}
              title={hasRows ? 'Simpan data sesi sebagai file CSV' : 'Belum ada data untuk diekspor'}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-[#c9d9f2] bg-white text-sm font-semibold text-[var(--vg-tab-active)] hover:bg-[var(--vg-blue-soft)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <DownloadIcon size={16} /> Ekspor CSV
            </button>
            <button
              onClick={handleDelete}
              disabled={busy}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-red-200 bg-white text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 cursor-pointer"
            >
              <TrashIcon size={16} /> Hapus
            </button>
            <button
              onClick={onClose}
              aria-label="Tutup"
              className="grid place-items-center w-9 h-9 rounded-full hover:bg-slate-200 cursor-pointer"
            >
              <CloseIcon size={18} />
            </button>
          </div>
        </div>

        <div className="p-6 flex flex-col gap-5">
          {/* mini summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {METRICS.map((m) => (
              <div key={m.id} className="rounded-2xl bg-white border border-[#dbe6f7] px-4 py-3">
                <p className="text-xs font-semibold text-slate-500 flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: m.color }} />
                  {m.label}
                </p>
                <p className="mt-1 text-2xl font-extrabold tabular-nums">
                  {stats ? formatValue(stats[m.id], m.decimals) : '…'}
                  <span className="ml-1 text-sm font-semibold text-slate-500">{m.unit}</span>
                </p>
              </div>
            ))}
          </div>

          {!history && <p className="text-sm text-slate-500">Memuat data sesi…</p>}

          {history && (
            <>
              <ReadingsTable
                title="IMU"
                rows={history.imu}
                columns={[
                  { key: 't', label: 'waktu', format: fmtTime },
                  { key: 'roll', label: 'roll', format: (v) => v?.toFixed(1) },
                  { key: 'pitch', label: 'pitch', format: (v) => v?.toFixed(1) },
                  { key: 'yaw', label: 'yaw', format: (v) => v?.toFixed(1) },
                  { key: 'fhp_status', label: 'fhp' },
                ]}
              />
              <ReadingsTable
                title="PPG"
                rows={history.ppg}
                columns={[
                  { key: 't', label: 'waktu', format: fmtTime },
                  { key: 'hr_bpm', label: 'bpm', format: (v) => v?.toFixed(1) },
                  { key: 'fatigue_index', label: 'kelelahan', format: (v) => (Number.isFinite(v) ? v.toFixed(0) : v) },
                  { key: 'fatigue_status', label: 'status' },
                ]}
              />
              <ReadingsTable
                title="ToF"
                rows={history.tof}
                columns={[
                  { key: 't', label: 'waktu', format: fmtTime },
                  { key: 'distance_cm', label: 'cm', format: (v) => v?.toFixed(1) },
                  { key: 'status', label: 'status' },
                ]}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}