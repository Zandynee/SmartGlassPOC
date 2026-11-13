-- VisioGuard database, schema version 2 (PRAGMA user_version = 2).
-- Fresh databases get this file as is. Databases created by version 1 are upgraded by
-- migrate.js (it adds the missing `checks` columns), so every statement here must stay
-- idempotent (IF NOT EXISTS). Comment lines are stripped before the file is split on ';'.

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

-- v2: only the heart rate of a finished check is stored here (History "Detak Jantung").
-- fatigue_index / fatigue_status are LEGACY (v1) and are no longer written.
CREATE TABLE IF NOT EXISTS ppg_readings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    INTEGER NOT NULL,
  t             INTEGER NOT NULL,
  ir_raw        INTEGER,
  red_raw       INTEGER,
  hr_bpm        REAL,
  hr_detectable INTEGER,              -- 0 or 1
  fatigue_index REAL,                 -- LEGACY
  fatigue_status TEXT,                -- LEGACY
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

-- One row per finished HRV check (3 x 60 s windows) – also the INVALID ones (status = 'INVALID').
-- hr_bpm, sdnn, rmssd = medians of the valid check windows; base_* = the day's baseline medians.
-- Columns marked v2 are added to old databases by migrate.js; LEGACY ones are no longer written.
CREATE TABLE IF NOT EXISTS checks (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id       INTEGER NOT NULL,
  t                INTEGER NOT NULL,
  hr_bpm           REAL,
  sdnn             REAL,
  rmssd            REAL,
  pnn50            REAL,              -- LEGACY (not used in the decision, not shown)
  base_hr_bpm      REAL,
  base_sdnn        REAL,
  base_rmssd       REAL,
  base_pnn50       REAL,              -- LEGACY
  fatigue_index    REAL,              -- LEGACY
  fatigued         INTEGER,           -- LEGACY
  n_ibis           INTEGER,
  duration_s       REAL,
  status           TEXT,              -- v2: STABLE | SOFT | DROP | INVALID  (NULL = legacy row)
  work_duration_s  REAL,              -- v2: Timer_D when the check was taken
  rmssd_change_pct REAL,              -- v2: negative = drop
  sdnn_change_pct  REAL,              -- v2
  valid_windows    INTEGER,           -- v2: e.g. 2
  total_windows    INTEGER,           -- v2: e.g. 3
  drop_thr         REAL,              -- v2: threshold used (0.20 = 20 %)
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- v2: the day's baseline (one row per baseline that was created)
CREATE TABLE IF NOT EXISTS baselines (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at    INTEGER NOT NULL UNIQUE,   -- epoch ms (same value as in baselineStore)
  date_key      TEXT NOT NULL,             -- local day, 'YYYY-MM-DD'
  fitness       INTEGER,                   -- 1..5
  hr_bpm        REAL,
  rmssd         REAL,
  sdnn          REAL,
  valid_windows INTEGER,
  total_windows INTEGER,
  window_s      REAL,
  pitch_deg     REAL
);

CREATE INDEX IF NOT EXISTS idx_checks_s ON checks(session_id, t);
CREATE INDEX IF NOT EXISTS idx_baselines_day ON baselines(date_key);
