-- Trajets déclarés par les livreurs (départ, destination, itinéraire, capacité),
-- acceptation / refus des missions, lien de suivi public, journal des échanges et limitation de l'API.
CREATE TABLE IF NOT EXISTS courier_trips (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  courier_id  INTEGER NOT NULL REFERENCES users(id),
  depart_at   INTEGER NOT NULL,
  end_at      INTEGER NOT NULL,
  from_addr   TEXT NOT NULL, from_lat REAL NOT NULL, from_lng REAL NOT NULL,
  to_addr     TEXT NOT NULL, to_lat REAL NOT NULL, to_lng REAL NOT NULL,
  route       TEXT NOT NULL,            -- JSON [[lat,lng],…] (itinéraire vélo simplifié)
  km          REAL,
  capacity    INTEGER NOT NULL DEFAULT 10,
  status      TEXT NOT NULL DEFAULT 'planned', -- planned | cancelled
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trips_time ON courier_trips(depart_at, status);
CREATE INDEX IF NOT EXISTS idx_trips_courier ON courier_trips(courier_id, depart_at);

ALTER TABLE shipments ADD COLUMN trip_id INTEGER;
ALTER TABLE shipments ADD COLUMN accepted_at INTEGER;
ALTER TABLE shipments ADD COLUMN refused_by TEXT;      -- ids des livreurs ayant refusé, séparés par des virgules
ALTER TABLE shipments ADD COLUMN track_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ship_track ON shipments(track_token);

CREATE TABLE IF NOT EXISTS sync_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  partner   TEXT NOT NULL,              -- 'tsena', 'api:<merchant id>', 'webhook:<merchant id>'
  direction TEXT NOT NULL,              -- 'in' (logiciel → Alefa) | 'out' (Alefa → logiciel)
  ref       TEXT,
  ok        INTEGER NOT NULL,
  message   TEXT,
  at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sync_at ON sync_log(at);

CREATE TABLE IF NOT EXISTS rate_hits (
  bucket TEXT PRIMARY KEY,              -- '<clé>:<minute>'
  n      INTEGER NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('trip_corridor_m', '700'), ('require_accept', '1'), ('api_rate_per_min', '120'),
  ('tsena_pickup_lat', ''), ('tsena_pickup_lng', '');
UPDATE shipments SET track_token = lower(hex(randomblob(12))) WHERE track_token IS NULL;
