// ─────────────────────────────────────────────
//  HistoryPage.jsx  –  the "Data Riwayat" screen
//
//   ┌──────────────── top bar (logo · tabs · bell · profile) ───────────────┐
//   │ rail │  title + filters                                │ Log Harian    │
//   │      │  ┌── graph: bpm ──┐ ┌── graph: cm ──┐ …         │ (sessions,    │
//   │      │  └────────────────┘ └───────────────┘           │  scrollable)  │
//   │      │  [ card ] [ card ] [ card ] [ card ]            │               │
//   └──────┴─────────────────────────────────────────────────┴───────────────┘
//
//  Owns the UI state (timeframe, date, filters, active metrics). Data comes
//  from useHistoryData; maths from utils/history.
//
//  One graph is drawn per UNIT OF MEASUREMENT: switching on Detak Jantung (bpm)
//  and Jarak (cm) gives two graphs, never one graph with two different scales.
//
//  Props:
//    onNavigate    – (tabId) => void   ('home' | 'history')
//    notifications – from useNotifications()
//    connected, simulating – for the profile menu's status line
// ─────────────────────────────────────────────

import { useCallback, useMemo, useState } from 'react'
import { useHistoryData } from '../../hooks/useHistoryData'
import {
  DAY,
  METRICS,
  aggregate,
  getRange,
  makeBuckets,
  modeLabel,
  overlapsRange,
  shiftAnchor,
  shiftCustom,
} from '../../utils/history'
import { HistoryTopBar } from './HistoryTopBar'
import { HistoryFilters } from './HistoryFilters'
import { HistoryChart } from './HistoryChart'
import { SummaryCards } from './SummaryCards'
import { DailyChecks } from './DailyChecks'
import { flattenChecks } from '../../utils/dailySummary'
import { DailyLogs } from './DailyLogs'
import { SessionDetail } from './SessionDetail'

const startOfToday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** [hr, rmssd, distance] → [{ unit: 'bpm', metrics: [hr] }, …]  (order of first appearance) */
function groupByUnit(metrics) {
  const groups = []
  for (const m of metrics) {
    const group = groups.find((g) => g.unit === m.unit)
    if (group) group.metrics.push(m)
    else groups.push({ unit: m.unit, metrics: [m] })
  }
  return groups
}

export function HistoryPage({ onNavigate, notifications = [], connected = false, simulating = false }) {
  const [timeframe, setTimeframe] = useState('week')
  const [anchor, setAnchor] = useState(() => Date.now())
  const [custom, setCustom] = useState(() => ({
    from: startOfToday() - 6 * DAY,
    to: startOfToday(),
  }))
  const [mode, setMode] = useState('all')
  const [activeIds, setActiveIds] = useState(['hr'])
  const [openId, setOpenId] = useState(null)

  const range = useMemo(() => getRange(timeframe, anchor, custom), [timeframe, anchor, custom])
  const { allSessions, histories, baselines, loading, error, refresh, dropSession } = useHistoryData(range)

  // "Filter Data" options come from the modes actually present in the database
  const modeOptions = useMemo(() => {
    const modes = [...new Set(allSessions.map((s) => s.mode).filter(Boolean))]
    return [
      { value: 'all', label: 'Semua sesi' },
      ...modes.map((m) => ({ value: m, label: modeLabel(m) })),
    ]
  }, [allSessions])

  const sessions = useMemo(
    () =>
      allSessions
        .filter((s) => overlapsRange(s, range) && (mode === 'all' || s.mode === mode))
        .sort((a, b) => b.started_at - a.started_at),
    [allSessions, range, mode]
  )

  const { unit, buckets } = useMemo(() => makeBuckets(range.start, range.end), [range])

  const { points, summary } = useMemo(
    () => aggregate(buckets, sessions.map((s) => histories[s.id]), range),
    [buckets, sessions, histories, range]
  )

  const checks = useMemo(() => flattenChecks(sessions, histories, range), [sessions, histories, range])

  const activeMetrics = useMemo(
    () => METRICS.filter((m) => activeIds.includes(m.id)),
    [activeIds]
  )

  // one graph per unit of measurement
  const chartGroups = useMemo(() => groupByUnit(activeMetrics), [activeMetrics])

  // ── handlers ──
  const toggleMetric = useCallback((id) => {
    setActiveIds((prev) => {
      if (prev.includes(id)) return prev.length > 1 ? prev.filter((x) => x !== id) : prev  // keep ≥ 1
      return [...prev, id]
    })
  }, [])

  const shift = useCallback(
    (dir) => {
      if (timeframe === 'custom') setCustom((c) => shiftCustom(c, dir))
      else setAnchor((a) => shiftAnchor(timeframe, a, dir))
    },
    [timeframe]
  )

  const goNow = useCallback(() => {
    setAnchor(Date.now())
    if (timeframe === 'custom') {
      setCustom({ from: startOfToday() - 6 * DAY, to: startOfToday() })
    }
  }, [timeframe])

  const canNext = range.end <= Date.now()

  const openSession = sessions.find((s) => s.id === openId) ?? null

  const status = connected
    ? { label: 'Terhubung', tone: 'on' }
    : simulating
    ? { label: 'Mode simulasi', tone: 'sim' }
    : { label: 'Tidak terhubung', tone: 'off' }

  return (
    <div className="min-h-svh flex flex-col bg-page text-left">
      <HistoryTopBar
        tab="history"
        onNavigate={onNavigate}
        notifications={notifications}
        status={status}
      />

      <div className="flex flex-1 min-w-0">
        <div className="flex flex-1 min-w-0 flex-col lg:flex-row">
          {/* ── Main content ── */}
          <main className="flex-1 min-w-0 flex flex-col gap-5 p-4 md:p-6">
            <HistoryFilters
              timeframe={timeframe}
              onTimeframe={setTimeframe}
              range={range}
              onShift={shift}
              canNext={canNext}
              onToday={goNow}
              custom={custom}
              onCustom={setCustom}
              modeOptions={modeOptions}
              mode={mode}
              onMode={setMode}
              activeIds={activeIds}
              onToggleMetric={toggleMetric}
              onRefresh={refresh}
              loading={loading}
            />

            {error && (
              <p className="text-sm font-mono text-danger border border-danger-line-strong bg-danger-surface rounded-xl px-4 py-2">
                ✕ Gagal memuat riwayat: {error}
              </p>
            )}

            {/* ── One graph per unit ── */}
            <div className={`grid grid-cols-1 gap-5 ${chartGroups.length > 1 ? '2xl:grid-cols-2' : ''}`}>
              {chartGroups.map((group) => (
                <section
                  key={group.unit}
                  aria-label={`Grafik dalam ${group.unit}`}
                  className="rounded-2xl bg-white border border-line shadow-sm p-4 md:p-5 h-chart-panel"
                >
                  <HistoryChart points={points} unit={unit} metrics={group.metrics} loading={loading} />
                </section>
              ))}
            </div>

            <SummaryCards summary={summary} />

            <DailyChecks checks={checks} baselines={baselines} range={range} loading={loading} />
          </main>

          {/* ── Daily logs ── */}
          <DailyLogs
            sessions={sessions}
            histories={histories}
            selectedId={openId}
            onOpen={(s) => setOpenId(s.id)}
            loading={loading}
          />
        </div>
      </div>

      {openSession && (
        <SessionDetail
          session={openSession}
          history={histories[openSession.id]}
          onClose={() => setOpenId(null)}
          onDeleted={(id) => {
            setOpenId(null)
            dropSession(id)
          }}
        />
      )}
    </div>
  )
}
