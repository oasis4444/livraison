-- Conditions de transport (catégories S/M/L/XL + options), preuves par étape, retards, plafond d'argent chez le livreur, SMS.
ALTER TABLE shipments ADD COLUMN category TEXT;                         -- S | M | L | XL
ALTER TABLE shipments ADD COLUMN fragile INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shipments ADD COLUMN express INTEGER NOT NULL DEFAULT 0;     -- livraison dans l'heure, sans passer par le centre
ALTER TABLE shipments ADD COLUMN centre_drop INTEGER NOT NULL DEFAULT 0; -- l'expéditeur dépose lui-même au centre (L / XL)
ALTER TABLE shipments ADD COLUMN wait_fee INTEGER NOT NULL DEFAULT 0;    -- attente chez le destinataire (> 10 min)
ALTER TABLE shipments ADD COLUMN fee_detail TEXT;                       -- détail du prix (JSON)
ALTER TABLE shipments ADD COLUMN late_alerted_at INTEGER;

-- Photo de preuve à chaque étape : récupération (shipment_photos), dépôt au centre, livraison (shipment_delivery_photos).
CREATE TABLE IF NOT EXISTS shipment_proofs (
  shipment_id INTEGER NOT NULL REFERENCES shipments(id),
  step        TEXT NOT NULL,           -- centre_in | centre_out
  mime        TEXT NOT NULL,
  data        TEXT NOT NULL,
  user_id     INTEGER,
  at          INTEGER NOT NULL,
  PRIMARY KEY (shipment_id, step)
);

CREATE TABLE IF NOT EXISTS sms_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id INTEGER,
  to_phone    TEXT NOT NULL,
  body        TEXT NOT NULL,
  status      TEXT NOT NULL,           -- sent | failed | skipped
  error       TEXT,
  at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sms_ship ON sms_log(shipment_id);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('cat_s_kg', '3'), ('cat_s_cm', '40'), ('cat_s_fee', '0'), ('cat_s_ex', 'documents, téléphone, vêtements, bijoux'),
  ('cat_m_kg', '10'), ('cat_m_cm', '50'), ('cat_m_fee', '1000'), ('cat_m_ex', 'chaussures en boîte, petit carton, courses'),
  ('cat_l_kg', '25'), ('cat_l_cm', '80'), ('cat_l_fee', '3000'), ('cat_l_ex', 'sac de riz, carton de marchandises, valise'),
  ('cat_xl_ex', 'plus lourd ou plus grand : sur devis du centre'),
  ('pickup_fee_large', '2000'), ('opt_fragile', '1000'), ('opt_express', '2000'), ('opt_wait', '500'), ('return_fee_percent', '50'),
  ('direct_km', '3'), ('direct_fee', '2000'),
  ('late_hours', '24'), ('cash_cap', '200000'), ('cash_cap_hours', '48'), ('scan_required', '1'),
  ('sms_enabled', '0'), ('sms_gateway_url', ''), ('sms_gateway_token', ''), ('sms_sender', 'Alefa'), ('public_url', 'https://livraison.oasismdg3434.workers.dev');
UPDATE settings SET value = '15' WHERE key = 'bike_max_kg' AND value = '10';
UPDATE settings SET value = '30' WHERE key = 'moto_max_kg' AND value = '25';
