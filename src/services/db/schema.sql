CREATE TABLE IF NOT EXISTS sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at  INTEGER NOT NULL,       -- epoch ms
  ended_at    INTEGER,                -- epoch ms, null while running
  mode        TEXT NOT NULL           -- 'simulate' or 'ble'
);

CREATE TABLE IF NOT EXISTS imu_readings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  INTEGER NOT NULL,
  t           INTEGER NOT NULL,       -- epoch ms
  ax REAL, ay REAL, az REAL,
  gx REAL, gy REAL, gz REAL,
  roll REAL, pitch REAL, yaw REAL,
  fhp_status  TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS ppg_readings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    INTEGER NOT NULL,
  t             INTEGER NOT NULL,
  ir_raw        INTEGER,
  red_raw       INTEGER,
  hr_bpm        REAL,
  hr_detectable INTEGER,              -- 0 or 1
  fatigue_index REAL,
  fatigue_status TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS tof_readings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  INTEGER NOT NULL,
  t           INTEGER NOT NULL,
  distance_cm REAL,
  status      TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- NEW (HSM): one row per finished fatigue check (CHECK_MODE), with the baseline it was compared to
CREATE TABLE IF NOT EXISTS checks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    INTEGER NOT NULL,
  t             INTEGER NOT NULL,
  hr_bpm        REAL,
  sdnn          REAL,
  rmssd         REAL,
  pnn50         REAL,
  base_hr_bpm   REAL,
  base_sdnn     REAL,
  base_rmssd    REAL,
  base_pnn50    REAL,
  fatigue_index REAL,                 -- 0 to 100, derived from the HRV drop
  fatigued      INTEGER,              -- 0 or 1
  n_ibis        INTEGER,
  duration_s    REAL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_checks_s ON checks(session_id, t);
