// ─────────────────────────────────────────────
//  imuService.js  –  IMU sensor logic
//  Covers: MPU-6050 / imu.h + imu.cpp
//
//  Responsibilities:
//    • DEFAULT_IMU state
//    • computeAngles()  — roll & pitch from accel
//    • integrateYaw()   — gyro Z integration
//    • nextSimulatedFrame() / helpers — sim loop
//    • parseBleImu()    — parse firmware JSON
//
//  Firmware JSON format (buildImuJson in firmware):
//    {"pitch_deg":X,"ax":X,"ay":X,"az":X,
//     "gx":X,"gy":X,"gz":X,"fhp_status":"NORMAL"}
// ─────────────────────────────────────────────

/** Default IMU state (sensor at rest, z-up). */
export const DEFAULT_IMU = {
  accel:     { x: 0, y: 0, z: 1 },
  gyro:      { x: 0, y: 0, z: 0 },
  mag:       { x: 0, y: 0, z: 0 },
  fhpStatus: 'NORMAL',
}

// ── Math helpers ──────────────────────────────

const toDeg = (rad) => (rad * 180) / Math.PI

/**
 * Compute roll & pitch (degrees) from an accelerometer vector.
 * Mirrors the atan2 formula used in imu.cpp::imuRead().
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

// ── Simulation ────────────────────────────────

function _randomImuSample() {
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

function _blendImu(prev, next, α = { accel: 0.2, gyro: 0.2, mag: 0.1 }) {
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

/** Produce the next simulated IMU frame (call every 20 ms). */
export function nextSimulatedFrame(prev) {
  return _blendImu(prev, _randomImuSample())
}

// ── BLE parser ────────────────────────────────

/**
 * Parse the IMU JSON characteristic emitted by buildImuJson() in firmware.
 * Returns null on parse failure or missing required fields.
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