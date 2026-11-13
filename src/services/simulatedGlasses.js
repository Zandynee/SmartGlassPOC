// ─────────────────────────────────────────────
//  simulatedGlasses.js  –  fake firmware for testing WITHOUT hardware
//
//  Implements the same `api` object as createTauriApi() (connect, disconnect,
//  writeCommand, readState, listen) and behaves like the Hierarchical State
//  Machine firmware:
//
//    BASELINE_CREATION : imu (10 Hz) + ppg (100 Hz, sent in 50 ms bursts like BLE)
//    WORK_MODE         : imu (10 Hz) + tof (5 Hz)            – NO ppg
//    CHECK_MODE        : ppg (100 Hz)                        – NO tof
//
//  Test knobs (all optional):
//    sim.fingerOn      boolean   finger on the PPG sensor (default true)
//    sim.hrvDrop        boolean   lowers HRV in the signal (simulates a check that ends in DROP)   (default false)
//    sim.slouchDeg     number    added to the upright pitch  (default 0)
//    sim.distanceCm    number    ToF distance                (default 55)
//    sim.dropLink(ms)            link lost; reconnecting fails for `ms`
//    sim.setFirmwareState(s)     firmware changes state on its own (e.g. reboot)
// ─────────────────────────────────────────────

import { GLASSES_STATE } from './bleConfig.js'

const FS = 100
const BURST_MS = 50

export class SimulatedGlasses {
  constructor({ startState = GLASSES_STATE.BASELINE_CREATION, connectDelayMs = 400 } = {}) {
    this.fw = startState
    this.connectDelayMs = connectDelayMs

    this.fingerOn = true
    this.hrvDrop = false
    this.slouchDeg = 0
    this.distanceCm = 55
    this.uprightPitch = 4

    this.conn = false
    this._blockedUntil = 0
    this._h = {}
    this._timers = []
    this._rnd = 123456789
    this._beats = []
    this._beatIdx = 0
    this._t0 = 0
    this._emitted = 0
  }

  // ── api (same shape as createTauriApi) ────
  async listen(name, handler) {
    this._h[name] = handler
    return () => { if (this._h[name] === handler) delete this._h[name] }
  }

  async connect() {
    await new Promise((r) => setTimeout(r, this.connectDelayMs))
    if (Date.now() < this._blockedUntil) throw new Error("'SmartGlasses' not found")
    this.conn = true
    this._emit('ble-status', { connected: true })
    this._startStreams()
  }

  async disconnect() {
    this.conn = false
    this._stopStreams()
  }

  async writeCommand(value) {
    if (!this.conn) throw new Error('not connected')
    const target = { 1: GLASSES_STATE.WORK_MODE, 2: GLASSES_STATE.CHECK_MODE, 3: GLASSES_STATE.IDLE }[value]
    if (!target) throw new Error('invalid command ' + value)
    const F = GLASSES_STATE
    const ok = {
      [F.BASELINE_CREATION]: [F.WORK_MODE],
      [F.WORK_MODE]: [F.CHECK_MODE, F.IDLE],
      [F.CHECK_MODE]: [F.WORK_MODE, F.IDLE],
      [F.IDLE]: [F.WORK_MODE],
    }
    setTimeout(() => {
      // like the firmware: illegal/no-op requests just re-announce the current state
      if (target !== this.fw && !ok[this.fw]?.includes(target)) { if (this.conn) this._emit('ble-state', this.fw); return }
      if (target === this.fw) { if (this.conn) this._emit('ble-state', this.fw); return }
      this.setFirmwareState(target)
    }, 120)
  }

  async readState() {
    if (!this.conn) throw new Error('not connected')
    return this.fw
  }

  // ── knobs ─────────────────────────────────
  dropLink(ms = 4000) {
    this._blockedUntil = Date.now() + ms
    this.conn = false
    this._stopStreams()
    this._emit('ble-status', { connected: false })
  }

  setFirmwareState(s) {
    this.fw = s
    if (this.conn) {
      this._beats = []                 // fresh heartbeat series when a state starts
      this._t0 = 0
      this._emit('ble-state', s)
    }
  }

  // ── internals ─────────────────────────────
  _emit(name, payload) { this._h[name]?.(payload) }

  _rand() {                               // deterministic [0,1)
    this._rnd = (this._rnd * 16807) % 2147483647
    return this._rnd / 2147483647
  }
  _gauss() {
    return Math.sqrt(-2 * Math.log(this._rand() || 1e-9)) * Math.cos(2 * Math.PI * this._rand())
  }

  _nextIbi() {
    const i = this._beatIdx++
    const rsa = this.hrvDrop ? 14 : 55           // respiratory sinus arrhythmia (ms)
    const noise = this.hrvDrop ? 5 : 22
    return 850 + rsa * Math.sin(i * 0.75) + noise * this._gauss()
  }

  _ppgValue(tSec) {
    while (!this._beats.length || this._beats[this._beats.length - 1] < tSec + 1) {
      const last = this._beats.length ? this._beats[this._beats.length - 1] : 0.4
      this._beats.push(last + this._nextIbi() / 1000)
      if (this._beats.length > 12) this._beats.shift()
    }
    let v = 50000 + 700 * Math.sin(2 * Math.PI * 0.2 * tSec) + this._gauss() * 40
    for (const b of this._beats) {
      const d = tSec - b
      if (d > -0.3 && d < 0.6) v += 1500 * Math.exp(-((d - 0.05) ** 2) / (2 * 0.04 ** 2))
    }
    return v
  }

  _startStreams() {
    this._stopStreams()
    this._t0 = Date.now()
    this._emitted = 0
    this._beats = []

    // IMU 10 Hz (BASELINE + WORK)
    this._timers.push(setInterval(() => {
      if (!this.conn || this.fw === GLASSES_STATE.CHECK_MODE || this.fw === GLASSES_STATE.IDLE) return
      const pitch = this.uprightPitch + this.slouchDeg + this._gauss() * 0.3
      const bad = this.slouchDeg > 10
      this._emit('ble-imu', JSON.stringify({ pitch_deg: +pitch.toFixed(2), fhp_status: bad ? 'POOR_POSTURE' : 'NORMAL' }))
    }, 100))

    // ToF 5 Hz (WORK only)
    this._timers.push(setInterval(() => {
      if (!this.conn || this.fw !== GLASSES_STATE.WORK_MODE) return
      const d = this.distanceCm + this._gauss() * 0.6
      this._emit('ble-tof', JSON.stringify({ distance_cm: +d.toFixed(1), status: d < 30 ? 'TOO_CLOSE' : 'SAFE' }))
    }, 200))

    // PPG 100 Hz in 50 ms bursts (BASELINE + CHECK)
    this._timers.push(setInterval(() => {
      if (!this.conn || this.fw === GLASSES_STATE.WORK_MODE || this.fw === GLASSES_STATE.IDLE) { this._t0 = 0; return }
      if (!this._t0) { this._t0 = Date.now(); this._emitted = 0 }
      const due = Math.floor(((Date.now() - this._t0) * FS) / 1000) - this._emitted
      for (let k = 0; k < due; k++) {
        const t = (this._emitted + k) / FS
        const ir = this.fingerOn ? this._ppgValue(t) : 2500 + this._gauss() * 20
        const red = ir * 0.8
        this._emit('ble-ppg', JSON.stringify({
          ir: Math.round(ir), red: Math.round(red),
          contact_status: this.fingerOn ? 'FINGER_DETECTED' : 'NO_FINGER',
        }))
      }
      this._emitted += due
    }, BURST_MS))
  }

  _stopStreams() {
    this._timers.forEach(clearInterval)
    this._timers = []
  }
}
