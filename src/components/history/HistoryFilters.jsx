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
        className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-white border border-[#c9d9f2] text-sm font-semibold hover:border-[var(--vg-tab-active)] cursor-pointer"
      >
        <FilterIcon size={16} className="text-slate-500" />
        Filter Data
        {value !== 'all' && (
          <span className="px-2 py-0.5 rounded-full bg-[var(--vg-blue-soft)] text-[var(--vg-tab-active)] text-xs">
            {current.label}
          </span>
        )}
        <ChevronDown size={16} className="text-slate-500" />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute left-0 top-12 z-20 min-w-[220px] rounded-2xl bg-white border border-[#dbe6f7] shadow-xl p-2"
        >
          <li className="px-3 pt-1 pb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            Sumber sesi
          </li>
          {options.map((o) => (
            <li key={o.value} role="option" aria-selected={o.value === value}>
              <button
                onClick={() => { onChange(o.value); setOpen(false) }}
                className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm font-semibold hover:bg-slate-100 cursor-pointer"
              >
                <span>{o.label}</span>
                {o.value === value && <CheckIcon size={16} className="text-[var(--vg-tab-active)]" />}
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
          <h1 className="m-0 text-2xl md:text-[28px] font-extrabold tracking-tight">Data Riwayat</h1>
          <p className="mt-1 text-sm text-slate-500">
            Tren sensor VisioGuard dari sesi yang sudah direkam.
          </p>
        </div>

        <button
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 h-9 px-3.5 rounded-full bg-white border border-[#c9d9f2] text-sm font-semibold text-[var(--vg-tab-active)] hover:bg-[var(--vg-blue-soft)] disabled:opacity-60 cursor-pointer"
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
          className="inline-flex max-w-full overflow-x-auto p-1 rounded-full bg-white border border-[#c9d9f2]"
        >
          {TIMEFRAMES.map((t) => {
            const on = timeframe === t.id
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={on}
                onClick={() => onTimeframe(t.id)}
                className={`h-8 px-3 sm:px-3.5 shrink-0 rounded-full text-sm font-bold cursor-pointer transition-colors ${
                  on
                    ? 'bg-[var(--vg-tab-active)] text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        <FilterDropdown options={modeOptions} value={mode} onChange={onMode} />

        {/* Dynamic date range */}
        <div className="inline-flex items-center gap-1 h-10 pl-1 pr-1 rounded-full bg-white border border-[#c9d9f2]">
          <button
            onClick={() => onShift(-1)}
            aria-label="Periode sebelumnya"
            className="grid place-items-center w-8 h-8 rounded-full hover:bg-slate-100 cursor-pointer"
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
            className="grid place-items-center w-8 h-8 rounded-full hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <button
          onClick={onToday}
          className="h-10 px-3 text-sm font-semibold text-[var(--vg-tab-active)] hover:underline cursor-pointer"
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
              className="h-10 px-3 rounded-full bg-white border border-[#c9d9f2]"
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
              className="h-10 px-3 rounded-full bg-white border border-[#c9d9f2]"
            />
          </div>
        )}

        {/* Metric toggles */}
        <div className="flex flex-wrap gap-2 2xl:ml-auto" role="group" aria-label="Metrik pada grafik">
          {METRICS.map((m) => {
            const on = activeIds.includes(m.id)
            return (
              <button
                key={m.id}
                aria-pressed={on}
                onClick={() => onToggleMetric(m.id)}
                className={`inline-flex items-center gap-2 h-10 px-4 rounded-full border-2 text-sm font-bold cursor-pointer transition-colors ${
                  on ? 'bg-white text-slate-900' : 'bg-white/60 border-transparent text-slate-500 hover:bg-white'
                }`}
                style={on ? { borderColor: m.color } : undefined}
              >
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
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
