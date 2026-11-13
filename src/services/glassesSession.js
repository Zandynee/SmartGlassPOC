// ─────────────────────────────────────────────
//  glassesSession.js  –  the "brain" that connects everything (no React)
//
//    GlassesBle (link, state sync, cmd writes)
//      └─▶ GlassesSession ──▶ glassesMachine reducer (UI state)
//             • records raw PPG (hrv.js) in BASELINE_CREATION and CHECK_MODE, cut into
//               non-overlapping 60 s windows (each analysed on its own)
//             • baseline = 6 windows (>=5 valid, medians); check = 3 windows (>=2 valid)
//             • samples IMU pitch for the upright baseline
//             • saves the baseline, then writes cmd 1 (WORK_MODE)
//             • a check starts when the USER asks (button, or "Mau cek sekarang?" after Timer_D) → cmd 2;
//               startCheck() works any time in WORK_MODE, cancelCheck() backs out any time
//             • CHECK_MODE: median RMSSD/SDNN vs baseline → decision.js
//             • never in check mode while offline (reducer) and never in check mode unasked:
//               if the firmware is in CHECK_MODE and no check was requested → cmd 1
//             • baseline wizard from the dashboard ("rebase"): per part choose NEW or the EXISTING
//               HRV / posture baseline; the glasses only go to CHECK_MODE for a new HRV recording
//               (the firmware only re-enters BASELINE_CREATION on boot)
//
//  Everything is plain JS so it runs (and is tested) in Node; the React side is
//  hooks/useGlassesSession.js (useSyncExternalStore).
// ─────────────────────────────────────────────

import { GlassesBle, LINK, createTauriApi } from './bleService.js'
import { CMD, GLASSES_STATE } from './bleConfig.js'
import { PpgRecorder } from './hrv.js'
import { PpgScopeBuffer } from './ppgScope.js'
import { buildBaseline, decideCheck, summarizeWindow, DECISION_DEFAULTS } from './decision.js'
import { loadBaseline, saveBaseline, clearBaseline, makeBaseline, isBaselineStale } from './baselineStore.js'
import {
  reducer, initialState, A, STEP, WIZ, WORK, WINDOW_MS, BASELINE_WINDOWS, CHECK_WINDOWS, selectScreen,
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
  windowMs: WINDOW_MS,                   // one analysis window
  baselineWindows: BASELINE_WINDOWS,     // 6
  checkWindows: CHECK_WINDOWS,           // 3
  decision: {},                          // overrides for decision.js: dropThr, minValidBaselineWindows, minValidCheckWindows
  hrvOpts: undefined,                    // overrides for analyzePpg (tests / tuning)
  postureMs: WIZ.POSTURE_MS,
  contactStableMs: WIZ.CONTACT_STABLE_MS,
  contactLossMs: WIZ.CONTACT_LOSS_MS,
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

    // decision parameters (handoff: every threshold is configurable, e.g. drop_thr = dropThr)
    this.params = {
      ...DECISION_DEFAULTS,
      baselineWindows: this.cfg.baselineWindows,
      checkWindows: this.cfg.checkWindows,
      ...this.cfg.decision,
    }
    this.scope = new PpgScopeBuffer(10)   // last 10 s of raw PPG for the live oscilloscope (components/PpgScope)
    this.hrvRec = new PpgRecorder({ maxSeconds: this.cfg.windowMs / 1000 * 1.5 })    // current baseline window
    this.checkRec = new PpgRecorder({ maxSeconds: this.cfg.windowMs / 1000 * 1.5 })  // current check window
    this._baseWins = []
    this._checkWins = []
    this._windowLost = false
    this._contactSince = null
    this._lostSince = null
    this._postureBuf = []
    this._postureT0 = null
    this._lastProgress = 0
    this._lastPpgPublish = 0
    this._sendingWork = false
    this._leaving = false
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
      if (next.fw === GLASSES_STATE.CHECK_MODE) { this._resetCheck(); this.scope.reset() }
      if (next.fw === GLASSES_STATE.BASELINE_CREATION) this._resetWizardBuffers()
    }
    // firmware sits in CHECK_MODE but nobody asked for it (reconnect after a drop, stale state) → back to work
    if (next.fw === GLASSES_STATE.CHECK_MODE && !next.checkWanted && !next.rebase) this._leaveCheck()
    // wizard reached a new HRV recording → the glasses must stream PPG (rebase only; boot is already BASELINE_CREATION)
    if (next.rebase && next.wiz.step === STEP.FINGER && prev.wiz.step !== STEP.FINGER &&
        next.fw !== GLASSES_STATE.CHECK_MODE && next.fw !== GLASSES_STATE.BASELINE_CREATION) this._enterMeasureMode()
    if (!prev.rebase && next.rebase) this._resetWizardBuffers()
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
    this._baseWins = []
    this._windowLost = false
    this._contactSince = null
    this._lostSince = null
    this._lastProgress = 0
  }
  _resetCheck() {
    this.checkRec.reset()
    this._checkWins = []
    this._lastProgress = 0
  }

  _onLink(l) {
    const s = this.state
    this.dispatch({ type: A.LINK_CHANGED, link: l })
    if (l !== LINK.ONLINE) {
      this.scope.reset()
      this._resetCheck()      // the reducer already dropped the check / refresh and fell back to WORK_MODE
      // A measurement with a hole in it is worthless, but nothing else is cleared.
      if (s.wiz.step === STEP.HRV && this._wizardRecording(s)) {
        this.dispatch({ type: A.WIZ_HRV_RESULT, result: { ok: false, reason: 'link_lost' } })
      } else if (s.wiz.step === STEP.POSTURE) {
        this.dispatch({ type: A.WIZ_POSTURE_RESULT, posture: null })
      }
    } else {
      this.actionError = null
    }
    this._maybeSendWork()
  }

  /** The wizard collects data while the firmware is in BASELINE_CREATION (boot) or, for the daily refresh, CHECK_MODE. */
  _wizardRecording(s) {
    return s.fw === GLASSES_STATE.BASELINE_CREATION ||
      (s.rebase && (s.fw === GLASSES_STATE.CHECK_MODE || s.fw === GLASSES_STATE.WORK_MODE))
  }

  // ── IMU: posture sampling in the wizard ───
  _onImu(p) {
    this.imu = p
    const s = this.state
    if (s.wiz.step === STEP.POSTURE && this._wizardRecording(s)) {
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

  // ── PPG: windowed HRV baseline + check ────
  _onPpg(p) {
    this.ppg = p
    this.scope.push(p.ir, hasContact(p))
    const s = this.state

    if (this._wizardRecording(s)) this._ppgBaseline(p, s)
    else if (s.fw === GLASSES_STATE.CHECK_MODE && s.checkWanted && !s.check.outcome) this._ppgCheck(p)

    // 100 Hz is too fast for React; publish ~4 Hz
    if (p.t - this._lastPpgPublish >= 250) { this._lastPpgPublish = p.t; this._publish() }
  }

  /** Close the current window of `rec`: analyse it and keep the small summary. */
  _closeWindow(rec, wins, lostReason = null) {
    let w
    if (lostReason) w = { ok: false, reason: lostReason, hrBpm: null, sdnn: null, rmssd: null }
    else {
      const res = rec.analyze(this.cfg.hrvOpts)
      if (import.meta.env?.DEV) { console.log(`window ${wins.length + 1}:`, res.ok ? 'ok' : res.reason, res.quality) }
      w = summarizeWindow(res)
    }
    wins.push(w)
    rec.reset()
    return w
  }

  _tooManyInvalid(wins, total, minValid) {
    return wins.filter((w) => !w.ok).length > total - minValid
  }

  _ppgBaseline(p, s) {
    const step = s.wiz.step
    const contact = hasContact(p)

    if (step === STEP.FINGER) {
      if (!contact) { this._contactSince = null; return }
      this._contactSince ??= p.t
      if (p.t - this._contactSince >= this.cfg.contactStableMs) {
        this.hrvRec.reset()
        this._baseWins = []
        this._windowLost = false
        this._lostSince = null
        this._lastProgress = 0
        this.dispatch({ type: A.WIZ_CONTACT, ok: true })
      }
      return
    }

    if (step !== STEP.HRV) return

    // Finger off for a while: the window in progress is lost (not stitched), the next one starts on return.
    if (contact) { this._lostSince = null; this._windowLost = false }
    else {
      this._lostSince ??= p.t
      if (p.t - this._lostSince >= this.cfg.contactLossMs && !this._windowLost) {
        this._windowLost = true
        this._closeWindow(this.hrvRec, this._baseWins, 'no_contact')
        if (this._finishBaselineIfDone()) return
        this._emitBaselineProgress(p)
      }
    }
    if (this._windowLost) return

    this.hrvRec.push(p.ir, p.t)
    if (this.hrvRec.elapsedMs >= this.cfg.windowMs) {
      this._closeWindow(this.hrvRec, this._baseWins)
      if (this._finishBaselineIfDone()) return
      this._lastProgress = 0
    }
    if (p.t - this._lastProgress >= this.cfg.progressEveryMs) this._emitBaselineProgress(p)
  }

  _emitBaselineProgress(p) {
    this._lastProgress = p.t
    const total = this.cfg.baselineWindows
    const progress = Math.min(1, (this._baseWins.length + Math.min(1, this.hrvRec.elapsedMs / this.cfg.windowMs)) / total)
    this.dispatch({ type: A.WIZ_HRV_PROGRESS, progress, windows: [...this._baseWins] })
  }

  _finishBaselineIfDone() {
    const total = this.cfg.baselineWindows
    const wins = this._baseWins
    if (wins.length < total && !this._tooManyInvalid(wins, total, this.params.minValidBaselineWindows)) return false
    const result = buildBaseline(wins, this.params)
    this.dispatch({ type: A.WIZ_HRV_RESULT, result })
    return true
  }

  _ppgCheck(p) {
    this.checkRec.push(p.ir, p.t)
    if (this.checkRec.elapsedMs >= this.cfg.windowMs) {
      this._closeWindow(this.checkRec, this._checkWins)
      const total = this.cfg.checkWindows
      if (this._checkWins.length >= total || this._tooManyInvalid(this._checkWins, total, this.params.minValidCheckWindows)) {
        const outcome = decideCheck(this.state.baseline, this._checkWins, this.params)
        this.dispatch({ type: A.CHECK_PROGRESS, progress: 1, windows: [...this._checkWins] })
        this.dispatch({ type: A.CHECK_RESULT, outcome })
        return
      }
      this._lastProgress = 0
    }
    if (p.t - this._lastProgress >= this.cfg.progressEveryMs) {
      this._lastProgress = p.t
      const total = this.cfg.checkWindows
      const progress = Math.min(1, (this._checkWins.length + Math.min(1, this.checkRec.elapsedMs / this.cfg.windowMs)) / total)
      this.dispatch({ type: A.CHECK_PROGRESS, progress, windows: [...this._checkWins] })
    }
  }

  // ── baseline persistence → WORK_MODE ──────
  _saveBaseline() {
    const { hrvResult, posture } = this.state.wiz
    try {
      const b = saveBaseline(makeBaseline(hrvResult, posture, { fitness: this.state.wiz.fitness, windowS: this.cfg.windowMs / 1000 }))
      this.dispatch({ type: A.BASELINE_SAVED, baseline: b })
    } catch (e) {
      this.dispatch({ type: A.BASELINE_SAVE_FAILED, error: e?.message || 'save_failed' })
    }
  }

  /** Baseline is stored but the glasses still sit in BASELINE_CREATION → tell them to start working. */
  _maybeSendWork() {
    const s = this.state
    if (this._sendingWork) return
    // refresh finished while the glasses never left WORK_MODE (both/posture-only reuse): nothing to send
    if (s.rebase && s.wiz.step === STEP.DONE && s.fw === GLASSES_STATE.WORK_MODE) { this.dispatch({ type: A.REBASE_END }); return }
    const waiting = s.fw === GLASSES_STATE.BASELINE_CREATION || (s.rebase && s.fw === GLASSES_STATE.CHECK_MODE)
    if (s.wiz.step !== STEP.DONE || !waiting || s.link !== LINK.ONLINE) return
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
    this.dispatch({ type: A.TICK, dtS, promptAfterS: this.cfg.promptAfterS, canPrompt: !isBaselineStale(this.state.baseline) && !this.state.rebase && !this.state.checkWanted })
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
  answerFitness(value) { this.dispatch({ type: A.WIZ_FITNESS, value }) }
  /** Wizard, only when a baseline exists: 'new' measures, 'existing' keeps the stored part. */
  chooseHrv(mode) { this.dispatch({ type: A.WIZ_CHOOSE_HRV, mode }) }
  choosePosture(mode) { this.dispatch({ type: A.WIZ_CHOOSE_POSTURE, mode }) }
  /** Shortcut: keep both parts of the stored baseline (re-confirmed for today). */
  useSavedBaseline() { this.dispatch({ type: A.WIZ_USE_SAVED }) }

  /**
   * Open the baseline wizard from the dashboard (any time). The glasses are only switched to
   * CHECK_MODE when the user reaches a new HRV recording (see _after → _enterMeasureMode).
   */
  startRebase() {
    if (this.state.rebase || this.state.checkWanted || this.state.sessionEnded) return false
    this.dispatch({ type: A.REBASE_START })
    return true
  }
  async _enterMeasureMode() {
    const ok = await this._run(() => this.ble.goTo(CMD.GO_CHECK_MODE, GLASSES_STATE.CHECK_MODE))
    if (!ok) this.dispatch({ type: A.REBASE_CANCEL })
  }
  /** Leave the wizard at any time; back to WORK_MODE if the glasses were switched to CHECK_MODE for it. */
  cancelRebase() {
    this.dispatch({ type: A.REBASE_CANCEL })
    if (this.state.fw === GLASSES_STATE.CHECK_MODE) this._leaveCheck()
  }

  resetBaseline() {
    clearBaseline()
    this.dispatch({ type: A.BASELINE_CLEARED })
  }

  /** "Mau cek sekarang?" → yes starts a check (same as the button). */
  async answerPrompt(yes) {
    this.dispatch({ type: A.PROMPT_ANSWER, yes, snoozeS: this.cfg.snoozeS })
    if (!yes) return true
    return this._beginCheck(() => this.dispatch({ type: A.PROMPT_RETRY }))
  }

  /** Check button: any time in WORK_MODE, no waiting for Timer_D. Needs a baseline and a live link. */
  async startCheck() {
    const s = this.state
    if (!s.baseline || s.rebase || s.checkWanted || s.sessionEnded) return false
    if (s.fw !== GLASSES_STATE.WORK_MODE || s.link !== LINK.ONLINE) {
      this.actionError = 'Kacamata belum terhubung.'
      this._publish()
      return false
    }
    return this._beginCheck()
  }

  async _beginCheck(onFail) {
    this.dispatch({ type: A.CHECK_WANTED })           // BEFORE the write, so the CHECK_MODE event is "wanted"
    const ok = await this._run(() => this.ble.goTo(CMD.GO_CHECK_MODE, GLASSES_STATE.CHECK_MODE))
    if (!ok) { this.dispatch({ type: A.CHECK_CANCEL, snoozeS: 0 }); onFail?.() }
    return ok
  }

  /** Back out of a check at any moment (measuring or result). Timer_D is kept. */
  async cancelCheck() {
    this.dispatch({ type: A.CHECK_CANCEL, snoozeS: this.cfg.snoozeS })
    if (this.state.fw === GLASSES_STATE.CHECK_MODE) await this._leaveCheck()
    return true
  }

  /** cmd 1 until the firmware confirms WORK_MODE (retried while the link is up and the firmware is still in CHECK_MODE). */
  async _leaveCheck() {
    if (this._leaving) return
    this._leaving = true
    try {
      const ok = await this._run(() => this.ble.goTo(CMD.GO_WORK_MODE, GLASSES_STATE.WORK_MODE))
      if (!ok) {
        clearTimeout(this._retryTimer)
        this._retryTimer = setTimeout(() => {
          const s = this.state
          if (s.fw === GLASSES_STATE.CHECK_MODE && !s.checkWanted && !s.rebase && s.link === LINK.ONLINE) this._leaveCheck()
        }, 2000)
      }
    } finally { this._leaving = false }
  }

  /** After a check: back to WORK_MODE (cmd 1). Timer_D restarts. */
  async continueWork() {
    const ok = await this._run(() => this.ble.goTo(CMD.GO_WORK_MODE, GLASSES_STATE.WORK_MODE))
    if (ok) this.dispatch({ type: A.CHECK_CONTINUE })
    return ok
  }

  /** Stop for the day: firmware → IDLE (cmd 3, sensors + haptic off). Only ends once confirmed. */
  async endSession() {
    const ok = await this._run(() => this.ble.goTo(CMD.GO_IDLE, GLASSES_STATE.IDLE))
    if (ok) this.dispatch({ type: A.END_SESSION })
    return ok
  }

  /** Resume after "session ended": firmware IDLE → WORK_MODE (cmd 1), confirmed before the UI resumes. */
  async startSession() {
    const ok = await this._run(() => this.ble.goTo(CMD.GO_WORK_MODE, GLASSES_STATE.WORK_MODE))
    if (ok) this.dispatch({ type: A.START_SESSION })
    return ok
  }

  /** Baseline save failed (storage error) → try again. */
  retrySave() { this._saveBaseline() }

  retryCheck() {
    this._resetCheck()
    this.dispatch({ type: A.CHECK_RETRY })
  }
}
