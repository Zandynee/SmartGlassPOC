// ─────────────────────────────────────────────
//  SessionHistory.jsx  –  browse past sessions
//  and their recorded sensor readings.
// ─────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react'
import { select } from '../services/db/db'
import { queryHistory } from '../services/db/sessions'

function fmtTime(ms) {
  if (!ms) return '—'
  return new Date(ms).toLocaleTimeString()
}

function ReadingsTable({ rows, columns }) {
  if (!rows.length) {
    return <p className="text-xs font-mono opacity-50">No rows.</p>
  }
  return (
    <div className="overflow-auto max-h-64 border border-[var(--border)] rounded-md">
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="bg-[var(--social-bg)]">
            {columns.map((c) => (
              <th key={c.key} className="text-left px-2 py-1 whitespace-nowrap">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id ?? i} className="border-t border-[var(--border)]">
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
  )
}

export function SessionHistory() {
  const [sessions, setSessions] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [history, setHistory] = useState({ imu: [], ppg: [], tof: [] })

  const loadSessions = useCallback(() => {
    const rows = select('SELECT * FROM sessions ORDER BY id DESC')
    setSessions(rows)
  }, [])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  useEffect(() => {
    if (selectedId == null) {
      setHistory({ imu: [], ppg: [], tof: [] })
      return
    }
    setHistory(queryHistory(selectedId))
  }, [selectedId])

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-mono font-semibold uppercase tracking-widest opacity-40">
          Session History
        </p>
        <button
          className="text-xs font-mono opacity-60 hover:opacity-100"
          onClick={loadSessions}
        >
          ↺ Refresh
        </button>
      </div>

      {/* ── Session picker ── */}
      <div className="flex flex-wrap gap-2 mb-4">
        {sessions.length === 0 && (
          <p className="text-xs font-mono opacity-50">No sessions recorded yet.</p>
        )}
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelectedId(s.id)}
            className={`text-xs font-mono px-2.5 py-1 rounded-md border transition-colors ${
              selectedId === s.id
                ? 'border-[var(--accent-border)] text-[var(--accent)] bg-[var(--accent-bg)]'
                : 'border-[var(--border)] bg-[var(--social-bg)]'
            }`}
          >
            #{s.id} · {s.mode} · {fmtTime(s.started_at)}
            {!s.ended_at && ' (running)'}
          </button>
        ))}
      </div>

      {/* ── Readings for the selected session ── */}
      {selectedId != null && (
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-xs font-mono font-semibold mb-1">IMU</p>
            <ReadingsTable
              rows={history.imu}
              columns={[
                { key: 't', label: 'time', format: fmtTime },
                { key: 'roll', label: 'roll', format: (v) => v?.toFixed(1) },
                { key: 'pitch', label: 'pitch', format: (v) => v?.toFixed(1) },
                { key: 'yaw', label: 'yaw', format: (v) => v?.toFixed(1) },
                { key: 'fhp_status', label: 'fhp' },
              ]}
            />
          </div>

          <div>
            <p className="text-xs font-mono font-semibold mb-1">PPG</p>
            <ReadingsTable
              rows={history.ppg}
              columns={[
                { key: 't', label: 'time', format: fmtTime },
                { key: 'hr_bpm', label: 'bpm', format: (v) => v?.toFixed(1) },
                { key: 'fatigue_index', label: 'fatigue' },
                { key: 'fatigue_status', label: 'status' },
              ]}
            />
          </div>

          <div>
            <p className="text-xs font-mono font-semibold mb-1">ToF</p>
            <ReadingsTable
              rows={history.tof}
              columns={[
                { key: 't', label: 'time', format: fmtTime },
                { key: 'distance_cm', label: 'cm', format: (v) => v?.toFixed(1) },
                { key: 'status', label: 'status' },
              ]}
            />
          </div>
        </div>
      )}
    </div>
  )
}