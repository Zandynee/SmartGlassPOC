import { execute, select, lastInsertId } from './db'

export async function startSession(mode) {
    await execute('INSERT INTO sessions (started_at, mode) VALUES (?, ?)', [Date.now(), mode])
    return lastInsertId()
}

export async function endSession(sessionId) {
    await execute('UPDATE sessions SET ended_at = ? WHERE id = ?', [Date.now(), sessionId])
}

export async function insertImuReading(sessionId, r) {
    await execute(
        `INSERT INTO imu_readings
         (session_id, t, ax, ay, az, gx, gy, gz, roll, pitch, yaw, fhp_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
         [sessionId, Date.now(), r.accel.x, r.accel.y, r.accel.z, r.gyro.x, r.gyro.y, r.gyro.z, r.roll, r.pitch, r.yaw, r.fhpStatus]
    )
}

export async function insertPpgReading(sessionId, r) {
  await  execute(
    `INSERT INTO ppg_readings
     (session_id, t, ir_raw, red_raw, hr_bpm, hr_detectable, fatigue_index, fatigue_status)
     VALUES (?,?,?,?,?,?,?,?)`,
    [sessionId, Date.now(), r.irRaw, r.redRaw, r.hrBpm,
     r.hrDetectable ? 1 : 0, r.fatigueIndex, r.fatigueStatus]
  )
}

export async function insertTofReading(sessionId, r) {
   await execute(
    `INSERT INTO tof_readings (session_id, t, distance_cm, status) VALUES (?,?,?,?)`,
    [sessionId, Date.now(), r.distanceCm, r.status]
  )
}

export async function queryHistory(sessionId) {
  return {
    imu: await select('SELECT * FROM imu_readings WHERE session_id = ? ORDER BY t', [sessionId]),
    ppg: await select('SELECT * FROM ppg_readings WHERE session_id = ? ORDER BY t', [sessionId]),
    tof: await select('SELECT * FROM tof_readings WHERE session_id = ? ORDER BY t', [sessionId])
  }
}

if (typeof window !== 'undefined') {
  window._sessions = { startSession, endSession, insertImuReading, insertPpgReading, insertTofReading, queryHistory }
}