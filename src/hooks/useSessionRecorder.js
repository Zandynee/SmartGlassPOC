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
//  CHECK     one `checks` row per finished check (also INVALID ones: status 'INVALID'),
//            plus one ppg_readings row with the median HR (History "Detak Jantung").
//            There is no fatigue index any more: History shows the RMSSD change in %.
//  BASELINE  one `baselines` row per baseline (daily; fitness 1-5, medians), stored once.
// ─────────────────────────────────────────────

import { useCallback, useEffect, useRef } from 'react'
import {
  startSession, endSession, insertImuReading, insertTofReading, insertPpgReading, insertCheck, insertBaselineIfNew,
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

/** decision.decideCheck() output → the flat shape insertCheck() takes. */
export function checkRowFromOutcome(o, workDurationS) {
  return {
    status: o.status,
    hrBpm: o.hrBpm?.cur,
    sdnn: o.sdnn?.cur,
    rmssd: o.rmssd?.cur,
    baseSdnn: o.sdnn?.base,
    baseRmssd: o.rmssd?.base,
    rmssdChangePct: o.rmssd?.changePct,
    sdnnChangePct: o.sdnn?.changePct,
    validWindows: o.validWindows,
    totalWindows: o.totalWindows,
    dropThr: o.dropThr,
    workDurationS,
  }
}

/**
 * @param enabled      g.enabled
 * @param link         g.s.link
 * @param fw           g.s.fw
 * @param simulate     'simulate' vs 'ble' session mode
 * @param imu, tof     g.imu / g.tof  ({…, t})
 * @param fhpStatus    'POOR_POSTURE' | 'NORMAL'  (App computes it from the baseline)
 * @param outcome      g.s.check.outcome (decision.decideCheck output)
 * @param baseline     g.s.baseline (stored once in `baselines`)
 * @param workDurationS g.s.work.timerS (Timer_D; still intact while the check runs)
 * @param sessionEnded g.s.sessionEnded
 */
export function useSessionRecorder({ enabled, link, fw, simulate, imu, tof, fhpStatus, outcome, baseline, workDurationS, sessionEnded }) {
  const latest = useRef({})
  latest.current = { enabled, link, fw, simulate, imu, tof, fhpStatus, sessionEnded, workDurationS }

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

  // ── baseline → `baselines` (once per baseline; the UNIQUE created_at ignores repeats) ──
  useEffect(() => {
    if (!baseline) return
    insertBaselineIfNew(baseline).catch((e) => console.error('Saving baseline failed:', e))
  }, [baseline])

  // ── finished check → checks (+ ppg_readings with the HR) ──
  useEffect(() => {
    if (!outcome || lastOutcome.current === outcome) return
    lastOutcome.current = outcome
    ;(async () => {
      try {
        const id = await ensure()
        const row = checkRowFromOutcome(outcome, latest.current.workDurationS)
        await insertCheck(id, row)
        if (outcome.ok && Number.isFinite(row.hrBpm)) {
          await insertPpgReading(id, { irRaw: null, redRaw: null, hrBpm: row.hrBpm, hrDetectable: true })
        }
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
