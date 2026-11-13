// ─────────────────────────────────────────────
//  useHistoryData.js
//  Also loads the daily `baselines` rows (fitness answer per day).
//  Loads the session list, then the readings of every session that
//  overlaps the visible date range (via the existing queryHistory()).
//
//  - Readings are cached per session id, so switching Hari/Minggu/Bulan
//    or paging back and forth does not hit the database again.
//  - refresh() clears the cache (needed for sessions still recording).
// ─────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'
import { select } from '../services/db/db'
import { queryHistory, queryBaselines } from '../services/db/sessions'
import { overlapsRange } from '../utils/history'

const CHUNK = 4   // sessions fetched in parallel

export function useHistoryData(range) {
  const [allSessions, setAllSessions] = useState([])
  const [baselines, setBaselines] = useState([])
  const [histories, setHistories] = useState({})        // id → { imu, ppg, tof }
  const [loadingList, setLoadingList] = useState(true)
  const [loadingReadings, setLoadingReadings] = useState(false)
  const [error, setError] = useState(null)
  const [tick, setTick] = useState(0)
  const cache = useRef(new Map())

  const refresh = useCallback(() => {
    cache.current.clear()
    setHistories({})
    setTick((t) => t + 1)
  }, [])

  const dropSession = useCallback((id) => {
    cache.current.delete(id)
    setAllSessions((prev) => prev.filter((s) => s.id !== id))
    setHistories((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  // 1) session list
  useEffect(() => {
    let dead = false
    setLoadingList(true)
    Promise.all([select('SELECT * FROM sessions ORDER BY id DESC'), queryBaselines()])
      .then(([rows, bases]) => {
        if (dead) return
        setAllSessions(rows)
        setBaselines(bases)
        setError(null)
      })
      .catch((e) => {
        if (!dead) setError(e?.message || String(e))
      })
      .finally(() => {
        if (!dead) setLoadingList(false)
      })
    return () => { dead = true }
  }, [tick])

  // 2) readings of sessions inside the range
  useEffect(() => {
    const now = Date.now()
    const need = allSessions.filter(
      (s) => overlapsRange(s, range, now) && !cache.current.has(s.id)
    )
    if (!need.length) {
      setHistories(Object.fromEntries(cache.current))
      setLoadingReadings(false)
      return undefined
    }

    let dead = false
    setLoadingReadings(true)
    ;(async () => {
      for (let i = 0; i < need.length; i += CHUNK) {
        const chunk = need.slice(i, i + CHUNK)
        const res = await Promise.all(
          chunk.map((s) =>
            queryHistory(s.id)
              .then((h) => [s.id, h])
              .catch((e) => {
                console.error('queryHistory failed for session', s.id, e)
                return [s.id, null]          // not cached → retried on refresh
              })
          )
        )
        if (dead) return
        res.forEach(([id, h]) => { if (h) cache.current.set(id, h) })
        setHistories(Object.fromEntries(cache.current))
      }
      if (!dead) setLoadingReadings(false)
    })()

    return () => { dead = true }
  }, [allSessions, range.start, range.end, tick])

  return {
    allSessions,
    baselines,
    histories,
    loading: loadingList || loadingReadings,
    error,
    refresh,
    dropSession,
  }
}
