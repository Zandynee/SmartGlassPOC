// ─────────────────────────────────────────────
//  glassesMachine.js  –  Tier-3 state machine (pure reducer + selectors)
//
//  The FIRMWARE owns the real state (BASELINE_CREATION / WORK_MODE / CHECK_MODE).
//  This reducer only mirrors it (`fw`) and holds what the app itself accumulates:
//    • baseline wizard progress (fitness question, 6 × 60 s HRV windows at rest, upright posture)
//    • Timer_D (continuous working time) and the "Mau cek sekarang?" prompt
//    • CHECK_MODE progress (3 × 60 s windows) + decision (see decision.js)
//
//  Disconnect rule: the app is NEVER in check mode while offline. LINK_CHANGED(offline)
//  drops a check in progress and a baseline refresh ("rebase") at once and falls back to
//  WORK_MODE (or the baseline wizard when there is no baseline). The Timer_D, baseline and
//  history are kept. On reconnect the service reads stateChar; if the firmware is still in
//  CHECK_MODE and the user did not ask for it (`checkWanted`), the session sends cmd 1.
//  A check only shows its screen while `checkWanted` is true: the user starts it with a
//  button or the Timer_D prompt, and can back out at any moment.
//
//  No side effects here; hooks/useGlassesSession (next batch) feeds actions in
//  and performs the BLE writes.
// ─────────────────────────────────────────────

import { GLASSES_STATE } from './bleConfig.js'
import { LINK } from './bleService.js'

// ── tunables ────────────────────────────────
export const DEBUG_FAST_TIMERS = false     // Timer_D prompt after 2 min instead of 20
export const DEBUG_SHORT_MEASURE = false   // 15 s windows instead of 60 s

export const WINDOW_MS = DEBUG_SHORT_MEASURE ? 15_000 : 60_000   // one analysis window
export const BASELINE_WINDOWS = 6                                  // baseline = 6 windows (6 min)
export const CHECK_WINDOWS = 3                                     // check    = 3 windows (3 min)

export const WIZ = Object.freeze({
  CONTACT_STABLE_MS: 3000,     // finger must stay on this long before recording starts
  CONTACT_LOSS_MS: 2000,       // finger off this long → current window is lost
  POSTURE_MS: 5000,            // upright posture sampling
  POSTURE_MAX_SD_DEG: 3,       // reject if the user moved too much
  POSTURE_MIN_SAMPLES: 10,
})


export const WORK = Object.freeze({
  // Timer_D threshold before asking "Check fatigue now?"
  PROMPT_AFTER_S: DEBUG_FAST_TIMERS ? 120 : 20 * 60,
  // after "Not now", ask again later
  SNOOZE_S: DEBUG_FAST_TIMERS ? 60 : 5 * 60,
})

// Wizard steps
export const STEP = Object.freeze({
  FITNESS: 'FITNESS',         // 1–5 "how fit do you feel today?" (asked before the baseline)
  CHOOSE_HRV: 'CHOOSE_HRV',   // only when a baseline exists: make a new HRV baseline or use the existing one
  FINGER: 'FINGER',           // glasses off, finger on sensor (waiting for contact)
  HRV: 'HRV',                 // recording resting PPG: 6 × 60 s windows
  HRV_DONE: 'HRV_DONE',       // HRV computed; ask to put glasses on
  CHOOSE_POSTURE: 'CHOOSE_POSTURE', // only when a baseline exists: new posture reference or the existing one
  WEAR: 'WEAR',               // wear glasses, sit straight → press start
  POSTURE: 'POSTURE',         // sampling pitch
  SAVING: 'SAVING',           // both parts ready; orchestrator saves + sends cmd 1
  DONE: 'DONE',
})

// ── actions ─────────────────────────────────
export const A = Object.freeze({
  LINK_CHANGED: 'LINK_CHANGED',
  GLASSES_STATE: 'GLASSES_STATE',
  BASELINE_LOADED: 'BASELINE_LOADED',
  BASELINE_CLEARED: 'BASELINE_CLEARED',

  WIZ_FITNESS: 'WIZ_FITNESS',                 // { value 1..5 }
  WIZ_CHOOSE_HRV: 'WIZ_CHOOSE_HRV',           // { mode: 'new' | 'existing' }
  WIZ_CHOOSE_POSTURE: 'WIZ_CHOOSE_POSTURE',   // { mode: 'new' | 'existing' }
  REBASE_END: 'REBASE_END',                   // wizard finished while the glasses are already in WORK_MODE
  REBASE_CANCEL: 'REBASE_CANCEL',
  REBASE_START: 'REBASE_START',               // daily refresh while the glasses are NOT in BASELINE_CREATION
  WIZ_CONTACT: 'WIZ_CONTACT',                 // { ok:boolean }  (debounced by the hook)
  WIZ_HRV_PROGRESS: 'WIZ_HRV_PROGRESS',       // { progress 0..1, windows:[…] }
  WIZ_HRV_RESULT: 'WIZ_HRV_RESULT',           // { result }  (decision.buildBaseline output)
  WIZ_RETRY_HRV: 'WIZ_RETRY_HRV',
  WIZ_USE_SAVED: 'WIZ_USE_SAVED',             // keep the stored baseline, skip the wizard
  WIZ_READY_POSTURE: 'WIZ_READY_POSTURE',     // user: "glasses on, sitting straight"
  WIZ_POSTURE_PROGRESS: 'WIZ_POSTURE_PROGRESS', // { progress 0..1, samples }
  WIZ_POSTURE_RESULT: 'WIZ_POSTURE_RESULT',   // { posture:{pitchDeg,sdDeg,samples} }
  WIZ_RETRY_POSTURE: 'WIZ_RETRY_POSTURE',
  WIZ_RESTART: 'WIZ_RESTART',
  BASELINE_SAVED: 'BASELINE_SAVED',           // { baseline }
  BASELINE_SAVE_FAILED: 'BASELINE_SAVE_FAILED', // { error }

  TICK: 'TICK',                               // { dtS, working }  once per second in WORK_MODE
  PROMPT_ANSWER: 'PROMPT_ANSWER',             // { yes:boolean, snoozeS? }
  PROMPT_RETRY: 'PROMPT_RETRY',               // re-open the prompt (the cmd write failed)
  CHECK_WANTED: 'CHECK_WANTED',               // user asked for a check (button or prompt); the hook then writes cmd 2
  CHECK_CANCEL: 'CHECK_CANCEL',               // user backed out / cmd failed: no check, Timer_D kept (+ snooze)
  CHECK_PROGRESS: 'CHECK_PROGRESS',           // { progress 0..1, windows:[…] }
  CHECK_RESULT: 'CHECK_RESULT',               // { outcome }  (decision.decideCheck output)
  CHECK_RETRY: 'CHECK_RETRY',
  CHECK_CONTINUE: 'CHECK_CONTINUE',
  END_SESSION: 'END_SESSION',
  START_SESSION: 'START_SESSION',
})

// ── state ───────────────────────────────────
const freshWiz = (step = STEP.FITNESS, fitness = null) => ({
  step,
  fitness,               // 1..5
  hrvProgress: 0,
  hrvWindows: [],        // finished 60 s windows [{ ok, reason, hrBpm, sdnn, rmssd }]
  reuse: { hrv: false, posture: false },   // true = taken from the stored baseline instead of measured now
  hrvResult: null,       // decision.buildBaseline output (ok === true), or the stored one when reuse.hrv
  hrvError: null,        // 'baseline_invalid' | 'link_lost'  (details in hrvCause)
  hrvCause: null,        // most common window failure: 'no_signal' | 'too_few_beats' | 'too_noisy' | 'data_loss' | 'no_contact' …
  postureProgress: 0,
  postureSamples: 0,
  posture: null,
  postureError: null,    // 'moved' | 'too_few'
  saveError: null,
})

const freshWork = () => ({ timerS: 0, prompt: false, snoozeS: 0 })
const freshCheck = () => ({ progress: 0, windows: [], outcome: null })

export function initialState() {
  return {
    link: LINK.OFFLINE,
    fw: null,                 // last known firmware state
    everSynced: false,
    baseline: null,
    rebase: false,            // baseline wizard opened from the dashboard (fw WORK_MODE → CHECK_MODE only for a new HRV recording)
    checkWanted: false,       // the user started a check (or a refresh) and has not left it
    wiz: freshWiz(),
    work: freshWork(),
    check: freshCheck(),
    sessionEnded: false,
  }
}

// ── reducer ─────────────────────────────────
export function reducer(s, a) {
  switch (a.type) {
    // ----- link / firmware sync (never wipes accumulated data) -----
    case A.LINK_CHANGED: {
      if (s.link === a.link) return s
      const next = { ...s, link: a.link }
      if (a.link !== LINK.ONLINE) {
        // never "in check mode" while offline: back to work mode (or the baseline wizard)
        if (s.fw === GLASSES_STATE.CHECK_MODE) next.fw = GLASSES_STATE.WORK_MODE
        next.checkWanted = false
        next.check = freshCheck()
        if (s.rebase) {
          next.rebase = false
          next.wiz = s.baseline ? { ...freshWiz(), step: STEP.DONE } : freshWiz()
        }
      }
      return next
    }

    case A.GLASSES_STATE: {
      if (!a.state || a.state === s.fw) return { ...s, everSynced: true }
      const next = { ...s, fw: a.state, everSynced: true }
      // Firmware (re)entered a state: reset only what belongs to that state's fresh run.
      if (a.state === GLASSES_STATE.BASELINE_CREATION && s.wiz.step === STEP.DONE) next.wiz = freshWiz()
      if (s.rebase) {
        const needsPpg = s.wiz.step === STEP.FINGER || s.wiz.step === STEP.HRV
        if (a.state === GLASSES_STATE.WORK_MODE && s.wiz.step === STEP.DONE) next.rebase = false   // normal end: baseline saved
        else if (a.state === GLASSES_STATE.IDLE || a.state === GLASSES_STATE.BASELINE_CREATION ||
                 (a.state === GLASSES_STATE.WORK_MODE && needsPpg)) {
          // firmware left CHECK_MODE while the HRV recording needs PPG (watchdog, IDLE, reboot) → abort
          next.rebase = false
          next.wiz = s.baseline ? { ...freshWiz(), step: STEP.DONE } : freshWiz()
        }
      }
      if (a.state === GLASSES_STATE.CHECK_MODE) next.check = freshCheck()
      if (a.state !== GLASSES_STATE.CHECK_MODE) next.checkWanted = false
      next.sessionEnded = false          // any non-IDLE state means the session is live
      // IDLE is the firmware's own record that the session ended (survives app restarts / reconnects)
      if (a.state === GLASSES_STATE.IDLE) { next.sessionEnded = true; next.work = freshWork(); next.check = freshCheck() }
      return next
    }

    case A.BASELINE_LOADED:
      return { ...s, baseline: a.baseline }

    case A.BASELINE_CLEARED:
      return { ...s, baseline: null, wiz: freshWiz(), work: freshWork() }

    // ----- wizard: HRV part -----
    case A.WIZ_FITNESS:
      if (s.wiz.step !== STEP.FITNESS || !(a.value >= 1 && a.value <= 5)) return s
      return { ...s, wiz: { ...s.wiz, step: s.baseline ? STEP.CHOOSE_HRV : STEP.FINGER, fitness: Math.round(a.value) } }

    case A.WIZ_CHOOSE_HRV: {
      if (s.wiz.step !== STEP.CHOOSE_HRV || !s.baseline) return s
      if (a.mode === 'new') return { ...s, wiz: { ...s.wiz, step: STEP.FINGER, reuse: { ...s.wiz.reuse, hrv: false } } }
      const h = s.baseline.hrv
      const hrvResult = {
        ok: true, reused: true, windows: [],
        rmssd: h.rmssd, sdnn: h.sdnn, hrBpm: h.hrBpm,
        validWindows: h.validWindows, totalWindows: h.totalWindows,
        measuredAt: h.measuredAt ?? s.baseline.createdAt,
      }
      return { ...s, wiz: { ...s.wiz, step: STEP.CHOOSE_POSTURE, hrvResult, hrvWindows: [], reuse: { ...s.wiz.reuse, hrv: true } } }
    }

    case A.WIZ_CHOOSE_POSTURE: {
      if (s.wiz.step !== STEP.CHOOSE_POSTURE || !s.baseline) return s
      if (a.mode === 'new') return { ...s, wiz: { ...s.wiz, step: STEP.WEAR, reuse: { ...s.wiz.reuse, posture: false } } }
      const p = s.baseline.posture
      const posture = { ...p, measuredAt: p.measuredAt ?? s.baseline.createdAt }
      return { ...s, wiz: { ...s.wiz, step: STEP.SAVING, posture, postureError: null, saveError: null, reuse: { ...s.wiz.reuse, posture: true } } }
    }

    case A.REBASE_START:
      return { ...s, rebase: true, checkWanted: false, wiz: freshWiz(), work: { ...s.work, prompt: false } }

    case A.REBASE_END:
      return s.rebase ? { ...s, rebase: false } : s

    case A.REBASE_CANCEL:
      return s.rebase ? { ...s, rebase: false, wiz: s.baseline ? { ...freshWiz(), step: STEP.DONE } : freshWiz() } : s

    case A.WIZ_CONTACT: {
      const w = s.wiz
      if (a.ok && w.step === STEP.FINGER) return { ...s, wiz: { ...w, step: STEP.HRV, hrvProgress: 0, hrvWindows: [], hrvError: null, hrvCause: null } }
      return s
    }

    case A.WIZ_HRV_PROGRESS:
      return s.wiz.step === STEP.HRV
        ? { ...s, wiz: { ...s.wiz, hrvProgress: a.progress, hrvWindows: a.windows ?? s.wiz.hrvWindows } }
        : s

    case A.WIZ_HRV_RESULT: {
      if (s.wiz.step !== STEP.HRV) return s
      const r = a.result
      if (!r || !r.ok) {
        return { ...s, wiz: { ...s.wiz, step: STEP.FINGER, hrvProgress: 0, hrvResult: null, hrvWindows: r?.windows ?? [], hrvError: r?.reason || 'baseline_invalid', hrvCause: r?.cause ?? null } }
      }
      return { ...s, wiz: { ...s.wiz, step: STEP.HRV_DONE, hrvResult: r, hrvWindows: r.windows ?? [], hrvError: null, hrvCause: null, hrvProgress: 1 } }
    }

    case A.WIZ_RETRY_HRV:      // keeps today's fitness answer
      return { ...s, wiz: freshWiz(STEP.FINGER, s.wiz.fitness) }

    case A.WIZ_USE_SAVED: {       // shortcut: keep both parts of the stored baseline
      if (!s.baseline) return s
      const h = s.baseline.hrv, p = s.baseline.posture
      return {
        ...s,
        wiz: {
          ...s.wiz, step: STEP.SAVING, saveError: null, postureError: null,
          reuse: { hrv: true, posture: true },
          hrvResult: { ok: true, reused: true, windows: [], rmssd: h.rmssd, sdnn: h.sdnn, hrBpm: h.hrBpm, validWindows: h.validWindows, totalWindows: h.totalWindows, measuredAt: h.measuredAt ?? s.baseline.createdAt },
          posture: { ...p, measuredAt: p.measuredAt ?? s.baseline.createdAt },
        },
      }
    }

    // ----- wizard: posture part -----
    case A.WIZ_READY_POSTURE: {
      const w = s.wiz
      if (w.step === STEP.HRV_DONE) return { ...s, wiz: { ...w, step: s.baseline ? STEP.CHOOSE_POSTURE : STEP.WEAR } }
      if (w.step === STEP.WEAR) return { ...s, wiz: { ...w, step: STEP.POSTURE, postureProgress: 0, postureSamples: 0, postureError: null } }
      return s
    }

    case A.WIZ_POSTURE_PROGRESS:
      return s.wiz.step === STEP.POSTURE
        ? { ...s, wiz: { ...s.wiz, postureProgress: a.progress, postureSamples: a.samples } }
        : s

    case A.WIZ_POSTURE_RESULT: {
      if (s.wiz.step !== STEP.POSTURE) return s
      const p = a.posture
      let err = null
      if (!p || p.samples < WIZ.POSTURE_MIN_SAMPLES) err = 'too_few'
      else if (p.sdDeg > WIZ.POSTURE_MAX_SD_DEG) err = 'moved'
      if (err) return { ...s, wiz: { ...s.wiz, step: STEP.WEAR, posture: null, postureError: err } }
      return { ...s, wiz: { ...s.wiz, step: STEP.SAVING, posture: p, postureError: null, saveError: null } }
    }

    case A.WIZ_RETRY_POSTURE:
      return { ...s, wiz: { ...s.wiz, step: STEP.WEAR, posture: null, postureError: null } }

    case A.WIZ_RESTART:
      return { ...s, wiz: freshWiz() }

    case A.BASELINE_SAVED:
      return { ...s, baseline: a.baseline, wiz: { ...s.wiz, step: STEP.DONE, saveError: null }, work: freshWork() }

    case A.BASELINE_SAVE_FAILED:
      return { ...s, wiz: { ...s.wiz, saveError: a.error || 'save_failed' } }

    // ----- WORK_MODE: Timer_D -----
    case A.TICK: {
      if (s.fw !== GLASSES_STATE.WORK_MODE || s.sessionEnded) return s
      let { timerS, prompt, snoozeS } = s.work
      timerS += a.dtS        // keeps counting while offline: a dropped link never clears Timer_D
      if (snoozeS > 0) snoozeS = Math.max(0, snoozeS - a.dtS)
      // no prompt while today's baseline is missing (a.canPrompt === false): the dashboard asks for it instead
      if (!prompt && snoozeS === 0 && a.canPrompt !== false && timerS >= (a.promptAfterS ?? WORK.PROMPT_AFTER_S)) prompt = true
      return { ...s, work: { timerS, prompt, snoozeS } }
    }

    case A.PROMPT_ANSWER:
      if (!s.work.prompt) return s
      return a.yes
        ? { ...s, work: { ...s.work, prompt: false } }        // hook then writes cmd 2
        : { ...s, work: { ...s.work, prompt: false, snoozeS: a.snoozeS ?? WORK.SNOOZE_S } }

    case A.PROMPT_RETRY:
      return { ...s, work: { ...s.work, prompt: true } }

    case A.CHECK_WANTED:
      return { ...s, checkWanted: true, check: freshCheck(), work: { ...s.work, prompt: false } }

    case A.CHECK_CANCEL:
      // back out: no result, Timer_D keeps running, the prompt waits one snooze period
      return { ...s, checkWanted: false, check: freshCheck(), work: { ...s.work, prompt: false, snoozeS: a.snoozeS ?? WORK.SNOOZE_S } }

    // ----- CHECK_MODE -----
    case A.CHECK_PROGRESS:
      return s.fw === GLASSES_STATE.CHECK_MODE
        ? { ...s, check: { ...s.check, progress: a.progress, windows: a.windows ?? s.check.windows } }
        : s

    case A.CHECK_RESULT:
      return { ...s, check: { ...s.check, outcome: a.outcome } }

    case A.CHECK_RETRY:
      return { ...s, check: freshCheck() }

    case A.CHECK_CONTINUE:
      // Back to work: Timer_D restarts (the user is rested or has been warned)
      return { ...s, work: freshWork(), check: freshCheck(), checkWanted: false }

    case A.END_SESSION:
      return { ...s, work: freshWork(), check: freshCheck(), checkWanted: false, sessionEnded: true }

    case A.START_SESSION:
      // dispatched only after the firmware confirmed WORK_MODE
      return { ...s, sessionEnded: false, work: freshWork() }

    default:
      return s
  }
}

// ── selectors ───────────────────────────────
export const isOffline = (s) => s.link !== LINK.ONLINE
export const hasBaseline = (s) => !!s.baseline

/** Which top-level screen to render. */
export function selectScreen(s) {
  if (s.rebase) return 'BASELINE'
  if (!s.baseline || s.fw === GLASSES_STATE.BASELINE_CREATION) return 'BASELINE'
  if (s.fw === GLASSES_STATE.CHECK_MODE && s.checkWanted && s.link === LINK.ONLINE) return 'CHECK'
  if (s.fw === GLASSES_STATE.WORK_MODE) return 'DASHBOARD'
  if (s.fw === GLASSES_STATE.IDLE) return 'DASHBOARD'   // shell + "session ended" banner
  // fw unknown (never synced yet) but we have a baseline → dashboard shell, offline banner explains
  return 'DASHBOARD'
}

/** Dashboard is locked until a baseline exists and the firmware left BASELINE_CREATION. */
export const isDashboardLocked = (s) => selectScreen(s) === 'BASELINE'

/** 0..1 progress of the current wizard step (for progress rings). */
export function selectWizProgress(s) {
  const w = s.wiz
  if (w.step === STEP.HRV) return Math.min(1, w.hrvProgress)
  if (w.step === STEP.POSTURE) return Math.min(1, w.postureProgress)
  return 0
}

/** Overall wizard position: 1 = HRV part (incl. the fitness question), 2 = posture part. */
export function selectWizPart(s) {
  return [STEP.FITNESS, STEP.CHOOSE_HRV, STEP.FINGER, STEP.HRV, STEP.HRV_DONE].includes(s.wiz.step) ? 1 : 2
}

/**
 * True when there is no baseline but the firmware is already past BASELINE_CREATION
 * (it only re-enters that state after a reboot, and the app cannot force it).
 */
export const selectWizBlocked = (s) =>
  !s.baseline && !!s.fw && s.fw !== GLASSES_STATE.BASELINE_CREATION
