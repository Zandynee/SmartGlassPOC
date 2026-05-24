// ─────────────────────────────────────────────
//  BpmOscilloscope.jsx  –  UI component
//  Scrolling PPG waveform on a canvas element,
//  styled like a CRT phosphor oscilloscope.
//
//  Props:
//    hrBpm – current heart rate (beats per minute)
//    live  – boolean; true when receiving real/simulated data
// ─────────────────────────────────────────────

import { useEffect, useRef } from 'react'

// ── Canvas dimensions ──────────────────────────
const W = 260   // px
const H = 88    // px

// ── Circular sample buffer ─────────────────────
// At ~60 fps each slot ≈ 16.7 ms → 300 slots ≈ 5 s of history.
// That shows ~6 beats at 75 BPM.
const BUF = 300

// ── Synthetic PPG shape ────────────────────────
// Returns amplitude in [0, 1] for a given phase in [0, 1].
// Models the typical double-hump PPG / plethysmogram profile:
//   • systolic peak  ≈ 20 % into the cardiac cycle
//   • dicrotic notch ≈ 45 % (small secondary bump)
function ppgShape(phase) {
  const sys = Math.exp(-Math.pow((phase - 0.20) * 11.0, 2))
  const dic = 0.38 * Math.exp(-Math.pow((phase - 0.46) * 16.0, 2))
  return Math.max(0, sys + dic)
}

// ── Canvas renderer ────────────────────────────
function drawFrame(ctx, buf, head, live) {
  // Background
  ctx.fillStyle = '#020d02'
  ctx.fillRect(0, 0, W, H)

  // Graticule (oscilloscope grid)
  ctx.lineWidth = 1
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

  if (!live) {
    // Flat isoelectric line when idle
    ctx.strokeStyle = 'rgba(0,255,80,0.28)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(0, H * 0.82)
    ctx.lineTo(W, H * 0.82)
    ctx.stroke()
    return
  }

  // Build the waveform path once, then stroke twice (glow + main)
  const tracePath = () => {
    ctx.beginPath()
    for (let i = 0; i < BUF; i++) {
      const sample = buf[(head + i) % BUF]
      const x = (i / (BUF - 1)) * W
      // Amplitude occupies 10 %–88 % of canvas height; y-axis inverted
      const y = H * 0.88 - sample * H * 0.78
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
  }

  // Glow layer (soft halo)
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
}

// ── Component ──────────────────────────────────
export function BpmOscilloscope({ hrBpm, live }) {
  const canvasRef = useRef(null)

  // All mutable oscilloscope state lives here to avoid stale closures
  // and unnecessary re-renders.
  const stRef = useRef({
    buf:     new Float32Array(BUF).fill(0),
    head:    0,
    tAccum:  0,
    lastNow: null,
  })

  // Keep a ref to props so the rAF closure always reads fresh values
  // without depending on them as effect dependencies.
  const prRef = useRef({ hrBpm, live })
  useEffect(() => {
    prRef.current = { hrBpm, live }
    // Reset time accumulator when stopping so the next start is clean
    if (!live) stRef.current.tAccum = 0
  }, [hrBpm, live])

  // Start the render loop once on mount; tear down on unmount.
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    let raf

    const tick = (now) => {
      raf = requestAnimationFrame(tick)
      const st            = stRef.current
      const { hrBpm: bpm, live: isLive } = prRef.current

      // Delta time (capped to avoid large jumps after tab-switch)
      if (st.lastNow === null) st.lastNow = now
      const dt      = Math.min((now - st.lastNow) / 1000, 0.1)
      st.lastNow    = now

      if (isLive && bpm > 0) {
        st.tAccum        += dt
        const period      = 60 / bpm           // seconds per beat
        const phase       = (st.tAccum % period) / period
        const sample      = ppgShape(phase)
        st.buf[st.head % BUF] = sample
        st.head++
      }

      drawFrame(ctx, st.buf, st.head % BUF, isLive)
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

      {/* Rounded border matching the rest of the UI */}
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