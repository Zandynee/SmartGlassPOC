// ─────────────────────────────────────────────
//  glassesMachine.js  –  Tier-3 state machine (pure reducer + selectors)
//
//  The FIRMWARE owns the real state (BASELINE_CREATION / WORK_MODE / CHECK_MODE).
//  This reducer only mirrors it (`fw`) and holds what the app itself accumulates:
//    • baseline wizard progress (HRV at rest, then upright posture)
//    • Timer_D (continuous working time) and the "Check fatigue now?" prompt
//    • CHECK_MODE progress + result
//
//  Disconnect rule: LINK_CHANGED never clears anything. While offline the UI
//  shows the "Offline Mode / Searching for Glasses" banner, everything
//  accumulated is kept, and on reconnect the service reads stateChar and
//  dispatches GLASSES_STATE → the UI snaps to whatever the firmware is doing.
//
//  No side effects here; hooks/useGlassesSession (next batch) feeds actions in
//  and performs the BLE writes.
// ─────────────────────────────────────────────

import { GLASSES_STATE } from './bleConfig.js'
import { LINK } from './bleService.js'

// ── tunables ────────────────────────────────
export const DEBUG_FAST_TIMERS = false     // Timer_D prompt after 2 min instead of 20
export const DEBUG_SHORT_MEASURE = false   // HRV / check windows of 45 s instead of 120 s

export const WIZ = Object.freeze({
  CONTACT_STABLE_MS: 3000,     // finger must stay on this long before recording starts
  CONTACT_LOSS_MS: 2000,       // finger off this long → restart HRV step
  HRV_MS: DEBUG_SHORT_MEASURE ? 45_000 : 120_000,   // resting HRV recording length
  POSTURE_MS: 5000,            // upright posture sampling
  POSTURE_MAX_SD_DEG: 3,       // reject if the user moved too much
  POSTURE_MIN_SAMPLES: 10,
})

export const CHECK_SECONDS = DEBUG_SHORT_MEASURE ? 45 : 120

export const WORK = Object.freeze({
  // Timer_D threshold before asking "Check fatigue now?"
  PROMPT_AFTER_S: DEBUG_FAST_TIMERS ? 120 : 20 * 60,
  // after "Not now", ask again later
  SNOOZE_S: DEBUG_FAST_TIMERS ? 60 : 5 * 60,
})

// Wizard steps
export const STEP = Object.freeze({
  FINGER: 'FINGER',           // glasses off, finger on sensor (waiting for contact)
  HRV: 'HRV',                 // recording resting PPG
  HRV_DONE: 'HRV_DONE',       // HRV computed; ask to put glasses on
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

  WIZ_CONTACT: 'WIZ_CONTACT',                 // { ok:boolean }  (debounced by the hook)
  WIZ_HRV_PROGRESS: 'WIZ_HRV_PROGRESS',       // { progress 0..1 }
  WIZ_HRV_RESULT: 'WIZ_HRV_RESULT',           // { result }  (analyzePpg output)
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
  CHECK_PROGRESS: 'CHECK_PROGRESS',           // { progress 0..1 }
  CHECK_RESULT: 'CHECK_RESULT',               // { outcome }  {ok,fatigued,reason,…}
  CHECK_RETRY: 'CHECK_RETRY',
  CHECK_CONTINUE: 'CHECK_CONTINUE',
  END_SESSION: 'END_SESSION',
  START_SESSION: 'START_SESSION',
})

// ── state ───────────────────────────────────
const freshWiz = () => ({
  step: STEP.FINGER,
  hrvProgress: 0,
  hrvResult: null,
  hrvError: null,        // 'too_short' | 'no_signal' | 'too_few_beats' | 'too_noisy' | 'data_loss' | 'link_lost'
  postureProgress: 0,
  postureSamples: 0,
  posture: null,
  postureError: null,    // 'moved' | 'too_few'
  saveError: null,
})

const freshWork = () => ({ timerS: 0, prompt: false, snoozeS: 0 })
const freshCheck = () => ({ progress: 0, outcome: null })

export function initialState() {
  return {
    link: LINK.OFFLINE,
    fw: null,                 // last known firmware state
    everSynced: false,
    baseline: null,
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
    case A.LINK_CHANGED:
      return s.link === a.link ? s : { ...s, link: a.link }

    case A.GLASSES_STATE: {
      if (!a.state || a.state === s.fw) return { ...s, everSynced: true }
      const next = { ...s, fw: a.state, everSynced: true }
      // Firmware (re)entered a state: reset only what belongs to that state's fresh run.
      if (a.state === GLASSES_STATE.BASELINE_CREATION && s.wiz.step === STEP.DONE) next.wiz = freshWiz()
      if (a.state === GLASSES_STATE.CHECK_MODE) next.check = freshCheck()
      if (a.state === GLASSES_STATE.WORK_MODE) next.sessionEnded = false
      return next
    }

    case A.BASELINE_LOADED:
      return { ...s, baseline: a.baseline }

    case A.BASELINE_CLEARED:
      return { ...s, baseline: null, wiz: freshWiz(), work: freshWork() }

    // ----- wizard: HRV part -----
    case A.WIZ_CONTACT: {
      const w = s.wiz
      if (a.ok && w.step === STEP.FINGER) return { ...s, wiz: { ...w, step: STEP.HRV, hrvProgress: 0, hrvError: null } }
      if (!a.ok && w.step === STEP.HRV) return { ...s, wiz: { ...w, step: STEP.FINGER, hrvProgress: 0 } }
      return s
    }

    case A.WIZ_HRV_PROGRESS:
      return s.wiz.step === STEP.HRV ? { ...s, wiz: { ...s.wiz, hrvProgress: a.progress } } : s

    case A.WIZ_HRV_RESULT: {
      if (s.wiz.step !== STEP.HRV) return s
      const r = a.result
      if (!r || !r.ok) {
        return { ...s, wiz: { ...s.wiz, step: STEP.FINGER, hrvProgress: 0, hrvResult: null, hrvError: r?.reason || 'no_signal' } }
      }
      return { ...s, wiz: { ...s.wiz, step: STEP.HRV_DONE, hrvResult: r, hrvError: null, hrvProgress: 1 } }
    }

    case A.WIZ_RETRY_HRV:
      return { ...s, wiz: { ...freshWiz() } }

    case A.WIZ_USE_SAVED:
      return s.baseline ? { ...s, wiz: { ...s.wiz, step: STEP.DONE, saveError: null }, work: freshWork() } : s

    // ----- wizard: posture part -----
    case A.WIZ_READY_POSTURE: {
      const w = s.wiz
      if (w.step === STEP.HRV_DONE) return { ...s, wiz: { ...w, step: STEP.WEAR } }
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
      if (!prompt && snoozeS === 0 && timerS >= (a.promptAfterS ?? WORK.PROMPT_AFTER_S)) prompt = true
      return { ...s, work: { timerS, prompt, snoozeS } }
    }

    case A.PROMPT_ANSWER:
      if (!s.work.prompt) return s
      return a.yes
        ? { ...s, work: { ...s.work, prompt: false } }        // hook then writes cmd 2
        : { ...s, work: { ...s.work, prompt: false, snoozeS: a.snoozeS ?? WORK.SNOOZE_S } }

    case A.PROMPT_RETRY:
      return { ...s, work: { ...s.work, prompt: true } }

    // ----- CHECK_MODE -----
    case A.CHECK_PROGRESS:
      return s.fw === GLASSES_STATE.CHECK_MODE ? { ...s, check: { ...s.check, progress: a.progress } } : s

    case A.CHECK_RESULT:
      return { ...s, check: { ...s.check, outcome: a.outcome } }

    case A.CHECK_RETRY:
      return { ...s, check: freshCheck() }

    case A.CHECK_CONTINUE:
      // Back to work: Timer_D restarts (the user is rested or has been warned)
      return { ...s, work: freshWork(), check: freshCheck() }

    case A.END_SESSION:
      return { ...s, work: freshWork(), check: freshCheck(), sessionEnded: true }

    case A.START_SESSION:
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
  if (!s.baseline || s.fw === GLASSES_STATE.BASELINE_CREATION) return 'BASELINE'
  if (s.fw === GLASSES_STATE.CHECK_MODE) return 'CHECK'
  if (s.fw === GLASSES_STATE.WORK_MODE) return 'DASHBOARD'
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

/** Overall wizard position: 1 = HRV part, 2 = posture part. */
export function selectWizPart(s) {
  return [STEP.FINGER, STEP.HRV, STEP.HRV_DONE].includes(s.wiz.step) ? 1 : 2
}

/**
 * True when there is no baseline but the firmware is already past BASELINE_CREATION
 * (it only re-enters that state after a reboot, and the app cannot force it).
 */
export const selectWizBlocked = (s) =>
  !s.baseline && !!s.fw && s.fw !== GLASSES_STATE.BASELINE_CREATION
