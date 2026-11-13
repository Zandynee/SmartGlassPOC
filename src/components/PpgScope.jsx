// ─────────────────────────────────────────────
//  PpgScope.jsx  –  live "oscilloscope" of the PPG pulse wave
//
//  Shown while HRV / PRV is being measured (baseline wizard and check screen).
//  Draws the last ~8 s of the filtered signal (the same filter the analysis uses, so what you
//  see is what is measured) with the detected beats marked. Updates on animation frames
//  straight from session.scope (a ring buffer), not through React state.
//
//  Props
//    session  – GlassesSession (needs .scope)
//    contact  – finger on the sensor? (grey flat line + hint when false)
//    height   – px, default 150
// ─────────────────────────────────────────────

import { useEffect, useRef } from 'react'
import { filterPpg, detectPeaks } from '../services/hrv'

const SHOW_S = 8        // seconds on screen
const SKIP_S = 1.5      // filter start-up transient, never drawn
const FPS = 30

const C = { bg: '#f8fafc', grid: '#e8eef9', axis: '#cbd5e1', line: '#2563eb', off: '#94a3b8', beat: '#f59e0b', text: '#64748b' }

export function PpgScope({ session, contact = true, height = 150 }) {
  const canvasRef = useRef(null)
  const contactRef = useRef(contact)
  contactRef.current = contact

  useEffect(() => {
    const canvas = canvasRef.current
    const scope = session?.scope
    if (!canvas || !scope) return undefined
    const ctx = canvas.getContext('2d')
    let raf = 0
    let last = 0
    let lastVersion = -1

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const w = canvas.clientWidth
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      lastVersion = -1
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const draw = (now) => {
      raf = requestAnimationFrame(draw)
      if (now - last < 1000 / FPS) return
      last = now
      const hasContact = contactRef.current
      if (scope.version === lastVersion && hasContact === draw.prevContact) return
      lastVersion = scope.version
      draw.prevContact = hasContact

      const W = canvas.clientWidth
      const H = height
      ctx.clearRect(0, 0, W, H)
      ctx.fillStyle = C.bg
      ctx.fillRect(0, 0, W, H)

      // grid: 1 s columns, 4 rows
      ctx.lineWidth = 1
      ctx.strokeStyle = C.grid
      ctx.beginPath()
      for (let s = 1; s < SHOW_S; s++) { const x = Math.round((s / SHOW_S) * W) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, H) }
      for (let r = 1; r < 4; r++) { const y = Math.round((r / 4) * H) + 0.5; ctx.moveTo(0, y); ctx.lineTo(W, y) }
      ctx.stroke()
      ctx.strokeStyle = C.axis
      ctx.beginPath(); ctx.moveTo(0, H / 2 + 0.5); ctx.lineTo(W, H / 2 + 0.5); ctx.stroke()

      const fs = scope.fs
      const raw = scope.read()
      const skip = Math.round(SKIP_S * fs)
      const showN = Math.round(SHOW_S * fs)
      ctx.font = '11px system-ui, sans-serif'
      ctx.fillStyle = C.text

      if (!hasContact || raw.length < skip + fs) {
        ctx.textAlign = 'center'
        ctx.fillText(hasContact ? 'Menunggu sinyal…' : 'Jari belum menempel pada sensor', W / 2, H / 2 - 8)
        return
      }

      const y = filterPpg(raw, fs)
      const from = Math.max(skip, y.length - showN)
      const n = y.length - from
      // auto-scale on the 2nd..98th percentile so one spike does not flatten the wave
      const sorted = Array.from(y.subarray(from)).sort((a, b) => a - b)
      const lo = sorted[Math.floor(n * 0.02)]
      const hi = sorted[Math.min(n - 1, Math.floor(n * 0.98))]
      const mid = (lo + hi) / 2
      const half = Math.max((hi - lo) / 2, 1e-6) * 1.15
      const X = (i) => ((i + (showN - n)) / showN) * W          // newest sample at the right edge
      const Y = (v) => H / 2 - ((v - mid) / half) * (H / 2 - 8)

      ctx.lineWidth = 1.6
      ctx.lineJoin = 'round'
      ctx.strokeStyle = C.line
      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        const px = X(i), py = Math.min(H - 2, Math.max(2, Y(y[from + i])))
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
      }
      ctx.stroke()

      // detected beats + a rough heart rate (information only)
      let peaks = []
      try { peaks = detectPeaks(y.subarray(from), fs).filter((p) => p >= 0) } catch { /* too short */ }
      ctx.fillStyle = C.beat
      for (const p of peaks) {
        const py = Math.min(H - 4, Math.max(4, Y(y[from + Math.round(p)])))
        ctx.beginPath(); ctx.arc(X(p), py, 3.5, 0, Math.PI * 2); ctx.fill()
      }
      ctx.fillStyle = C.text
      ctx.textAlign = 'left'
      ctx.fillText('PPG (IR) · 8 detik', 8, 14)
      if (peaks.length >= 3) {
        const bpm = (60 * fs * (peaks.length - 1)) / (peaks[peaks.length - 1] - peaks[0])
        ctx.textAlign = 'right'
        ctx.fillText(`≈ ${bpm.toFixed(0)} denyut/mnt`, W - 8, 14)
      }
    }
    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [session, height])

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Grafik gelombang denyut (PPG) secara langsung"
      className="w-full rounded-xl border border-line"
      style={{ height }}
    />
  )
}
