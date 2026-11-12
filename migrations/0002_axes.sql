-- Axes (secteurs) de travail des livreurs et planning par créneaux horaires.
CREATE TABLE IF NOT EXISTS axes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  center_lat REAL NOT NULL,
  center_lng REAL NOT NULL,
  radius_km  REAL NOT NULL,
  color      TEXT NOT NULL DEFAULT '#0b6e4f',
  active     INTEGER NOT NULL DEFAULT 1
);

-- Créneau : de start_min à end_min (minutes depuis minuit, heure de Madagascar). days : jours actifs « 1234567 » (1 = lundi).
CREATE TABLE IF NOT EXISTS courier_axes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  courier_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  axe_id     INTEGER NOT NULL REFERENCES axes(id) ON DELETE CASCADE,
  start_min  INTEGER NOT NULL CHECK (start_min BETWEEN 0 AND 1439),
  end_min    INTEGER NOT NULL CHECK (end_min BETWEEN 1 AND 1440),
  days       TEXT NOT NULL DEFAULT '1234567'
);
CREATE INDEX IF NOT EXISTS idx_courier_axes ON courier_axes(courier_id, start_min);

INSERT OR IGNORE INTO settings (key, value) VALUES ('axe_slot_minutes', '60');
