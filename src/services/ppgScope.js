// ─────────────────────────────────────────────
//  ppgScope.js  –  ring buffer of the latest raw PPG samples for the live oscilloscope
//  Plain JS (no React). GlassesSession pushes every sample; components/PpgScope.jsx reads it
//  on animation frames and draws it, so the 100 Hz stream never goes through React state.
//  Display uses the same filter as the analysis (hrv.js filterPpg: inverted, 0.7–5 Hz).
// ─────────────────────────────────────────────

import { PPG_SAMPLE_RATE_HZ } from './bleConfig.js'

export class PpgScopeBuffer {
  constructor(seconds = 10, fs = PPG_SAMPLE_RATE_HZ) {
    this.fs = fs
    this.size = Math.round(seconds * fs)
    this.buf = new Float64Array(this.size)
    this.head = 0          // next write position
    this.count = 0
    this.lastContact = false
    this.version = 0       // bumps on every push (cheap "changed?" check)
  }

  push(ir, contact = true) {
    this.buf[this.head] = ir
    this.head = (this.head + 1) % this.size
    if (this.count < this.size) this.count++
    this.lastContact = contact
    this.version++
  }

  reset() {
    this.head = 0
    this.count = 0
    this.lastContact = false
    this.version++
  }

  /** Samples oldest → newest (a copy). */
  read() {
    const out = new Float64Array(this.count)
    const start = (this.head - this.count + this.size) % this.size
    for (let i = 0; i < this.count; i++) out[i] = this.buf[(start + i) % this.size]
    return out
  }
}
