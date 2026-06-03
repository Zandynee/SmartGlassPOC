// ─────────────────────────────────────────────
//  bleConfig.js  –  shared BLE constants
//  Must stay in sync with firmware defines in
//  project_firmware.ino.
// ─────────────────────────────────────────────

export const BLE_DEVICE_NAME   = 'SmartGlasses'
export const BLE_SERVICE_UUID  = '19b10000-e8f2-537e-4f6c-d104768a1214'
export const BLE_CHAR_TOF_UUID = '19b10001-e8f2-537e-4f6c-d104768a1214'
export const BLE_CHAR_IMU_UUID = '19b10002-e8f2-537e-4f6c-d104768a1214'
export const BLE_CHAR_PPG_UUID = '19b10003-e8f2-537e-4f6c-d104768a1214'