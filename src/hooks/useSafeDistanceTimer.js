// ─────────────────────────────────────────────
//  useSafeDistanceTimer.js
//  Counts how many consecutive seconds the user has kept a safe
//  distance from the screen ("Dalam jarak aman selama 15 menit 20 detik").
//
//  - Only counts while live (BLE or simulation).
//  - Resets to 0 the moment the user gets closer than SAFE_MIN_CM.
// ─────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'

// Minimum comfortable viewing distance. Change here if the clinical
// threshold differs.
export const SAFE_MIN_CM = 40

export function useSafeDistanceTimer(distanceCm, live) {
  const [seconds, setSeconds] = useState(0)

  // The interval below is created once; it reads the freshest values via a ref
  const latest = useRef({ distanceCm, live })
  useEffect(() => {
    latest.current = { distanceCm, live }
  })

  useEffect(() => {
    const id = setInterval(() => {
      const { distanceCm: d, live: isLive } = latest.current
      if (!isLive) {
        setSeconds(0)
        return
      }
      setSeconds((s) => (d >= SAFE_MIN_CM ? s + 1 : 0))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // null = unknown (not live)
  const safe = live ? distanceCm >= SAFE_MIN_CM : null
  return { safe, seconds }
}

// 920 → "15 menit 20 detik", 45 → "45 detik"
export function formatDuration(totalSeconds) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  if (m === 0) return `${s} detik`
  return `${m} menit ${s} detik`
}
