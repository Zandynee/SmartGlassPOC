// ─────────────────────────────────────────────
//  hooks/useDesktopAlerts.js  (HSM version)
//  Desktop notifications. Pass `live` = ONLINE && WORK_MODE && session not ended,
//  so nothing fires in BASELINE / CHECK / offline.
//    • too close to the monitor                     (rising edge + cooldown)
//    • bad posture for BAD_POSTURE_MS               (badPosture, from App: |Δpitch| > 15°)
//    • early warning: |Δpitch| 10–15° for 2 s       (imuDeviation)
//    • "Mau cek kondisi?" prompt opened               (promptOpen, rising edge)
//    • HRV dropped after a check                    (checkStatus === 'DROP')
//  REMOVED: the 20-minute break reminder (Timer_D prompt replaces it) and the PPG alert.
// ─────────────────────────────────────────────

import { useEffect, useRef } from 'react'
import { notify } from '../services/notify'

export const TOO_CLOSE_CM = 20
export const BAD_POSTURE_MS = 2000
export const COOLDOWN_MS = 30_000
export const IMU_WARN_MIN_DEG = 10
export const IMU_WARN_MAX_DEG = 15   // was 20; stops at the bad-posture limit so both never fire together

export const isBadPosture = (fhpStatus) => fhpStatus === 'POOR_POSTURE'

export function useDesktopAlerts({
  live,
  distanceCm,
  badPosture = false,
  imuDeviation = null,
  promptOpen = false,
  checkStatus = null,
}) {
  const lastClose = useRef(0)
  const lastPosture = useRef(0)
  const lastImuWarn = useRef(0)
  const closeArmed = useRef(true)
  const imuDev = useRef(null)
  imuDev.current = imuDeviation

  const tooClose = live && Number.isFinite(distanceCm) && distanceCm > 0 && distanceCm < TOO_CLOSE_CM
  const bad = live && badPosture
  const imuWarn =
    live && Number.isFinite(imuDeviation) && imuDeviation >= IMU_WARN_MIN_DEG && imuDeviation <= IMU_WARN_MAX_DEG

  // ── too close ──
  useEffect(() => {
    if (!tooClose) { closeArmed.current = true; return }
    const now = Date.now()
    if (closeArmed.current && now - lastClose.current > COOLDOWN_MS) {
      closeArmed.current = false
      lastClose.current = now
      notify('VisioGuard', `Terlalu dekat dengan layar (${Math.round(distanceCm)} cm). Jaga jarak minimal ${TOO_CLOSE_CM} cm.`)
    }
  }, [tooClose, distanceCm])

  // ── bad posture persisting 2 s ──
  useEffect(() => {
    if (!bad) return undefined
    const id = setTimeout(() => {
      const now = Date.now()
      if (now - lastPosture.current > COOLDOWN_MS) {
        lastPosture.current = now
        notify('VisioGuard', 'Postur kepala menyimpang dari posisi tegak Anda. Tegakkan kepala.')
      }
    }, BAD_POSTURE_MS)
    return () => clearTimeout(id)
  }, [bad])

  // ── early warning band ──
  useEffect(() => {
    if (!imuWarn) return undefined
    const id = setTimeout(() => {
      const now = Date.now()
      if (now - lastImuWarn.current > COOLDOWN_MS) {
        lastImuWarn.current = now
        notify(
          'VisioGuard: peringatan postur',
          `Kepala Anda bergeser ±${Math.round(imuDev.current ?? IMU_WARN_MIN_DEG)}° dari posisi tegak. Luruskan sebelum menjadi kebiasaan.`
        )
      }
    }, BAD_POSTURE_MS)
    return () => clearTimeout(id)
  }, [imuWarn])

  // ── Timer_D prompt (user may be in another window) ──
  useEffect(() => {
    if (promptOpen) {
      notify('VisioGuard: cek kondisi', 'Sudah cukup lama bekerja. Buka aplikasi untuk cek kondisi (±3 menit).')
    }
  }, [promptOpen])

  // ── result of an HRV check ──
  useEffect(() => {
    if (checkStatus === 'DROP') {
      notify('VisioGuard: HRV turun', 'HRV turun dibanding baseline, pertimbangkan istirahat.')
    }
  }, [checkStatus])
}
