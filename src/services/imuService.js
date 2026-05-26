// ─────────────────────────────────────────────
//  imuService.js  –  pure / framework-agnostic
//  All maths, data-generation, and parsing lives here.
// ─────────────────────────────────────────────

// ── BLE configuration (must match firmware) ──

export const BLE_DEVICE_NAME   = 'SmartGlasses'
export const BLE_SERVICE_UUID  = '19b10000-e8f2-537e-4f6c-d104768a1214'
export const BLE_CHAR_TOF_UUID = '19b10001-e8f2-537e-4f6c-d104768a1214'
export const BLE_CHAR_IMU_UUID = '19b10002-e8f2-537e-4f6c-d104768a1214'
export const BLE_CHAR_PPG_UUID = '19b10003-e8f2-537e-4f6c-d104768a1214'

// ── Default sensor states ─────────────────────

/** Default IMU state (at rest, z-up) */
export const DEFAULT_IMU = {
  accel: { x: 0, y: 0, z: 1 },
  gyro:  { x: 0, y: 0, z: 0 },
  mag:   { x: 0, y: 0, z: 0 },
  fhpStatus: 'NORMAL',
}

/** Default ToF state */
export const DEFAULT_TOF = {
  distanceCm: 0,
  status: 'UNKNOWN',
}

/**
 * Default PPG state.
 * Includes raw sensor values (irRaw, redRaw) plus derived metrics.
 * hrDetectable === false means the buffer lacks enough beats to compute BPM.
 */
export const DEFAULT_PPG = {
  hrBpm:         0,
  fatigueIndex:  0,
  fatigueStatus: 'UNKNOWN',
  irRaw:         0,       // Latest raw IR ADC value from MAX30102
  redRaw:        0,       // Latest raw Red ADC value from MAX30102
  hrDetectable:  false,   // true only when BPM has been successfully calculated
}

// ── helpers ───────────────────────────────────

const toDeg = (rad) => (rad * 180) / Math.PI

/**
 * Compute roll & pitch (degrees) from accelerometer vector.
 */
export function computeAngles(accel) {
  const { x, y, z } = accel
  const roll  = toDeg(Math.atan2(y, z))
  const pitch = toDeg(Math.atan(-x / Math.sqrt(y * y + z * z)))
  return { roll, pitch }
}

/**
 * Integrate yaw from gyro Z (°/s) over dt (seconds).
 * Wraps the result to [-180, 180].
 */
export function integrateYaw(prevYaw, gyroZ, dt = 0.1) {
  let yaw = prevYaw + gyroZ * dt
  if (yaw >  180) yaw -= 360
  if (yaw < -180) yaw += 360
  return yaw
}

// ── PPG shape helper (used for simulation) ────
//
// Returns amplitude in [0, 1] for a given phase in [0, 1].
// Models the double-hump PPG profile:
//   • systolic peak  ≈ 20 % into the cardiac cycle
//   • dicrotic notch ≈ 46 % (small secondary bump)
function _ppgShape(phase) {
  const sys = Math.exp(-Math.pow((phase - 0.20) * 11.0, 2))
  const dic = 0.38 * Math.exp(-Math.pow((phase - 0.46) * 16.0, 2))
  return Math.max(0, sys + dic)
}

// ── PPG: IR ring buffer & HR calculation ──────
//
//  Firmware sends raw IR every 100 ms.
//  We store up to PPG_IR_BUFFER_SIZE samples with timestamps,
//  then use rising zero-crossing timing to estimate BPM.
//
//  Minimum required: 5 samples (~0.5 s) for first reading.
//  Full buffer: 30 samples (~3 s) for stable reading.

const PPG_IR_BUFFER_SIZE      = 30    // ~3 s @ 100 ms per sample
const PPG_IR_CONTACT_MIN      = 50000 // Minimum IR for skin-contact detection
const PPG_FATIGUE_HR_THRESHOLD = 90   // BPM above this = elevated HR

const _irBuffer     = new Array(PPG_IR_BUFFER_SIZE).fill(0)
const _irTimestamps = new Array(PPG_IR_BUFFER_SIZE).fill(0)
let   _irHead       = 0   // Next write index
let   _irCount      = 0   // Samples stored so far (max = PPG_IR_BUFFER_SIZE)

// ── PPG: scrolling display buffer (for oscilloscope) ──────────────────
//
//  Separate from the HR detection buffer.
//  Stores raw IR values with wall-clock timestamps so the oscilloscope
//  can render a true time-axis waveform regardless of sampling rate.
//
//  Window: last 8 seconds of data.
//  At 50 Hz (20 ms simulation interval) ≈ 400 entries max.
//  At 10 Hz (100 ms BLE interval)       ≈  80 entries max.

const PPG_DISPLAY_WINDOW_MS = 8000
export { PPG_DISPLAY_WINDOW_MS }

/** @type {{ t: number, v: number }[]} */
const _displaySamples = []

/** Push one IR value into the scrolling display window. */
export function pushIrToDisplay(irValue) {
  const now    = Date.now()
  const cutoff = now - PPG_DISPLAY_WINDOW_MS
  // Trim entries older than the window (front = oldest).
  let trimTo = 0
  while (trimTo < _displaySamples.length && _displaySamples[trimTo].t < cutoff) trimTo++
  if (trimTo > 0) _displaySamples.splice(0, trimTo)
  _displaySamples.push({ t: now, v: irValue })
}

/**
 * Returns a normalized snapshot of the display window for the oscilloscope,
 * or null when there is no meaningful AC signal.
 *
 * Each entry: { t: timestamp_ms, vNorm: 0–1 }
 */
export function getIrDisplaySnapshot() {
  if (_displaySamples.length < 2) return null

  let min = Infinity, max = -Infinity
  for (const s of _displaySamples) {
    if (s.v < min) min = s.v
    if (s.v > max) max = s.v
  }

  const range = max - min
  // < 500 raw ADC counts → flat noise, not a real pulse waveform
  if (range < 500) return null

  return _displaySamples.map(s => ({ t: s.t, vNorm: (s.v - min) / range }))
}

// ── PPG simulation state ──────────────────────
let _simPhase = 0   // Current phase within the cardiac cycle [0, 1)

/**
 * Advance the simulation phase by one 50 ms step and push a synthetic
 * IR sample into the display buffer.
 * Call this from useImu's 50 ms IR-simulation interval.
 */
export function pushSimulatedIrSample(bpm) {
  const safeBpm = Math.max(40, bpm)
  const period  = 60 / safeBpm           // seconds per beat
  _simPhase     = (_simPhase + 0.02 / period) % 1   // 20 ms step

  // Realistic IR range: baseline ~80 000 + AC component ~18 000
  const shape   = _ppgShape(_simPhase)
  const irValue = Math.round(80000 + 18000 * shape)
  pushIrToDisplay(irValue)
  return irValue
}

/** Reset all PPG buffers (call on disconnect / full reset). */
export function resetPpgBuffer() {
  _irBuffer.fill(0)
  _irTimestamps.fill(0)
  _irHead  = 0
  _irCount = 0
  _displaySamples.length = 0
  _simPhase = 0
}

/** Push one IR detection sample into the HR ring buffer with its timestamp. */
function _pushIr(irValue) {
  const idx = _irHead % PPG_IR_BUFFER_SIZE
  _irBuffer[idx]     = irValue
  _irTimestamps[idx] = Date.now()
  _irHead = (_irHead + 1) % PPG_IR_BUFFER_SIZE
  if (_irCount < PPG_IR_BUFFER_SIZE) _irCount++
}

/**
 * Estimate HR from the ring buffer using rising zero-crossing timestamps.
 *
 * Algorithm:
 *  1. Build a chronological snapshot (oldest → newest) with real timestamps.
 *  2. Compute the mean as DC baseline.
 *  3. Record the interpolated timestamp of each below→above crossing.
 *  4. Average the crossing intervals → BPM.
 *
 * Returns null when the buffer has too few samples or beats are out of
 * physiological range. Returns { bpm, detectable: true } on success.
 */
function _calculateHrFromBuffer() {
  // Require at least 5 samples (~2 s) before showing any reading.
  if (_irCount < 5) return null

  const n        = Math.min(_irCount, PPG_IR_BUFFER_SIZE)
  // When the buffer is not yet full, the oldest entry is at index 0.
  // When it is full, _irHead points to the next-write slot (= oldest slot).
  const startIdx = _irCount < PPG_IR_BUFFER_SIZE ? 0 : _irHead

  const samples = []
  const times   = []
  for (let i = 0; i < n; i++) {
    const idx = (startIdx + i) % PPG_IR_BUFFER_SIZE
    samples.push(_irBuffer[idx])
    times.push(_irTimestamps[idx])
  }

  // Skip if all timestamps are 0 (buffer freshly reset but count not yet cleared)
  if (times[0] === 0) return null

  const mean = samples.reduce((s, v) => s + v, 0) / samples.length

  // Collect interpolated crossing timestamps
  const crossTimes = []
  let wasBelow = samples[0] < mean
  for (let i = 1; i < samples.length; i++) {
    const isBelow = samples[i] < mean
    if (wasBelow && !isBelow) {
      // Linear interpolation between the two adjacent timestamps
      const frac = (mean - samples[i - 1]) / (samples[i] - samples[i - 1])
      crossTimes.push(times[i - 1] + frac * (times[i] - times[i - 1]))
    }
    wasBelow = isBelow
  }

  if (crossTimes.length < 2) return null

  // Average peak-to-peak interval using actual wall-clock deltas
  let totalMs = 0
  for (let i = 1; i < crossTimes.length; i++) totalMs += crossTimes[i] - crossTimes[i - 1]
  const avgIntervalMs = totalMs / (crossTimes.length - 1)
  const bpm           = 60000 / avgIntervalMs

  if (bpm < 40 || bpm > 200) return null
  return bpm
}

/**
 * Map a BPM to a fatigue index (0–100).
 * Normal HR → low index; elevated HR → index rises toward 100.
 */
function _calculateFatigueIndex(bpm) {
  if (bpm <= PPG_FATIGUE_HR_THRESHOLD) {
    const ratio = Math.max(0, (bpm - 40) / (PPG_FATIGUE_HR_THRESHOLD - 40))
    return Math.round(ratio * 30)
  }
  const ratio = Math.min(1, (bpm - PPG_FATIGUE_HR_THRESHOLD) / (200 - PPG_FATIGUE_HR_THRESHOLD))
  return Math.round(30 + ratio * 70)
}

// ── BLE characteristic parsers ────────────────

/**
 * Parse the IMU JSON characteristic from the firmware.
 * Format: {"pitch_deg":X,"ax":X,"ay":X,"az":X,"gx":X,"gy":X,"gz":X,"fhp_status":"NORMAL"}
 */
export function parseBleImu(raw) {
  try {
    const d = JSON.parse(raw)
    if (d.pitch_deg === undefined || d.ax === undefined) return null
    return {
      pitch:     d.pitch_deg,
      accel:     { x: d.ax,      y: d.ay,      z: d.az },
      gyro:      { x: d.gx ?? 0, y: d.gy ?? 0, z: d.gz ?? 0 },
      fhpStatus: d.fhp_status ?? 'NORMAL',
    }
  } catch {
    return null
  }
}

/**
 * Parse the ToF JSON characteristic from the firmware.
 * Format: {"distance_cm":X,"status":"OK"}
 */
export function parseBleTof(raw) {
  try {
    const d = JSON.parse(raw)
    if (d.distance_cm === undefined) return null
    return {
      distanceCm: d.distance_cm,
      status:     d.status ?? 'UNKNOWN',
    }
  } catch {
    return null
  }
}

/**
 * Parse the PPG JSON characteristic from the firmware.
 * Format: {"ir":X,"red":X,"contact_status":"CONTACT"}
 *
 * Flow:
 *  1. Parse JSON.
 *  2. Check skin contact (contact_status + IR threshold).
 *  3. Push IR into the HR ring buffer AND the display buffer.
 *  4. Calculate HR from real timestamps.
 *  5. Return a PPG state object with raw values + derived metrics.
 */
export function parseBlePpg(raw) {
  try {
    const d = JSON.parse(raw)
    if (d.ir === undefined) return null

    const irValue       = d.ir
    const redValue      = d.red ?? 0
    const contactStatus = d.contact_status ?? 'UNKNOWN'

    // No skin contact → clear buffers, return NO_CONTACT
    if (contactStatus === 'NO_CONTACT' || irValue < PPG_IR_CONTACT_MIN) {
      resetPpgBuffer()
      return {
        hrBpm:         0,
        fatigueIndex:  0,
        fatigueStatus: 'NO_CONTACT',
        irRaw:         irValue,
        redRaw:        redValue,
        hrDetectable:  false,
      }
    }

    // Feed both buffers
    _pushIr(irValue)
    pushIrToDisplay(irValue)

    const bpm = _calculateHrFromBuffer()

    if (bpm === null) {
      // Buffer accumulating — not enough data yet
      return {
        hrBpm:         0,
        fatigueIndex:  0,
        fatigueStatus: 'UNKNOWN',
        irRaw:         irValue,
        redRaw:        redValue,
        hrDetectable:  false,
      }
    }

    const fatigueIndex  = _calculateFatigueIndex(bpm)
    const fatigueStatus = fatigueIndex > 75 ? 'FATIGUED' : 'FRESH'

    return {
      hrBpm:         bpm,
      fatigueIndex,
      fatigueStatus,
      irRaw:         irValue,
      redRaw:        redValue,
      hrDetectable:  true,
    }
  } catch {
    return null
  }
}

// ── Legacy Web Serial parser (kept for reference) ─

export function parseFirmwareLine(line) {
  const pitchM = line.match(/Pitch:\s*([-\d.]+)/)
  const rollM  = line.match(/Roll:\s*([-\d.]+)/)
  const yawM   = line.match(/Yaw:\s*([-\d.]+)/)
  const axM    = line.match(/ax:\s*([-\d.]+)/)
  const ayM    = line.match(/ay:\s*([-\d.]+)/)
  const azM    = line.match(/az:\s*([-\d.]+)/)
  const gxM    = line.match(/gx:\s*([-\d.]+)/)
  const gyM    = line.match(/gy:\s*([-\d.]+)/)
  const gzM    = line.match(/gz:\s*([-\d.]+)/)

  if (!pitchM || !rollM || !axM || !ayM || !azM) return null

  return {
    pitch: parseFloat(pitchM[1]),
    roll:  parseFloat(rollM[1]),
    yaw:   yawM ? parseFloat(yawM[1]) : null,
    accel: {
      x: parseFloat(axM[1]),
      y: parseFloat(ayM[1]),
      z: parseFloat(azM[1]),
    },
    gyro: {
      x: gxM ? parseFloat(gxM[1]) : 0,
      y: gyM ? parseFloat(gyM[1]) : 0,
      z: gzM ? parseFloat(gzM[1]) : 0,
    },
  }
}

// ── simulation ────────────────────────────────

export function randomImuSample() {
  return {
    accel: {
      x: (Math.random() - 0.5) * 2,
      y: (Math.random() - 0.5) * 2,
      z: 0.5 + Math.random() * 1.5,
    },
    gyro: {
      x: (Math.random() - 0.5) * 200,
      y: (Math.random() - 0.5) * 200,
      z: (Math.random() - 0.5) * 200,
    },
    mag: {
      x: (Math.random() - 0.5) * 50,
      y: (Math.random() - 0.5) * 50,
      z: (Math.random() - 0.5) * 50,
    },
  }
}

export function blendImu(prev, next, α = { accel: 0.2, gyro: 0.2, mag: 0.1 }) {
  const lerp      = (a, b, t) => a * (1 - t) + b * t
  const blendAxis = (p, n, t) => ({
    x: lerp(p.x, n.x, t),
    y: lerp(p.y, n.y, t),
    z: lerp(p.z, n.z, t),
  })
  return {
    accel:     blendAxis(prev.accel, next.accel, α.accel),
    gyro:      blendAxis(prev.gyro,  next.gyro,  α.gyro),
    mag:       blendAxis(prev.mag,   next.mag,   α.mag),
    fhpStatus: prev.fhpStatus,
  }
}

export function nextSimulatedFrame(prev) {
  return blendImu(prev, randomImuSample())
}

export function nextSimulatedTof(prev) {
  const delta      = (Math.random() - 0.5) * 6
  const raw        = (prev?.distanceCm ?? 30) + delta
  const distanceCm = Math.min(50, Math.max(10, raw))
  return { distanceCm, status: 'OK' }
}

/**
 * Produce a simulated PPG state (400 ms tick).
 * Includes synthetic irRaw / redRaw so the raw-values UI
 * shows plausible numbers even without hardware.
 *
 * Note: the display-buffer waveform is driven by pushSimulatedIrSample()
 * at 50 ms in the hook — NOT by this function — to get a smooth oscilloscope.
 */
export function nextSimulatedPpg(prev) {
  const hrDelta      = (Math.random() - 0.5) * 4
  const fatigueDelta = (Math.random() - 0.5) * 6
  const hrBpm        = Math.min(100, Math.max(60, (prev?.hrBpm ?? 75) + hrDelta))
  const fatigueIndex = Math.min(100, Math.max(0,  (prev?.fatigueIndex ?? 30) + fatigueDelta))

  // Simulate plausible raw ADC values for display
  const shape  = _ppgShape(_simPhase)   // _simPhase is advanced by pushSimulatedIrSample
  const irRaw  = Math.round(80000 + 18000 * shape)
  const redRaw = Math.round(62000 + 14000 * shape)

  return {
    hrBpm,
    fatigueIndex,
    fatigueStatus: fatigueIndex > 75 ? 'FATIGUED' : 'FRESH',
    irRaw,
    redRaw,
    hrDetectable:  true,
  }
}