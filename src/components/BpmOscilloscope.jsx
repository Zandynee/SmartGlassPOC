// ─────────────────────────────────────────────
//  BpmOscilloscope.jsx  –  UI component
//  Scrolling PPG waveform on a canvas element,
//  styled like a CRT phosphor oscilloscope.
//
//  Renders the actual IR waveform from imuService's
//  display buffer — not a synthetic animation.
//  The buffer is populated by:
//    • BLE mode:  parseBlePpg() (one sample per 400 ms)
//    • Sim mode:  pushSimulatedIrSample() (one sample per 50 ms)
//
//  Props:
//    live – boolean; true when receiving real/simulated data
// ─────────────────────────────────────────────

import { useEffect, useRef } from 'react'
import { getIrDisplaySnapshot, PPG_DISPLAY_WINDOW_MS } from '../services/imuService'

// ── Canvas dimensions ──────────────────────────
const W = 260
const H = 88

// ── Canvas renderer ────────────────────────────
function drawFrame(ctx, snapshot, live) {
  // Background
  ctx.fillStyle = '#020d02'
  ctx.fillRect(0, 0, W, H)

  // Graticule (oscilloscope grid)
  ctx.lineWidth   = 1
  ctx.strokeStyle = 'rgba(0,255,80,0.07)'
  for (let col = 1; col < 8; col++) {
    ctx.beginPath()
    ctx.moveTo((col / 8) * W, 0)
    ctx.lineTo((col / 8) * W, H)
    ctx.stroke()
  }
  for (let row = 1; row < 4; row++) {
    ctx.beginPath()
    ctx.moveTo(0, (row / 4) * H)
    ctx.lineTo(W, (row / 4) * H)
    ctx.stroke()
  }

  // Flat isoelectric line when idle or no signal
  if (!live || !snapshot || snapshot.length < 2) {
    ctx.strokeStyle = 'rgba(0,255,80,0.28)'
    ctx.lineWidth   = 1.5
    ctx.beginPath()
    ctx.moveTo(0, H * 0.82)
    ctx.lineTo(W, H * 0.82)
    ctx.stroke()
    return
  }

  // ── Map timestamps to x-axis ──────────────────
  // The display window spans PPG_DISPLAY_WINDOW_MS.
  // x=0 is the oldest edge, x=W is "now".
  const now    = Date.now()
  const tStart = now - PPG_DISPLAY_WINDOW_MS

  const toX = (t) => ((t - tStart) / PPG_DISPLAY_WINDOW_MS) * W
  // y=0 is top; amplitude occupies 10 %–88 % of canvas height
  const toY = (v) => H * 0.88 - v * H * 0.78

  // Build the path once, draw twice (glow + crisp trace)
  const tracePath = () => {
    ctx.beginPath()
    let started = false
    for (const { t, vNorm } of snapshot) {
      const x = toX(t)
      const y = toY(vNorm)
      if (!started) { ctx.moveTo(x, y); started = true }
      else          { ctx.lineTo(x, y) }
    }
  }

  // Glow layer
  ctx.save()
  ctx.strokeStyle = 'rgba(0,255,85,0.22)'
  ctx.lineWidth   = 5
  ctx.shadowColor = '#00ff55'
  ctx.shadowBlur  = 10
  tracePath()
  ctx.stroke()
  ctx.restore()

  // Main phosphor trace
  ctx.save()
  ctx.strokeStyle = '#00ff55'
  ctx.lineWidth   = 1.8
  ctx.shadowColor = '#00ff55'
  ctx.shadowBlur  = 4
  tracePath()
  ctx.stroke()
  ctx.restore()

  // ── Leading-edge dot (scan-head indicator) ────
  const last = snapshot[snapshot.length - 1]
  const dotX = toX(last.t)
  const dotY = toY(last.vNorm)
  if (dotX >= 0 && dotX <= W) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(dotX, dotY, 3, 0, Math.PI * 2)
    ctx.fillStyle   = '#00ff55'
    ctx.shadowColor = '#00ff55'
    ctx.shadowBlur  = 8
    ctx.fill()
    ctx.restore()
  }
}

// ── Component ──────────────────────────────────
export function BpmOscilloscope({ live }) {
  const canvasRef = useRef(null)
  const liveRef   = useRef(live)

  useEffect(() => { liveRef.current = live }, [live])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    let raf

    const tick = () => {
      raf = requestAnimationFrame(tick)
      // Read the latest normalized snapshot from the service's display buffer.
      // Returns null when there is no AC signal (flat / no contact / idle).
      const snapshot = liveRef.current ? getIrDisplaySnapshot() : null
      drawFrame(ctx, snapshot, liveRef.current)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="mb-[18px]">
      <span className="text-xs font-mono font-semibold block mb-1">
        PPG Waveform
        <span className="font-normal opacity-60"> Oscilloscope</span>
      </span>

      <div
        className="rounded-md overflow-hidden border border-[var(--border)]"
        style={{ display: 'inline-block', lineHeight: 0 }}
      >
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          style={{ display: 'block', width: W, height: H }}
        />
      </div>
    </div>
  )
}