-- Colis gérés par le centre : récupération chez l'expéditeur puis livraison au destinataire, en un seul trajet.
-- Le destinataire paie valeur + frais ; le centre reverse la valeur à l'expéditeur au retour du livreur.

CREATE TABLE IF NOT EXISTS merchants (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  key_prefix  TEXT NOT NULL,
  key_hash    TEXT NOT NULL UNIQUE,
  webhook_url TEXT,
  webhook_secret TEXT NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL,
  last_used   INTEGER
);

CREATE TABLE IF NOT EXISTS shipments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ref             TEXT NOT NULL UNIQUE,
  source          TEXT NOT NULL DEFAULT 'app' CHECK (source IN ('app','api','admin')),
  merchant_id     INTEGER REFERENCES merchants(id),
  external_ref    TEXT,
  sender_id       INTEGER NOT NULL REFERENCES users(id),
  sender_name     TEXT NOT NULL,
  sender_phone    TEXT NOT NULL,
  pickup_addr     TEXT NOT NULL,
  pickup_lat      REAL,
  pickup_lng      REAL,
  recipient_id    INTEGER REFERENCES users(id),
  recipient_name  TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  drop_addr       TEXT NOT NULL,
  drop_lat        REAL,
  drop_lng        REAL,
  description     TEXT,
  declared_value  INTEGER NOT NULL DEFAULT 0,
  value           INTEGER,
  fee             INTEGER NOT NULL,
  return_fee      INTEGER NOT NULL DEFAULT 0,
  collected       INTEGER NOT NULL DEFAULT 0,
  courier_id      INTEGER REFERENCES users(id),
  slot_id         INTEGER,
  axe_id          INTEGER,
  departure_at    INTEGER,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','assigned','picked_up','delivered','refused','cancelled','returned')),
  outcome_note    TEXT,
  photo           INTEGER NOT NULL DEFAULT 0,
  cash_settled_at INTEGER,
  vendor_paid_at  INTEGER,
  created_at      INTEGER NOT NULL,
  assigned_at     INTEGER,
  picked_at       INTEGER,
  done_at         INTEGER,
  returned_at     INTEGER
);
CREATE INDEX IF NOT EXISTS idx_ship_status ON shipments(status, created_at);
CREATE INDEX IF NOT EXISTS idx_ship_courier ON shipments(courier_id, status);
CREATE INDEX IF NOT EXISTS idx_ship_sender ON shipments(sender_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ship_rphone ON shipments(recipient_phone, created_at);
CREATE INDEX IF NOT EXISTS idx_ship_merchant ON shipments(merchant_id, external_ref);

CREATE TABLE IF NOT EXISTS shipment_photos (
  shipment_id INTEGER PRIMARY KEY REFERENCES shipments(id) ON DELETE CASCADE,
  mime        TEXT NOT NULL,
  data        TEXT NOT NULL,
  at          INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS shipment_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  status      TEXT NOT NULL,
  note        TEXT,
  user_id     INTEGER,
  lat         REAL,
  lng         REAL,
  at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ship_events ON shipment_events(shipment_id, id);

-- Versements du centre aux expéditeurs (vendeurs).
CREATE TABLE IF NOT EXISTS vendor_payouts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  amount     INTEGER NOT NULL,
  note       TEXT,
  created_by INTEGER,
  at         INTEGER NOT NULL
);

-- Remises d'espèces des livreurs au centre.
CREATE TABLE IF NOT EXISTS cash_settlements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  courier_id INTEGER NOT NULL REFERENCES users(id),
  amount     INTEGER NOT NULL,
  shipments  INTEGER NOT NULL,
  note       TEXT,
  created_by INTEGER,
  at         INTEGER NOT NULL
);

ALTER TABLE axes ADD COLUMN fee INTEGER;

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('default_fee', '3000'),
  ('courier_can_edit_fee', '1'),
  ('centre_name', 'Centre Alefa'),
  ('centre_addr', 'Antananarivo');
