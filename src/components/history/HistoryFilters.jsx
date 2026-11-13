// ─────────────────────────────────────────────
//  HistoryFilters.jsx  –  page title + control row
//    [Hari|Minggu|Bulan|Tahun|Kustom]  [Filter Data ▾]  ‹ date range ›  … metric toggles
//
//  Pure UI: all state lives in HistoryPage.
// ─────────────────────────────────────────────

import { useRef, useState } from 'react'
import { useClickOutside } from '../../hooks/useClickOutside'
import {
  METRICS,
  TIMEFRAMES,
  formatRangeLabel,
  fromDateInput,
  toDateInput,
} from '../../utils/history'
import { CheckIcon, ChevronDown, ChevronLeft, ChevronRight, FilterIcon, RefreshIcon } from '../icons'

// ── Filter Data dropdown ───────────────────────
function FilterDropdown({ options, value, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useClickOutside(ref, () => setOpen(false), open)

  const current = options.find((o) => o.value === value) ?? options[0]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex items-center gap-2 h-control px-4 rounded-full bg-white border border-line-strong text-sm font-semibold hover:border-brand cursor-pointer"
      >
        <FilterIcon size={16} className="text-ink-muted" />
        Filter Data
        {value !== 'all' && (
          <span className="px-2 py-0.5 rounded-full bg-brand-soft text-brand text-xs">
            {current.label}
          </span>
        )}
        <ChevronDown size={16} className="text-ink-muted" />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute left-0 top-dropdown z-dropdown min-w-menu rounded-2xl bg-white border border-line shadow-xl p-2"
        >
          <li className="px-3 pt-1 pb-2 text-caption font-bold uppercase tracking-wide text-ink-faint">
            Sumber sesi
          </li>
          {options.map((o) => (
            <li key={o.value} role="option" aria-selected={o.value === value}>
              <button
                onClick={() => { onChange(o.value); setOpen(false) }}
                className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm font-semibold hover:bg-wash cursor-pointer"
              >
                <span>{o.label}</span>
                {o.value === value && <CheckIcon size={16} className="text-brand" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────
export function HistoryFilters({
  timeframe, onTimeframe,
  range, onShift, canNext, onToday,
  custom, onCustom,
  modeOptions, mode, onMode,
  activeIds, onToggleMetric,
  onRefresh, loading,
}) {
  const todayStr = toDateInput(Date.now())

  return (
    <section className="flex flex-col gap-4">
      {/* Title row */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="m-0 text-2xl md:text-page-title font-extrabold tracking-tight">Data Riwayat</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Tren sensor VisioGuard dari sesi yang sudah direkam.
          </p>
        </div>

        <button
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 h-control-md px-3.5 rounded-full bg-white border border-line-strong text-sm font-semibold text-brand hover:bg-brand-soft disabled:opacity-60 cursor-pointer"
        >
          <RefreshIcon size={16} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Memuat…' : 'Segarkan'}
        </button>
      </div>

      {/* Control row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Segmented timeframe */}
        <div
          role="tablist"
          aria-label="Rentang waktu"
          className="inline-flex max-w-full overflow-x-auto p-1 rounded-full bg-white border border-line-strong"
        >
          {TIMEFRAMES.map((t) => {
            const on = timeframe === t.id
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={on}
                onClick={() => onTimeframe(t.id)}
                className={`h-control-sm px-3 sm:px-3.5 shrink-0 rounded-full text-sm font-bold cursor-pointer transition-colors ${
                  on
                    ? 'bg-brand text-white'
                    : 'text-ink-soft hover:bg-wash'
                }`}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        <FilterDropdown options={modeOptions} value={mode} onChange={onMode} />

        {/* Dynamic date range */}
        <div className="inline-flex items-center gap-1 h-control pl-1 pr-1 rounded-full bg-white border border-line-strong">
          <button
            onClick={() => onShift(-1)}
            aria-label="Periode sebelumnya"
            className="grid place-items-center size-touch-sm rounded-full hover:bg-wash cursor-pointer"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="px-2 text-sm font-bold tabular-nums whitespace-nowrap">
            {formatRangeLabel(timeframe, range)}
          </span>
          <button
            onClick={() => onShift(1)}
            disabled={!canNext}
            aria-label="Periode berikutnya"
            className="grid place-items-center size-touch-sm rounded-full hover:bg-wash disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <button
          onClick={onToday}
          className="h-control px-3 text-sm font-semibold text-brand hover:underline cursor-pointer"
        >
          Sekarang
        </button>

        {timeframe === 'custom' && (
          <div className="inline-flex items-center gap-2 text-sm font-semibold">
            <input
              type="date"
              value={toDateInput(custom.from)}
              max={todayStr}
              onChange={(e) => {
                const ms = fromDateInput(e.target.value)
                if (ms != null) onCustom({ ...custom, from: ms })
              }}
              aria-label="Tanggal mulai"
              className="h-control px-3 rounded-full bg-white border border-line-strong"
            />
            <span>–</span>
            <input
              type="date"
              value={toDateInput(custom.to)}
              max={todayStr}
              onChange={(e) => {
                const ms = fromDateInput(e.target.value)
                if (ms != null) onCustom({ ...custom, to: ms })
              }}
              aria-label="Tanggal akhir"
              className="h-control px-3 rounded-full bg-white border border-line-strong"
            />
          </div>
        )}

        {/* Metric toggles: each active metric gets its own graph (grouped by unit) */}
        <div className="flex flex-wrap gap-2 2xl:ml-auto" role="group" aria-label="Metrik pada grafik">
          {METRICS.map((m) => {
            const on = activeIds.includes(m.id)
            return (
              <button
                key={m.id}
                aria-pressed={on}
                onClick={() => onToggleMetric(m.id)}
                className={`inline-flex items-center gap-2 h-control px-4 rounded-full border-2 text-sm font-bold cursor-pointer transition-colors ${
                  on ? 'bg-white text-ink' : 'bg-white/60 border-transparent text-ink-muted hover:bg-white'
                }`}
                style={on ? { borderColor: m.color } : undefined}
              >
                <span
                  className="inline-block size-dot rounded-full"
                  style={{ background: m.color, opacity: on ? 1 : 0.4 }}
                />
                {m.label}
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
