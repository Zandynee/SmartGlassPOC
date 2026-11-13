import { execute, select } from './db.js'

export async function startSession(mode) {
  const { lastInsertId } = await execute(
    'INSERT INTO sessions (started_at, mode) VALUES (?, ?)',
    [Date.now(), mode]
  )
  if (!lastInsertId) throw new Error('startSession: no lastInsertId returned')
  return lastInsertId
}

/** endedAt defaults to now; the recorder passes the moment the link dropped. */
export async function endSession(sessionId, endedAt = Date.now()) {
  await execute('UPDATE sessions SET ended_at = ? WHERE id = ?', [endedAt, sessionId])
}

const n = (v) => (v == null || Number.isNaN(v) ? null : v)

export async function insertImuReading(sessionId, r) {
  await execute(
    `INSERT INTO imu_readings
     (session_id, t, ax, ay, az, gx, gy, gz, roll, pitch, yaw, fhp_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [sessionId, Date.now(),
      n(r.accel?.x), n(r.accel?.y), n(r.accel?.z),
      n(r.gyro?.x), n(r.gyro?.y), n(r.gyro?.z),
      n(r.roll), n(r.pitch), n(r.yaw), r.fhpStatus ?? null]
  )
}

/** v2: only the heart rate of a finished check (History "Detak Jantung"). Legacy fatigue columns stay NULL. */
export async function insertPpgReading(sessionId, r) {
  await execute(
    `INSERT INTO ppg_readings (session_id, t, ir_raw, red_raw, hr_bpm, hr_detectable)
     VALUES (?,?,?,?,?,?)`,
    [sessionId, Date.now(), n(r.irRaw), n(r.redRaw), n(r.hrBpm), r.hrDetectable ? 1 : 0]
  )
}

export async function insertTofReading(sessionId, r) {
  await execute(
    `INSERT INTO tof_readings (session_id, t, distance_cm, status) VALUES (?,?,?,?)`,
    [sessionId, Date.now(), n(r.distanceCm), r.status ?? null]
  )
}

/**
 * One finished HRV check (decision.decideCheck output, flattened). INVALID checks are stored too
 * (status 'INVALID', metrics NULL) so History can show them separately from the trend line.
 */
export async function insertCheck(sessionId, c) {
  await execute(
    `INSERT INTO checks
     (session_id, t, hr_bpm, sdnn, rmssd, base_hr_bpm, base_sdnn, base_rmssd, duration_s,
      status, work_duration_s, rmssd_change_pct, sdnn_change_pct, valid_windows, total_windows, drop_thr)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [sessionId, c.t ?? Date.now(), n(c.hrBpm), n(c.sdnn), n(c.rmssd),
     n(c.baseHrBpm), n(c.baseSdnn), n(c.baseRmssd), n(c.durationS),
     c.status, n(c.workDurationS), n(c.rmssdChangePct), n(c.sdnnChangePct),
     n(c.validWindows), n(c.totalWindows), n(c.dropThr)]
  )
}

/** Stores a baseline once (created_at is UNIQUE, so a re-load of the same baseline is ignored). */
export async function insertBaselineIfNew(b) {
  await execute(
    `INSERT OR IGNORE INTO baselines
     (created_at, date_key, fitness, hr_bpm, rmssd, sdnn, valid_windows, total_windows, window_s, pitch_deg)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [b.createdAt, b.dateKey, n(b.fitness), n(b.hrv.hrBpm), n(b.hrv.rmssd), n(b.hrv.sdnn),
     n(b.hrv.validWindows), n(b.hrv.totalWindows), n(b.hrv.windowS), n(b.posture?.pitchDeg)]
  )
}

export async function queryBaselines() {
  return select('SELECT * FROM baselines ORDER BY created_at')
}

export async function queryHistory(sessionId) {
  return {
    imu: await select('SELECT * FROM imu_readings WHERE session_id = ? ORDER BY t', [sessionId]),
    ppg: await select('SELECT * FROM ppg_readings WHERE session_id = ? ORDER BY t', [sessionId]),
    tof: await select('SELECT * FROM tof_readings WHERE session_id = ? ORDER BY t', [sessionId]),
    checks: await select('SELECT * FROM checks WHERE session_id = ? ORDER BY t', [sessionId]),
  }
}

export async function deleteSession(sessionId) {
  await execute('DELETE FROM imu_readings WHERE session_id = ?', [sessionId])
  await execute('DELETE FROM ppg_readings WHERE session_id = ?', [sessionId])
  await execute('DELETE FROM tof_readings WHERE session_id = ?', [sessionId])
  await execute('DELETE FROM checks WHERE session_id = ?', [sessionId])
  await execute('DELETE FROM sessions WHERE id = ?', [sessionId])
}

if (typeof window !== 'undefined') {
  window._sessions = { startSession, endSession, insertImuReading, insertPpgReading, insertTofReading, insertCheck, insertBaselineIfNew, queryHistory }
}
