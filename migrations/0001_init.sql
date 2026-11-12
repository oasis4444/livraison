-- Alefa Livraison — schéma initial (Cloudflare D1 / SQLite)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  phone         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('client','courier','admin')),
  pass_hash     TEXT NOT NULL,
  pass_salt     TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','suspended','rejected')),
  lang          TEXT NOT NULL DEFAULT 'fr',
  is_business   INTEGER NOT NULL DEFAULT 0,
  company       TEXT,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until  INTEGER,
  cancel_count  INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role, status);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS couriers (
  user_id            INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  vehicle            TEXT NOT NULL DEFAULT 'velo',
  cin                TEXT,
  address            TEXT,
  emergency_contact  TEXT,
  doc_note           TEXT,
  available          INTEGER NOT NULL DEFAULT 0,
  lat                REAL,
  lng                REAL,
  last_seen          INTEGER,
  rating_sum         INTEGER NOT NULL DEFAULT 0,
  rating_count       INTEGER NOT NULL DEFAULT 0,
  balance            INTEGER NOT NULL DEFAULT 0,
  subscription_until INTEGER,
  validated_at       INTEGER
);
CREATE INDEX IF NOT EXISTS idx_couriers_geo ON couriers(available, lat, lng);

CREATE TABLE IF NOT EXISTS zones (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  center_lat REAL NOT NULL,
  center_lng REAL NOT NULL,
  radius_km  REAL NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS deliveries (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id       INTEGER NOT NULL REFERENCES users(id),
  courier_id      INTEGER REFERENCES users(id),
  zone_id         INTEGER REFERENCES zones(id),
  type            TEXT NOT NULL DEFAULT 'colis' CHECK (type IN ('colis','documents','marchandises','repas','autre')),
  description     TEXT,
  pickup_lat      REAL NOT NULL,
  pickup_lng      REAL NOT NULL,
  pickup_addr     TEXT,
  drop_lat        REAL NOT NULL,
  drop_lng        REAL NOT NULL,
  drop_addr       TEXT,
  recipient_name  TEXT,
  recipient_phone TEXT,
  distance_km     REAL NOT NULL,
  suggested_price INTEGER NOT NULL,
  proposed_price  INTEGER NOT NULL,
  final_price     INTEGER,
  discount        INTEGER NOT NULL DEFAULT 0,
  promo_code      TEXT,
  commission      INTEGER NOT NULL DEFAULT 0,
  payment_method  TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash','mvola','orange_money','airtel_money')),
  payment_status  TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','pending','paid','refunded')),
  payment_ref     TEXT,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','assigned','picked_up','delivered','cancelled','expired')),
  pin             TEXT NOT NULL,
  scheduled_at    INTEGER,
  created_at      INTEGER NOT NULL,
  assigned_at     INTEGER,
  picked_at       INTEGER,
  delivered_at    INTEGER,
  cancelled_at    INTEGER,
  cancelled_by    TEXT,
  cancel_reason   TEXT,
  rating          INTEGER,
  rating_comment  TEXT,
  flagged         TEXT
);
CREATE INDEX IF NOT EXISTS idx_deliv_status ON deliveries(status, created_at);
CREATE INDEX IF NOT EXISTS idx_deliv_client ON deliveries(client_id, created_at);
CREATE INDEX IF NOT EXISTS idx_deliv_courier ON deliveries(courier_id, created_at);

CREATE TABLE IF NOT EXISTS offers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_id INTEGER NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  courier_id  INTEGER NOT NULL REFERENCES users(id),
  price       INTEGER NOT NULL,
  distance_km REAL,
  eta_min     INTEGER,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','withdrawn')),
  created_at  INTEGER NOT NULL,
  UNIQUE (delivery_id, courier_id)
);

CREATE TABLE IF NOT EXISTS positions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  courier_id  INTEGER NOT NULL REFERENCES users(id),
  delivery_id INTEGER,
  lat         REAL NOT NULL,
  lng         REAL NOT NULL,
  at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pos_courier ON positions(courier_id, at);
CREATE INDEX IF NOT EXISTS idx_pos_delivery ON positions(delivery_id, at);

CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_id INTEGER NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  sender_id   INTEGER NOT NULL REFERENCES users(id),
  body        TEXT NOT NULL,
  at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_delivery ON messages(delivery_id, id);

CREATE TABLE IF NOT EXISTS notifications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT,
  delivery_id INTEGER,
  read        INTEGER NOT NULL DEFAULT 0,
  at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, id);

CREATE TABLE IF NOT EXISTS transactions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  courier_id  INTEGER NOT NULL REFERENCES users(id),
  delivery_id INTEGER,
  kind        TEXT NOT NULL CHECK (kind IN ('commission','earning','payout','deposit','subscription','adjust','refund')),
  amount      INTEGER NOT NULL,
  note        TEXT,
  created_by  INTEGER,
  at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tx_courier ON transactions(courier_id, at);

CREATE TABLE IF NOT EXISTS complaints (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_id INTEGER,
  user_id     INTEGER REFERENCES users(id),
  kind        TEXT NOT NULL CHECK (kind IN ('complaint','sos','alert')),
  body        TEXT,
  lat         REAL,
  lng         REAL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  resolution  TEXT,
  at          INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status, at);

CREATE TABLE IF NOT EXISTS favorites (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label   TEXT NOT NULL,
  addr    TEXT,
  lat     REAL NOT NULL,
  lng     REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS promos (
  code       TEXT PRIMARY KEY,
  percent    INTEGER NOT NULL CHECK (percent BETWEEN 1 AND 100),
  max_amount INTEGER,
  max_uses   INTEGER,
  uses       INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER,
  active     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action  TEXT NOT NULL,
  detail  TEXT,
  ip      TEXT,
  at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit(at);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('commission_mode', 'percent'),
  ('commission_percent', '10'),
  ('subscription_monthly', '20000'),
  ('base_fare', '1500'),
  ('per_km', '800'),
  ('min_price', '2000'),
  ('road_factor', '1.3'),
  ('request_radius_km', '5'),
  ('request_ttl_min', '30'),
  ('bike_speed_kmh', '14'),
  ('position_retention_days', '30'),
  ('max_open_requests', '3'),
  ('max_courier_debt', '30000'),
  ('platform_name', 'Alefa'),
  ('support_phone', ''),
  ('mvola_number', ''),
  ('orange_money_number', ''),
  ('airtel_money_number', '');

INSERT INTO zones (name, center_lat, center_lng, radius_km, active)
SELECT 'Antananarivo', -18.9100, 47.5250, 14, 1
WHERE NOT EXISTS (SELECT 1 FROM zones);
