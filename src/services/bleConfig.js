// ─────────────────────────────────────────────
//  bleConfig.js  –  shared BLE constants (Tier 3 ↔ firmware contract)
//  Must stay in sync with firmware defines in project_firmware.ino.
//
//  Firmware = Hierarchical State Machine
//    Tier 1  application logic : BASELINE_CREATION → WORK_MODE ⇄ CHECK_MODE
//    Tier 2  hardware gating   : sensors are powered only when the state needs them
//
//  Characteristics (service 19b10000-…):
//    tof   19b10001  Read/Notify  {"distance_cm":x,"status":"…"}          (WORK_MODE only)
//    imu   19b10002  Read/Notify  {"pitch_deg":x,"fhp_status":"…"}        (BASELINE + WORK)
//    ppg   19b10003  Read/Notify  {"ir":x,"red":x,"contact_status":"…"}   (BASELINE + CHECK, ~100 Hz)
//    state 19b10004  Read/Notify  "BASELINE_CREATION" | "WORK_MODE" | "CHECK_MODE"
//    cmd   19b10005  Write        1 = go to WORK_MODE, 2 = go to CHECK_MODE
// ─────────────────────────────────────────────

export const BLE_DEVICE_NAME     = 'SmartGlasses'
export const BLE_SERVICE_UUID    = '19b10000-e8f2-537e-4f6c-d104768a1214'
export const BLE_CHAR_TOF_UUID   = '19b10001-e8f2-537e-4f6c-d104768a1214'
export const BLE_CHAR_IMU_UUID   = '19b10002-e8f2-537e-4f6c-d104768a1214'
export const BLE_CHAR_PPG_UUID   = '19b10003-e8f2-537e-4f6c-d104768a1214'
export const BLE_CHAR_STATE_UUID = '19b10004-e8f2-537e-4f6c-d104768a1214'   // NEW
export const BLE_CHAR_CMD_UUID   = '19b10005-e8f2-537e-4f6c-d104768a1214'   // NEW

/** Firmware application states (what stateChar reports). */
export const GLASSES_STATE = Object.freeze({
  BASELINE_CREATION: 'BASELINE_CREATION',
  WORK_MODE:         'WORK_MODE',
  CHECK_MODE:        'CHECK_MODE',
})

/** Bytes the app may write to cmdChar. */
export const CMD = Object.freeze({
  GO_WORK_MODE:  1,
  GO_CHECK_MODE: 2,
})

/** Raw PPG notification rate the firmware sends in BASELINE_CREATION / CHECK_MODE. */
export const PPG_SAMPLE_RATE_HZ = 100

/**
 * Normalise whatever the native layer hands us for stateChar (string, quoted
 * string, bytes, trailing NUL …) into a GLASSES_STATE value, or null.
 */
export function parseGlassesState(raw) {
  if (raw == null) return null
  let s
  if (typeof raw === 'string') s = raw
  else if (Array.isArray(raw) || raw instanceof Uint8Array) s = String.fromCharCode(...raw)
  else s = String(raw)

  s = s.replace(/\0/g, '').trim().replace(/^["']+|["']+$/g, '').trim().toUpperCase()
  return Object.values(GLASSES_STATE).includes(s) ? s : null
}
