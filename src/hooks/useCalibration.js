// ─────────────────────────────────────────────
//  hooks/useCalibration.js
//  Stores a baseline when the user presses "Kalibrasi / Rekalibrasi":
//    • IMU  → roll / pitch / yaw at that moment
//    • PPG  → heart rate + fatigue index at that moment
//  From then on the app works with DELTAS (current − baseline) and
//  flags abnormal values when a delta crosses its limit.
//
//  If the PPG has no valid reading at click time (finger not on the
//  sensor yet) the PPG baseline is captured from the first valid
//  reading afterwards (`ppgPending` is true until then).
// ─────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'

// Tune these to the clinical / ergonomic thresholds you want.
export const IMU_DELTA_LIMIT = { roll: 15, pitch: 15, yaw: 30 }      // degrees
export const PPG_DELTA_LIMIT = { hrBpm: 15, fatigueIndex: 20 }       // bpm / index points

const wrap180 = (a) => ((((a + 180) % 360) + 360) % 360) - 180
const fmtSigned = (n, d = 0) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}`

export function useCalibration({ live, roll, pitch, yaw, ppg }) {
  const [baseline, setBaseline] = useState(null)

  // Always-fresh values for the click handler (no stale closures)
  const latest = useRef({ roll, pitch, yaw, ppg })
  latest.current = { roll, pitch, yaw, ppg }

  const calibrate = useCallback(() => {
    const { roll: r, pitch: p, yaw: y, ppg: g } = latest.current
    setBaseline({
      roll: r,
      pitch: p,
      yaw: y,
      ppg: g.hrDetectable ? { hrBpm: g.hrBpm, fatigueIndex: g.fatigueIndex } : null,
      at: Date.now(),
    })
  }, [])

  const clear = useCallback(() => setBaseline(null), [])

  // Link dropped / simulation stopped → old baseline is meaningless
  useEffect(() => {
    if (!live) setBaseline(null)
  }, [live])

  // PPG wasn't ready when the button was pressed → take the first valid reading
  useEffect(() => {
    if (baseline && !baseline.ppg && live && ppg.hrDetectable) {
      setBaseline((b) =>
        b && !b.ppg
          ? { ...b, ppg: { hrBpm: ppg.hrBpm, fatigueIndex: ppg.fatigueIndex } }
          : b
      )
    }
  }, [baseline, live, ppg.hrDetectable, ppg.hrBpm, ppg.fatigueIndex])

  const calibrated = baseline !== null

  // ── IMU delta ──
  const rel = calibrated
    ? {
        roll:  wrap180(roll  - baseline.roll),
        pitch: wrap180(pitch - baseline.pitch),
        yaw:   wrap180(yaw   - baseline.yaw),
      }
    : { roll, pitch, yaw }

  const imuFlags = {
    roll:  calibrated && live && Math.abs(rel.roll)  > IMU_DELTA_LIMIT.roll,
    pitch: calibrated && live && Math.abs(rel.pitch) > IMU_DELTA_LIMIT.pitch,
    yaw:   calibrated && live && Math.abs(rel.yaw)   > IMU_DELTA_LIMIT.yaw,
  }
  const imuAbnormal = imuFlags.roll || imuFlags.pitch || imuFlags.yaw

  // ── PPG delta ──
  const ppgPending = calibrated && !baseline.ppg
  const ppgDelta =
    calibrated && baseline.ppg && live && ppg.hrDetectable
      ? {
          hrBpm: ppg.hrBpm - baseline.ppg.hrBpm,
          fatigueIndex: ppg.fatigueIndex - baseline.ppg.fatigueIndex,
        }
      : null

  const ppgFlags = {
    hrBpm: !!ppgDelta && Math.abs(ppgDelta.hrBpm) > PPG_DELTA_LIMIT.hrBpm,
    fatigueIndex: !!ppgDelta && ppgDelta.fatigueIndex > PPG_DELTA_LIMIT.fatigueIndex,
  }
  const ppgAbnormal = ppgFlags.hrBpm || ppgFlags.fatigueIndex

  // Human-readable reason, used for notifications / Windows pop-ups
  const ppgReason = !ppgAbnormal
    ? null
    : [
        ppgFlags.hrBpm &&
          `Detak jantung ${fmtSigned(ppgDelta.hrBpm)} bpm dari kondisi awal (${Math.round(ppg.hrBpm)} bpm)`,
        ppgFlags.fatigueIndex &&
          `Indeks kelelahan naik ${fmtSigned(ppgDelta.fatigueIndex)} poin dari kondisi awal`,
      ]
        .filter(Boolean)
        .join('. ') + '.'

  return {
    baseline, calibrated, calibrate, clear,
    rel, imuFlags, imuAbnormal,
    ppgDelta, ppgFlags, ppgAbnormal, ppgPending, ppgReason,
  }
}
