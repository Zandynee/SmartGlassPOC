// ─────────────────────────────────────────────
//  bleService.js  –  BLE link to the glasses (Tier 3 ↔ firmware HSM)
//
//  Responsibilities
//   • connect + auto-reconnect forever (supervisor loop with backoff)
//   • on EVERY (re)connect: read stateChar first → the UI syncs to the firmware
//   • parse tof / imu / ppg / state notifications into typed events
//   • write cmdChar (1 = WORK, 2 = CHECK) and wait for the state notification
//     that confirms it (write-and-confirm, with retries)
//
//  Events (subscribe with `ble.on(name, fn)` → returns unsubscribe):
//     'link'   LINK.OFFLINE | LINK.SEARCHING | LINK.ONLINE
//     'state'  GLASSES_STATE value
//     'imu'    { pitchDeg, fhpStatus, t }
//     'tof'    { distanceCm, status, t }
//     'ppg'    { ir, red, contactStatus, t }
//     'error'  Error
//
//  The native side is injected (`api`) so this file is testable without Tauri.
//  The default api (createTauriApi) expects these Rust commands/events:
//     invoke('ble_connect')                    → resolves when connected + subscribed
//     invoke('ble_disconnect')
//     invoke('ble_write_command', { value })   → writes 1 byte to cmdChar
//     invoke('ble_read_state')                 → string read from stateChar
//     events: ble-imu, ble-tof, ble-ppg, ble-state (payload = JSON string or object),
//             ble-status ({connected:boolean} or boolean)
// ─────────────────────────────────────────────

import { CMD, GLASSES_STATE, parseGlassesState, PPG_SAMPLE_RATE_HZ } from './bleConfig.js'

export const LINK = Object.freeze({
  OFFLINE: 'OFFLINE',     // nothing running
  SEARCHING: 'SEARCHING', // trying to (re)connect → "Searching for Glasses…"
  ONLINE: 'ONLINE',
})

const BACKOFF_MS = [2000, 3000, 5000, 8000]
const HEARTBEAT_MS = 5000

// ── packet parsers ──────────────────────────
function toObj(payload) {
  if (payload == null) return null
  if (typeof payload === 'object' && !Array.isArray(payload)) return payload
  let s = payload
  if (Array.isArray(payload) || payload instanceof Uint8Array) s = String.fromCharCode(...payload)
  try { return JSON.parse(String(s).replace(/\0/g, '')) } catch { return null }
}
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export function parseTofPacket(payload, t = Date.now()) {
  const o = toObj(payload)
  const d = num(o?.distance_cm)
  if (d == null) return null
  return { distanceCm: d, status: String(o.status ?? ''), t }
}

export function parseImuPacket(payload, t = Date.now()) {
  const o = toObj(payload)
  const p = num(o?.pitch_deg)
  if (p == null) return null
  return { pitchDeg: p, fhpStatus: String(o.fhp_status ?? ''), t }
}

export function parsePpgPackets(payload, t = Date.now(), fs = PPG_SAMPLE_RATE_HZ) {
  const o = toObj(payload)
  if (!o) return []
  
  const irs = Array.isArray(o.ir) ? o.ir : [o.ir]
  const reds = Array.isArray(o.red) ? o.red : [o.red]
  const contactStatus = String(o.contact_status ?? '')
  
  const out = []
  for (let i = 0; i < irs.length; i++) {
    const ir = num(irs[i])
    if (ir == null) continue
    const red = num(reds[i]) ?? 0 
    
    out.push({ ir, red, contactStatus, t: t - (irs.length - 1 - i) * (1000 / fs) })
  }
  return out
}

export const parsePpgPacket = (p, t) => parsePpgPackets(p, t).at(-1) ?? null

// ── default (Tauri) api ─────────────────────
export function createTauriApi() {
  let core, event
  const load = async () => {
    core ??= await import('@tauri-apps/api/core')
    event ??= await import('@tauri-apps/api/event')
  }
  return {
    async connect() { await load(); await core.invoke('ble_connect') },
    async disconnect() { await load(); await core.invoke('ble_disconnect') },
    async writeCommand(value) { await load(); await core.invoke('ble_write_command', { value }) },
    async readState() { await load(); return core.invoke('ble_read_state') },
    async listen(name, handler) {
      await load()
      return event.listen(name, (e) => handler(e.payload))   // → unlisten fn
    },
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export class GlassesBle {
  constructor(api = createTauriApi(), { backoffMs = BACKOFF_MS } = {}) {
    this.api = api
    this.backoffMs = backoffMs
    this.handlers = {}
    this.link = LINK.OFFLINE
    this.state = null
    this._unlisten = []
    this._running = false
    this._gen = 0                // bumps on start/stop so an old supervisor loop exits
    this._ready = false          // listeners attached
    this._down = null            // deferred resolved when the link drops
    this._wake = null            // interrupts the backoff sleep
    this._pending = []           // waiters for a specific state (goTo)
  }

  // ── events ────────────────────────────────
  on(evt, fn) {
    (this.handlers[evt] ||= new Set()).add(fn)
    return () => this.handlers[evt]?.delete(fn)
  }
  _emit(evt, data) {
    for (const fn of this.handlers[evt] || []) {
      try { fn(data) } catch (e) { console.error('[ble] handler', evt, e) }
    }
  }

  // ── lifecycle ─────────────────────────────
  /** Attach native listeners once. */
  async init() {
    if (this._ready) return
    const L = async (name, fn) => this._unlisten.push(await this.api.listen(name, fn))
    await L('ble-imu', (p) => { const v = parseImuPacket(p); if (v) this._emit('imu', v) })
    await L('ble-tof', (p) => { const v = parseTofPacket(p); if (v) this._emit('tof', v) })
    await L('ble-ppg', (p) => { for (const v of parsePpgPackets(p)) this._emit('ppg', v) })
    await L('ble-state', (p) => this._onState(parseGlassesState(p)))
    await L('ble-status', (p) => {
      const connected =
        typeof p === 'object' && p !== null ? !!p.connected
        : typeof p === 'string' ? !/disconnect/i.test(p)
        : !!p
      if (!connected) this._onDropped()
    })
    this._ready = true
  }

  /** Start the supervisor: connects, and keeps reconnecting until stop(). */
  async start() {
    if (this._running) return
    await this.init()
    this._running = true
    const gen = ++this._gen
    this._setLink(LINK.SEARCHING)
    this._supervise(gen)
  }

  async stop() {
    this._running = false
    this._gen++
    this._wake?.()
    this._down?.resolve()
    this._failWaiters(new Error('stopped'))
    try { await this.api.disconnect() } catch { /* ignore */ }
    this._setLink(LINK.OFFLINE)
  }

  async dispose() {
    await this.stop()
    this._unlisten.forEach((u) => { try { u() } catch { /* ignore */ } })
    this._unlisten = []
    this._ready = false
    this.handlers = {}
  }

  _setLink(l) {
    if (this.link === l) return
    this.link = l
    this._emit('link', l)
  }

  _onDropped() {
    if (this.link === LINK.ONLINE) this._setLink(LINK.SEARCHING)
    this._failWaiters(new Error('link lost'))
    this._down?.resolve()
  }

  _onState(s) {
    if (!s) return
    this.state = s
    this._emit('state', s)
    this._pending = this._pending.filter((w) => {
      if (w.expected === s) { w.resolve(s); return false }
      return true
    })
  }

  _failWaiters(err) {
    const p = this._pending
    this._pending = []
    p.forEach((w) => w.reject(err))
  }

  _sleepInterruptible(ms) {
    return new Promise((res) => {
      const t = setTimeout(res, ms)
      this._wake = () => { clearTimeout(t); res() }
    })
  }

  async _supervise(gen) {
    let attempt = 0
    const alive = () => this._running && gen === this._gen
    while (alive()) {
      try {
        this._setLink(LINK.SEARCHING)
        await this.api.connect()
        if (!alive()) break

        let down, resolve
        down = new Promise((r) => { resolve = r })
        this._down = { promise: down, resolve }

        // Re-sync first: whatever the firmware is doing NOW is the truth.
        await this.syncState()
        this._setLink(LINK.ONLINE)
        attempt = 0

        // Heartbeat: re-read stateChar periodically. Catches missed notifications and
        // silent drops (OS never reported the disconnect) without waiting for a write to fail.
        const hb = setInterval(async () => {
          if (!alive() || this.link !== LINK.ONLINE) return
          try { await this.readState(); this._hbFails = 0 }
          catch {
            if (++this._hbFails >= 2) { this._hbFails = 0; this._onDropped() }
          }
        }, HEARTBEAT_MS)
        this._hbFails = 0
        try { await down } finally { clearInterval(hb) }   // block until the link drops
      } catch (e) {
        if (alive()) this._emit('error', e instanceof Error ? e : new Error(String(e)))
      }
      if (!alive()) break
      this._setLink(LINK.SEARCHING)
      const wait = this.backoffMs[Math.min(attempt++, this.backoffMs.length - 1)]
      await this._sleepInterruptible(wait)
    }
  }

  // ── state / commands ──────────────────────
  /** One read of stateChar. Returns GLASSES_STATE or null. */
  async readState() {
    const s = parseGlassesState(await this.api.readState())
    if (s) this._onState(s)
    return s
  }

  /** Read stateChar with a few retries (right after connect it may not be ready). */
  async syncState({ tries = 3, delayMs = 300 } = {}) {
    for (let i = 0; i < tries; i++) {
      try {
        const s = await this.readState()
        if (s) return s
      } catch (e) {
        if (i === tries - 1) throw e
      }
      await sleep(delayMs)
    }
    return null
  }

  /** Fire-and-forget write to cmdChar. Throws if the link is down. */
  async sendCommand(value) {
    if (this.link !== LINK.ONLINE) throw new Error('Glasses offline')
    if (!Object.values(CMD).includes(value)) throw new Error('Bad command ' + value)
    await this.api.writeCommand(value)
  }

  /**
   * Write `cmd` and wait until stateChar reports `expected`.
   * Retries the write if no confirmation arrives. Falls back to a plain read,
   * in case the notification was missed.
   */
  async goTo(cmd, expected, { timeoutMs = 4000, retries = 2 } = {}) {
    if (this.state === expected) return expected
    let lastErr
    for (let i = 0; i <= retries; i++) {
      try {
        const waiter = this._waitFor(expected, timeoutMs)
        await this.sendCommand(cmd)
        return await waiter.promise
      } catch (e) {
        lastErr = e
        if (this.link !== LINK.ONLINE) break
        try { if ((await this.readState()) === expected) return expected } catch { /* retry */ }
      }
    }
    throw lastErr || new Error('State change not confirmed')
  }

  _waitFor(expected, timeoutMs) {
    const w = { expected }
    w.promise = new Promise((resolve, reject) => {
      w.resolve = (v) => { clearTimeout(w.timer); resolve(v) }
      w.reject = (e) => { clearTimeout(w.timer); reject(e) }
      w.timer = setTimeout(() => {
        this._pending = this._pending.filter((x) => x !== w)
        reject(new Error('Timed out waiting for ' + expected))
      }, timeoutMs)
    })
    this._pending.push(w)
    return w
  }
}

export { GLASSES_STATE, CMD }
