CREATE TABLE IF NOT EXISTS sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at  INTEGER NOT NULL,       -- epoch ms
  ended_at    INTEGER,                -- epoch ms, null while running
  mode        TEXT NOT NULL           -- 'simulate' | 'ble'
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
  hr_detectable INTEGER,              -- 0/1
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