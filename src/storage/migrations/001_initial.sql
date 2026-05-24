CREATE TABLE vehicles (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('car','motorcycle')),
  mass_kg REAL NOT NULL,
  drivetrain TEXT NOT NULL CHECK (drivetrain IN ('fwd','rwd','awd','chain','shaft')),
  frontal_area_m2 REAL,
  drag_coefficient REAL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TEXT
);

CREATE TABLE calibrations (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  gear_label TEXT NOT NULL,
  rpm REAL NOT NULL,
  speed_kmh REAL NOT NULL,
  rollout_m_per_rev REAL NOT NULL,
  recorded_at TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TEXT
);
CREATE INDEX idx_calibrations_vehicle ON calibrations(vehicle_id);

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  calibration_id TEXT NOT NULL REFERENCES calibrations(id),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  gear_label TEXT NOT NULL,
  conditions TEXT NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('complete','degraded','aborted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  synced_at TEXT
);
CREATE INDEX idx_runs_vehicle ON runs(vehicle_id);

CREATE TABLE samples (
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  t_ms INTEGER NOT NULL,
  speed_mps REAL NOT NULL,
  accel_long_ms2 REAL,
  accel_vert_ms2 REAL,
  lat REAL,
  lon REAL,
  hdop REAL,
  PRIMARY KEY (run_id, t_ms)
);

CREATE TABLE derived_curves (
  run_id TEXT PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
  rpm_min REAL NOT NULL,
  rpm_max REAL NOT NULL,
  points TEXT NOT NULL,
  pipeline_version INTEGER NOT NULL,
  computed_at TEXT NOT NULL
);
