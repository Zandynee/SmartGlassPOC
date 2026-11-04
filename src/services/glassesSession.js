// ─────────────────────────────────────────────
//  glassesSession.js  –  the "brain" that connects everything (no React)
//
//    GlassesBle (link, state sync, cmd writes)
//      └─▶ GlassesSession ──▶ glassesMachine reducer (UI state)
//             • records raw PPG (hrv.js) in BASELINE_CREATION and CHECK_MODE
//             • samples IMU pitch for the upright baseline
//             • saves the baseline, then writes cmd 1 (WORK_MODE)
//             • Timer_D in WORK_MODE → "Check fatigue now?" → cmd 2
//             • CHECK_MODE: HRV vs baseline → fatigue outcome
//
//  Everything is plain JS so it runs (and is tested) in Node; the React side is
//  hooks/useGlassesSession.js (useSyncExternalStore).
// ─────────────────────────────────────────────

import { GlassesBle, LINK, createTauriApi } from './bleService.js'
import { CMD, GLASSES_STATE } from './bleConfig.js'
import { PpgRecorder, compareHrv } from './hrv.js'
import { loadBaseline, saveBaseline, clearBaseline, makeBaseline } from './baselineStore.js'
import {
  reducer, initialState, A, STEP, WIZ, WORK, CHECK_SECONDS, selectScreen,
} from './glassesMachine.js'

/** IR level that means "a finger is on the sensor" (MAX3010x: off ≈ <10 k, on ≈ >50 k). */
export const IR_CONTACT_MIN = 20000
const NEG_CONTACT = /NO_?(FINGER|CONTACT|TOUCH)|(^|_)(OFF|NONE|NOT|ABSENT|LOST|MISSING)(_|$)/i

/** Finger on sensor? IR level decides; the firmware's contact_status text can only veto. */
export function hasContact(p) {
  if (!p) return false
  if (p.contactStatus && NEG_CONTACT.test(p.contactStatus)) return false
  return p.ir >= IR_CONTACT_MIN
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length
const sdSample = (a) => {
  if (a.length < 2) return 0
  const m = mean(a)
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1))
}

const DEFAULT_CONFIG = {
  hrvMs: WIZ.HRV_MS,
  postureMs: WIZ.POSTURE_MS,
  contactStableMs: WIZ.CONTACT_STABLE_MS,
  contactLossMs: WIZ.CONTACT_LOSS_MS,
  checkMs: CHECK_SECONDS * 1000,
  promptAfterS: WORK.PROMPT_AFTER_S,
  snoozeS: WORK.SNOOZE_S,
  progressEveryMs: 400,
}

export class GlassesSession {
  /**
   * @param {object} [o]
   * @param {object} [o.api]     native api (default: Tauri) or a SimulatedGlasses
   * @param {object} [o.config]  overrides for DEFAULT_CONFIG (tests / debug)
   * @param {object} [o.ble]     ready-made GlassesBle (tests)
   */
  constructor({ api, config, ble } = {}) {
    this.cfg = { ...DEFAULT_CONFIG, ...(config || {}) }
    this.ble = ble || new GlassesBle(api || createTauriApi())
    this.state = initialState()
    this.imu = null
    this.tof = null
    this.ppg = null
    this.enabled = false
    this.actionError = null

    this.hrvRec = new PpgRecorder()
    this.checkRec = new PpgRecorder()
    this._contactSince = null
    this._lostSince = null
    this._postureBuf = []
    this._postureT0 = null
    this._lastProgress = 0
    this._lastPpgPublish = 0
    this._sendingWork = false
    this._retryTimer = null
    this._tickTimer = null
    this._lastTick = 0
    this._listeners = new Set()

    try { const b = loadBaseline(); if (b) this.state = reducer(this.state, { type: A.BASELINE_LOADED, baseline: b }) } catch { /* no storage */ }
    this._snap = this._makeSnap()

    this.ble.on('link', (l) => this._onLink(l))
    this.ble.on('state', (st) => this.dispatch({ type: A.GLASSES_STATE, state: st }))
    this.ble.on('imu', (p) => this._onImu(p))
    this.ble.on('tof', (p) => { this.tof = p; this._publish() })
    this.ble.on('ppg', (p) => this._onPpg(p))
    this.ble.on('error', (e) => { this.actionError = e?.message || String(e); this._publish() })
  }

  // ── store (useSyncExternalStore) ──────────
  subscribe = (fn) => { this._listeners.add(fn); return () => this._listeners.delete(fn) }
  getSnapshot = () => this._snap

  _makeSnap() {
    return {
      state: this.state,
      screen: selectScreen(this.state),
      imu: this.imu,
      tof: this.tof,
      ppg: this.ppg,
      enabled: this.enabled,
      error: this.actionError,
    }
  }
  _publish() {
    this._snap = this._makeSnap()
    this._listeners.forEach((fn) => fn())
  }

  dispatch(action) {
    const prev = this.state
    this.state = reducer(prev, action)
    if (this.state === prev) return
    this._after(prev, this.state)
    this._publish()
  }

  // ── lifecycle ─────────────────────────────
  async start() {
    if (this.enabled) return
    this.enabled = true
    this.actionError = null
    this._lastTick = Date.now()
    this._tickTimer = setInterval(() => this._tick(), 1000)
    this._publish()
    await this.ble.start()
  }

  async stop() {
    this.enabled = false
    clearInterval(this._tickTimer); this._tickTimer = null
    clearTimeout(this._retryTimer); this._retryTimer = null
    this._publish()
    await this.ble.stop()
  }

  // ── reactions to state changes ────────────
  _after(prev, next) {
    // entering a firmware state
    if (prev.fw !== next.fw) {
      if (next.fw === GLASSES_STATE.CHECK_MODE) this._resetCheck()
      if (next.fw === GLASSES_STATE.BASELINE_CREATION) this._resetWizardBuffers()
    }
    // entering posture sampling
    if (prev.wiz.step !== STEP.POSTURE && next.wiz.step === STEP.POSTURE) {
      this._postureBuf = []; this._postureT0 = null; this._lastProgress = 0
    }
    // leaving HRV recording back to FINGER → start clean
    if (prev.wiz.step !== STEP.FINGER && next.wiz.step === STEP.FINGER) this._resetWizardBuffers()
    // both parts ready → persist
    if (prev.wiz.step !== STEP.SAVING && next.wiz.step === STEP.SAVING) this._saveBaseline()
    this._maybeSendWork()
  }

  _resetWizardBuffers() {
    this.hrvRec.reset()
    this._contactSince = null
    this._lostSince = null
    this._lastProgress = 0
  }
  _resetCheck() {
    this.checkRec.reset()
    this._lastProgress = 0
  }

  _onLink(l) {
    const s = this.state
    this.dispatch({ type: A.LINK_CHANGED, link: l })
    if (l !== LINK.ONLINE) {
      // A measurement with a hole in it is worthless, but nothing else is cleared.
      if (s.wiz.step === STEP.HRV && s.fw === GLASSES_STATE.BASELINE_CREATION) {
        this.dispatch({ type: A.WIZ_HRV_RESULT, result: { ok: false, reason: 'link_lost' } })
      } else if (s.wiz.step === STEP.POSTURE) {
        this.dispatch({ type: A.WIZ_POSTURE_RESULT, posture: null })
      }
    } else {
      this.actionError = null
      // reconnected in the middle of a check → measure again from zero
      if (this.state.fw === GLASSES_STATE.CHECK_MODE && !this.state.check.outcome) this.retryCheck()
    }
    this._maybeSendWork()
  }

  // ── IMU: posture sampling in the wizard ───
  _onImu(p) {
    this.imu = p
    const s = this.state
    if (s.wiz.step === STEP.POSTURE && s.fw === GLASSES_STATE.BASELINE_CREATION) {
      if (this._postureT0 == null) this._postureT0 = p.t
      this._postureBuf.push(p.pitchDeg)
      const progress = Math.min(1, (p.t - this._postureT0) / this.cfg.postureMs)
      if (progress >= 1) {
        const buf = this._postureBuf
        this.dispatch({
          type: A.WIZ_POSTURE_RESULT,
          posture: { pitchDeg: mean(buf), sdDeg: sdSample(buf), samples: buf.length },
        })
      } else if (p.t - this._lastProgress >= this.cfg.progressEveryMs) {
        this._lastProgress = p.t
        this.dispatch({ type: A.WIZ_POSTURE_PROGRESS, progress, samples: this._postureBuf.length })
      }
    }
    this._publish()
  }

  // ── PPG: HRV baseline + fatigue check ─────
  _onPpg(p) {
    this.ppg = p
    const s = this.state

    if (s.fw === GLASSES_STATE.BASELINE_CREATION) this._ppgBaseline(p, s)
    else if (s.fw === GLASSES_STATE.CHECK_MODE && !s.check.outcome) this._ppgCheck(p)

    // 100 Hz is too fast for React; publish ~4 Hz
    if (p.t - this._lastPpgPublish >= 250) { this._lastPpgPublish = p.t; this._publish() }
  }

  _ppgBaseline(p, s) {
    const step = s.wiz.step
    const contact = hasContact(p)

    if (step === STEP.FINGER) {
      if (!contact) { this._contactSince = null; return }
      this._contactSince ??= p.t
      if (p.t - this._contactSince >= this.cfg.contactStableMs) {
        this.hrvRec.reset()
        this._lostSince = null
        this._lastProgress = 0
        this.dispatch({ type: A.WIZ_CONTACT, ok: true })
      }
      return
    }

    if (step !== STEP.HRV) return

    if (contact) this._lostSince = null
    else {
      this._lostSince ??= p.t
      if (p.t - this._lostSince >= this.cfg.contactLossMs) {
        this.dispatch({ type: A.WIZ_CONTACT, ok: false })   // → FINGER (buffers reset in _after)
        return
      }
    }

    this.hrvRec.push(p.ir, p.t)
    const progress = Math.min(1, this.hrvRec.elapsedMs / this.cfg.hrvMs)
    if (progress >= 1) {
      const res = this.hrvRec.analyze(this.cfg.hrvOpts)
      if (import.meta.env?.DEV) {
        console.table(res.quality); console.log('reason:', res.reason)
        window.__ppgDump = { ir: [...this.hrvRec.ir], ts: [...this.hrvRec.ts], res }
      }
      this.dispatch({ type: A.WIZ_HRV_RESULT, result: res })
    } else if (p.t - this._lastProgress >= this.cfg.progressEveryMs) {
      this._lastProgress = p.t
      this.dispatch({ type: A.WIZ_HRV_PROGRESS, progress })
    }
  }

  _ppgCheck(p) {
    this.checkRec.push(p.ir, p.t)
    const progress = Math.min(1, this.checkRec.elapsedMs / this.cfg.checkMs)
    if (progress < 1) {
      if (p.t - this._lastProgress >= this.cfg.progressEveryMs) {
        this._lastProgress = p.t
        this.dispatch({ type: A.CHECK_PROGRESS, progress })
      }
      return
    }
    const cur = this.checkRec.analyze()
    let outcome
    if (!cur.ok) outcome = { ok: false, reason: cur.reason }
    else {
      const cmp = compareHrv(this.state.baseline?.hrv, cur)
      outcome = { ok: true, fatigued: cmp.fatigued, cmp, current: cur }
    }
    this.dispatch({ type: A.CHECK_PROGRESS, progress: 1 })
    this.dispatch({ type: A.CHECK_RESULT, outcome })
  }

  // ── baseline persistence → WORK_MODE ──────
  _saveBaseline() {
    const { hrvResult, posture } = this.state.wiz
    try {
      const b = saveBaseline(makeBaseline(hrvResult, posture))
      this.dispatch({ type: A.BASELINE_SAVED, baseline: b })
    } catch (e) {
      this.dispatch({ type: A.BASELINE_SAVE_FAILED, error: e?.message || 'save_failed' })
    }
  }

  /** Baseline is stored but the glasses still sit in BASELINE_CREATION → tell them to start working. */
  _maybeSendWork() {
    const s = this.state
    if (this._sendingWork) return
    if (s.wiz.step !== STEP.DONE || s.fw !== GLASSES_STATE.BASELINE_CREATION || s.link !== LINK.ONLINE) return
    this._sendingWork = true
    this.ble.goTo(CMD.GO_WORK_MODE, GLASSES_STATE.WORK_MODE)
      .then(() => { this.actionError = null })
      .catch((e) => {
        this.actionError = e?.message || String(e)
        clearTimeout(this._retryTimer)
        this._retryTimer = setTimeout(() => this._maybeSendWork(), 2000)
      })
      .finally(() => { this._sendingWork = false; this._publish() })
  }

  // ── Timer_D ───────────────────────────────
  _tick() {
    const now = Date.now()
    const dtS = Math.min(5, (now - this._lastTick) / 1000)   // a sleeping PC must not count
    this._lastTick = now
    this.dispatch({ type: A.TICK, dtS, promptAfterS: this.cfg.promptAfterS })
  }

  // ── actions for the UI ────────────────────
  async _run(fn) {
    try { this.actionError = null; await fn(); return true }
    catch (e) { this.actionError = e?.message || String(e); return false }
    finally { this._publish() }
  }

  retryHrv() { this.dispatch({ type: A.WIZ_RETRY_HRV }) }
  readyPosture() { this.dispatch({ type: A.WIZ_READY_POSTURE }) }
  retryPosture() { this.dispatch({ type: A.WIZ_RETRY_POSTURE }) }
  restartWizard() { this.dispatch({ type: A.WIZ_RESTART }) }
  useSavedBaseline() { this.dispatch({ type: A.WIZ_USE_SAVED }) }

  resetBaseline() {
    clearBaseline()
    this.dispatch({ type: A.BASELINE_CLEARED })
  }

  /** "Check fatigue now?" → yes writes cmd 2 and waits for CHECK_MODE. */
  async answerPrompt(yes) {
    this.dispatch({ type: A.PROMPT_ANSWER, yes, snoozeS: this.cfg.snoozeS })
    if (!yes) return true
    const ok = await this._run(() => this.ble.goTo(CMD.GO_CHECK_MODE, GLASSES_STATE.CHECK_MODE))
    if (!ok) this.dispatch({ type: A.PROMPT_RETRY })
    return ok
  }

  /** After a check: back to WORK_MODE (cmd 1). Timer_D restarts. */
  async continueWork() {
    const ok = await this._run(() => this.ble.goTo(CMD.GO_WORK_MODE, GLASSES_STATE.WORK_MODE))
    if (ok) this.dispatch({ type: A.CHECK_CONTINUE })
    return ok
  }

  /** After a check: stop for the day. PPG is powered down (cmd 1), Timer_D stops. */
  async endSession() {
    await this._run(() => this.ble.goTo(CMD.GO_WORK_MODE, GLASSES_STATE.WORK_MODE))
    this.dispatch({ type: A.END_SESSION })
  }

  startSession() { this.dispatch({ type: A.START_SESSION }) }

  /** Baseline save failed (storage error) → try again. */
  retrySave() { this._saveBaseline() }

  retryCheck() {
    this._resetCheck()
    this.dispatch({ type: A.CHECK_RETRY })
  }
}
