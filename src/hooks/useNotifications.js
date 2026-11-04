// ─────────────────────────────────────────────
//  useNotifications.js
//  Builds the "Notifikasi" feed from sensor-state transitions.
//
//  level → card colour in the UI
//    info    blue    connection events
//    warning yellow  screen-time reminder, poor posture
//    danger  red     fatigue detected
//
//  Events are edge-triggered (fire once when the state changes),
//  so the feed isn't flooded on every sensor sample.
// ─────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'

const MAX_ITEMS = 20

// Remind the user every N minutes of continuous screen time.
export const SCREEN_REMINDER_MIN = 10

export function useNotifications({ live, fhpStatus, fatigueStatus, ppgAlert = null }) {
  const [items, setItems] = useState([])
  const nextId = useRef(1)

  const push = useCallback((level, message) => {
    setItems((prev) =>
      [{ id: nextId.current++, level, message, at: Date.now() }, ...prev].slice(0, MAX_ITEMS)
    )
  }, [])

  // ── Connection ─────────────────────────────
  const prevLive = useRef(false)
  useEffect(() => {
    if (live && !prevLive.current) {
      push('info', 'VisioGuard sudah terhubung dengan aplikasi!')
    } else if (!live && prevLive.current) {
      push('info', 'VisioGuard terputus dari aplikasi.')
    }
    prevLive.current = live
  }, [live, push])

  // ── Poor posture ───────────────────────────
  const prevFhp = useRef(fhpStatus)
  useEffect(() => {
    if (live && fhpStatus === 'POOR_POSTURE' && prevFhp.current !== 'POOR_POSTURE') {
      push('warning', 'Postur kepala Anda condong ke depan. Perbaiki posisi duduk Anda.')
    }
    prevFhp.current = fhpStatus
  }, [fhpStatus, live, push])

  // ── Fatigue ────────────────────────────────
  const prevFatigue = useRef(fatigueStatus)
  useEffect(() => {
    if (live && fatigueStatus === 'FATIGUED' && prevFatigue.current !== 'FATIGUED') {
      push('danger', 'Anda terdeteksi mulai kelelahan.')
    }
    prevFatigue.current = fatigueStatus
  }, [fatigueStatus, live, push])

  // ── Abnormal PPG vs. calibration baseline ──
  const prevPpgAlert = useRef(false)
  const ppgMsg = useRef(null)
  ppgMsg.current = ppgAlert
  const ppgActive = live && !!ppgAlert
  useEffect(() => {
    if (ppgActive && !prevPpgAlert.current) push('danger', ppgMsg.current)
    prevPpgAlert.current = ppgActive
  }, [ppgActive, push])

  // ── Screen-time reminder ───────────────────
  const liveSince = useRef(null)
  const reminded = useRef(0)
  useEffect(() => {
    if (!live) {
      liveSince.current = null
      reminded.current = 0
      return
    }
    liveSince.current = Date.now()
    reminded.current = 0

    const id = setInterval(() => {
      const minutes = Math.floor((Date.now() - liveSince.current) / 60000)
      const due = Math.floor(minutes / SCREEN_REMINDER_MIN)
      if (due > reminded.current) {
        reminded.current = due
        push('warning', `Anda sudah menatap layar selama ${minutes} menit.`)
      }
    }, 15000)
    return () => clearInterval(id)
  }, [live, push])

  return items
}
