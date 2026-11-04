// ─────────────────────────────────────────────
//  BpmOscilloscope.jsx  –  UI component
//  Scrolling PPG waveform on a canvas element,
//  styled like a CRT phosphor oscilloscope.
//
//  Renders the actual IR waveform from the PPG service's
//  display buffer — not a synthetic animation.
//  The buffer is populated by:
//    • BLE mode:  parseBlePpg() (one sample per 400 ms)
//    • Sim mode:  pushSimulatedIrSample() (one sample per 50 ms)
//
//  Props:
//    live – boolean; true when receiving real/simulated data
// ─────────────────────────────────────────────

import { useEffect, useRef } from 'react'
import { getIrDisplaySnapshot, PPG_DISPLAY_WINDOW_MS } from '../services/ppgService'

const W = 600
const H = 200

// ── Canvas renderer ────────────────────────────
function drawFrame(ctx, snapshot, live) {
  ctx.fillStyle = '#020d02'
  ctx.fillRect(0, 0, W, H)

  ctx.lineWidth   = 1
  ctx.strokeStyle = 'rgba(0,255,80,0.09)'
  for (let col = 1; col < 12; col++) {
    ctx.beginPath()
    ctx.moveTo((col / 12) * W, 0)
    ctx.lineTo((col / 12) * W, H)
    ctx.stroke()
  }
  for (let row = 1; row < 6; row++) {
    ctx.beginPath()
    ctx.moveTo(0, (row / 6) * H)
    ctx.lineTo(W, (row / 6) * H)
    ctx.stroke()
  }

  if (!live || !snapshot || snapshot.length < 2) {
    ctx.strokeStyle = 'rgba(0,255,80,0.28)'
    ctx.lineWidth   = 2
    ctx.beginPath()
    ctx.moveTo(0, H * 0.82)
    ctx.lineTo(W, H * 0.82)
    ctx.stroke()
    return
  }

  const now    = Date.now()
  const tStart = now - PPG_DISPLAY_WINDOW_MS

  const toX = (t) => ((t - tStart) / PPG_DISPLAY_WINDOW_MS) * W
  const toY = (v) => H * 0.88 - v * H * 0.78

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

  ctx.save()
  ctx.strokeStyle = 'rgba(0,255,85,0.22)'
  ctx.lineWidth   = 7
  ctx.shadowColor = '#00ff55'
  ctx.shadowBlur  = 14
  tracePath()
  ctx.stroke()
  ctx.restore()

  ctx.save()
  ctx.strokeStyle = '#00ff55'
  ctx.lineWidth   = 2.6
  ctx.shadowColor = '#00ff55'
  ctx.shadowBlur  = 6
  ctx.lineJoin    = 'round'
  tracePath()
  ctx.stroke()
  ctx.restore()

  const last = snapshot[snapshot.length - 1]
  const dotX = toX(last.t)
  const dotY = toY(last.vNorm)
  if (dotX >= 0 && dotX <= W) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(dotX, dotY, 4.5, 0, Math.PI * 2)
    ctx.fillStyle   = '#00ff55'
    ctx.shadowColor = '#00ff55'
    ctx.shadowBlur  = 10
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
      const snapshot = liveRef.current ? getIrDisplaySnapshot() : null
      drawFrame(ctx, snapshot, liveRef.current)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // CHANGED: no white wrapper any more (the parent Card is already white);
  // just a small caption and the dark screen with a thin card-style border.
  return (
    <div>
      <p className="m-0 mb-1.5 text-xs font-semibold text-slate-500">
        PPG Waveform <span className="font-normal text-slate-400">· Oscilloscope</span>
      </p>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="block w-full h-auto rounded-xl border border-[#dbe6f7]"
      />
    </div>
  )
}
