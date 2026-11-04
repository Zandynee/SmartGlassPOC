// ─────────────────────────────────────────────
//  hooks/useSessionRecorder.js  –  database persistence for the HSM app
//  Replaces the persistence that lived inside the old useSensors.
//
//  Session   opened lazily at the first write (no empty sessions while the
//            glasses sit in BASELINE_CREATION). Closed when
//              • the user presses Disconnect (enabled → false)
//              • "End session" in CHECK_MODE (sessionEnded → true)
//              • the link has been down longer than GRACE_MS (ended_at = the drop time)
//              • the component unmounts
//            A short drop + reconnect continues the SAME session.
//  WORK_MODE every 500 ms, only with FRESH packets (no stale duplicates while
//            offline): imu_readings (pitch + posture flag), tof_readings.
//  CHECK     one `checks` row per finished check, plus one ppg_readings row
//            (hr_bpm + a 0-100 fatigue_index) so the existing History metrics
//            "Detak Jantung" and "Kelelahan" keep working unchanged.
// ─────────────────────────────────────────────

import { useCallback, useEffect, useRef } from 'react'
import {
  startSession, endSession, insertImuReading, insertTofReading, insertPpgReading, insertCheck,
} from '../services/db/sessions'
import { LINK } from '../services/bleService'
import { GLASSES_STATE } from '../services/bleConfig'

const WRITE_MS = 500
const FRESH_MS = 1500
const GRACE_MS = 120_000

// Same rule as App.jsx. History ignores ToF rows whose status is not OK/UNKNOWN,
// so firmware words like "SAFE"/"TOO_CLOSE" are stored as OK. Only fault text is kept.
const TOF_FAULT = /ERR|FAIL|FAULT|TIMEOUT|OUT_OF_RANGE|INVALID/i
export const tofDbStatus = (s) => (s && TOF_FAULT.test(s) ? s : 'OK')

/**
 * 0-100 index from a compareHrv() result: mean drop% × 3.75 (a 20 % drop ≈ 75).
 * Forced to agree with the verdict: fatigued → ≥ 75, not fatigued → ≤ 74.
 */
export function fatigueIndexFromCmp(cmp) {
  const drops = Object.values(cmp.metrics)
    .filter((m) => m.usable && Number.isFinite(m.dropPct))
    .map((m) => Math.max(0, m.dropPct))
  const mean = drops.length ? drops.reduce((a, b) => a + b, 0) / drops.length : 0
  let idx = Math.min(100, Math.round(mean * 3.75))
  idx = cmp.fatigued ? Math.max(idx, 75) : Math.min(idx, 74)
  return idx
}

/**
 * @param enabled      g.enabled
 * @param link         g.s.link
 * @param fw           g.s.fw
 * @param simulate     'simulate' vs 'ble' session mode
 * @param imu, tof     g.imu / g.tof  ({…, t})
 * @param fhpStatus    'POOR_POSTURE' | 'NORMAL'  (App computes it from the baseline)
 * @param outcome      g.s.check.outcome
 * @param sessionEnded g.s.sessionEnded
 */
export function useSessionRecorder({ enabled, link, fw, simulate, imu, tof, fhpStatus, outcome, sessionEnded }) {
  const latest = useRef({})
  latest.current = { enabled, link, fw, simulate, imu, tof, fhpStatus, sessionEnded }

  const sid = useRef(null)        // open session id
  const opening = useRef(null)    // in-flight startSession promise
  const graceTimer = useRef(null)
  const lastOutcome = useRef(null)
  const busy = useRef(false)
  const errorRef = useRef(null)

  const ensure = useCallback(async () => {
    if (sid.current) return sid.current
    if (!opening.current) {
      opening.current = startSession(latest.current.simulate ? 'simulate' : 'ble')
        .then((id) => { sid.current = id; return id })
        .finally(() => { opening.current = null })
    }
    return opening.current
  }, [])

  const close = useCallback(async (at = Date.now()) => {
    const pending = opening.current ? await opening.current.catch(() => null) : null
    const id = sid.current ?? pending
    sid.current = null
    if (id) {
      try { await endSession(id, at) } catch (e) { console.error('endSession failed:', e) }
    }
  }, [])

  // ── 500 ms writer (WORK_MODE only, fresh packets only) ──
  useEffect(() => {
    const timer = setInterval(async () => {
      const c = latest.current
      if (busy.current || !c.enabled || c.sessionEnded) return
      if (c.link !== LINK.ONLINE || c.fw !== GLASSES_STATE.WORK_MODE) return
      const now = Date.now()
      const imuOk = c.imu && now - c.imu.t < FRESH_MS
      const tofOk = c.tof && now - c.tof.t < FRESH_MS
      if (!imuOk && !tofOk) return

      busy.current = true
      try {
        const id = await ensure()
        if (imuOk) {
          await insertImuReading(id, { roll: null, pitch: c.imu.pitchDeg, yaw: null, fhpStatus: c.fhpStatus ?? c.imu.fhpStatus })
        }
        if (tofOk) {
          await insertTofReading(id, { distanceCm: c.tof.distanceCm, status: tofDbStatus(c.tof.status) })
        }
        errorRef.current = null
      } catch (e) {
        errorRef.current = e
        console.error('Persistence write failed:', e)
      } finally {
        busy.current = false
      }
    }, WRITE_MS)
    return () => clearInterval(timer)
  }, [ensure])

  // ── finished fatigue check → checks + ppg_readings ──
  useEffect(() => {
    if (!outcome || !outcome.ok || lastOutcome.current === outcome) return
    lastOutcome.current = outcome
    ;(async () => {
      try {
        const id = await ensure()
        const { current: cur, cmp } = outcome
        const m = cmp.metrics
        const idx = fatigueIndexFromCmp(cmp)
        await insertCheck(id, {
          hrBpm: cur.hrBpm, sdnn: cur.sdnn, rmssd: cur.rmssd, pnn50: cur.pnn50,
          baseHrBpm: cmp.hrDeltaBpm != null ? cur.hrBpm - cmp.hrDeltaBpm : null,
          baseSdnn: m.sdnn.base, baseRmssd: m.rmssd.base, basePnn50: m.pnn50.base,
          fatigueIndex: idx, fatigued: cmp.fatigued,
          nIbis: cur.quality?.validIbis, durationS: cur.quality?.durationS,
        })
        await insertPpgReading(id, {
          irRaw: null, redRaw: null, hrBpm: cur.hrBpm, hrDetectable: true,
          fatigueIndex: idx, fatigueStatus: cmp.fatigued ? 'FATIGUED' : 'FRESH',
        })
      } catch (e) {
        console.error('Saving check failed:', e)
      }
    })()
  }, [outcome, ensure])

  // ── closing rules ──
  useEffect(() => { if (!enabled) close() }, [enabled, close])
  useEffect(() => { if (sessionEnded) close() }, [sessionEnded, close])

  useEffect(() => {
    clearTimeout(graceTimer.current)
    if (enabled && link !== LINK.ONLINE && sid.current) {
      const at = Date.now()
      graceTimer.current = setTimeout(() => close(at), GRACE_MS)
    }
    return () => clearTimeout(graceTimer.current)
  }, [enabled, link, close])

  useEffect(() => () => { close() }, [close])

  return { errorRef }
}
