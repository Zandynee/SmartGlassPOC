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

/** Default PPG state */
export const DEFAULT_PPG = {
  hrBpm:         0,
  fatigueIndex:  0,
  fatigueStatus: 'UNKNOWN',
}

// ── helpers ───────────────────────────────────

const toDeg = (rad) => (rad * 180) / Math.PI

/**
 * Compute roll & pitch (degrees) from accelerometer vector.
 * Uses the standard atan2 / atan tilt formulas.
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

// ── BLE characteristic parsers ────────────────

/**
 * Parse the IMU JSON characteristic from the firmware.
 * Format: {"pitch_deg":X,"ax":X,"ay":X,"az":X,"gx":X,"gy":X,"gz":X,"fhp_status":"NORMAL"}
 *
 * Returns { pitch, accel, gyro, fhpStatus } or null on parse failure.
 */
export function parseBleImu(raw) {
  try {
    const d = JSON.parse(raw)
    if (d.pitch_deg === undefined || d.ax === undefined) return null
    return {
      pitch:     d.pitch_deg,
      accel:     { x: d.ax,       y: d.ay,       z: d.az },
      gyro:      { x: d.gx ?? 0,  y: d.gy ?? 0,  z: d.gz ?? 0 }, // ← now parsed
      fhpStatus: d.fhp_status ?? 'NORMAL',
    }
  } catch {
    return null
  }
}

/**
 * Parse the ToF JSON characteristic from the firmware.
 * Format: {"distance_cm":X,"status":"OK"}
 *
 * Returns { distanceCm, status } or null on parse failure.
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
 * Format: {"hr_bpm":X,"fatigue_index":X,"fatigue_status":"FRESH"}
 *
 * Returns { hrBpm, fatigueIndex, fatigueStatus } or null on parse failure.
 */
export function parseBlePpg(raw) {
  try {
    const d = JSON.parse(raw)
    if (d.hr_bpm === undefined) return null
    return {
      hrBpm:         d.hr_bpm,
      fatigueIndex:  d.fatigue_index ?? 0,
      fatigueStatus: d.fatigue_status ?? 'UNKNOWN',
    }
  } catch {
    return null
  }
}

// ── Legacy Web Serial parser (kept for reference) ─

/**
 * Parse one line of MPU-6050 firmware output (Web Serial mode).
 *
 * Expected format (115200 baud, Arduino sketch):
 *   "Pitch: 15.3 Roll: -4.1 Yaw: 90.2 | ax: 0.123 ay: -0.456 az: 0.987 gx: 1.2 gy: -0.5 gz: 0.3"
 */
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

/** Generate a single random IMU sample. */
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

/**
 * Blend previous state toward a new random sample.
 * α controls how "smooth" the walk is (lower = smoother).
 */
export function blendImu(prev, next, α = { accel: 0.2, gyro: 0.2, mag: 0.1 }) {
  const lerp = (a, b, t) => a * (1 - t) + b * t
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

/** Produce the next simulated IMU frame from the previous one. */
export function nextSimulatedFrame(prev) {
  return blendImu(prev, randomImuSample())
}

/** Produce a simulated ToF reading (10–50 cm random walk). */
export function nextSimulatedTof(prev) {
  const delta = (Math.random() - 0.5) * 6      // ±3 cm per tick
  const raw   = (prev?.distanceCm ?? 30) + delta
  const distanceCm = Math.min(50, Math.max(10, raw))
  return { distanceCm, status: 'OK' }
}

/** Produce a simulated PPG reading (60–100 BPM random walk). */
export function nextSimulatedPpg(prev) {
  const hrDelta      = (Math.random() - 0.5) * 4
  const fatigueDelta = (Math.random() - 0.5) * 6
  const hrBpm        = Math.min(100, Math.max(60, (prev?.hrBpm ?? 75) + hrDelta))
  const fatigueIndex = Math.min(100, Math.max(0,  (prev?.fatigueIndex ?? 30) + fatigueDelta))
  return {
    hrBpm,
    fatigueIndex,
    fatigueStatus: fatigueIndex > 75 ? 'FATIGUED' : 'FRESH',
  }
}