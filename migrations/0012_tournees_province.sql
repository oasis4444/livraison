-- Paiement de la marchandise déjà fait par Mobile Money, envois en province (coopérative), tournées des livreurs et offres « premier qui confirme ».
ALTER TABLE shipments ADD COLUMN value_paid INTEGER NOT NULL DEFAULT 0;   -- 1 = le destinataire a déjà payé la marchandise (Mobile Money)
ALTER TABLE shipments ADD COLUMN value_paid_ref TEXT;                     -- référence de la transaction Mobile Money
ALTER TABLE shipments ADD COLUMN province INTEGER NOT NULL DEFAULT 0;     -- 1 = colis remis à une coopérative pour la province
ALTER TABLE shipments ADD COLUMN dest_city TEXT;                          -- ville de destination en province
ALTER TABLE shipments ADD COLUMN coop_name TEXT;                          -- coopérative (taxi-brousse) choisie par le client
ALTER TABLE shipments ADD COLUMN coop_plate TEXT;                         -- immatriculation / repère du véhicule (saisi à la remise)
ALTER TABLE shipments ADD COLUMN coop_driver_phone TEXT;                  -- téléphone du chauffeur ou de la coopérative
ALTER TABLE shipments ADD COLUMN coop_fee INTEGER;                        -- frais de transport de la coopérative
ALTER TABLE shipments ADD COLUMN coop_fee_status TEXT;                    -- 'pa' (payé à l'arrivée) | 'paid' (déjà payé)

-- « Je pars du centre » : tournée en cours du livreur (destination + itinéraire).
CREATE TABLE IF NOT EXISTS courier_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  courier_id  INTEGER NOT NULL REFERENCES users(id),
  from_lat    REAL, from_lng REAL,
  to_addr     TEXT, to_lat REAL, to_lng REAL,
  route       TEXT,
  started_at  INTEGER NOT NULL,
  ended_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_runs_open ON courier_runs(ended_at, started_at);

-- Colis proposé à plusieurs livreurs en tournée : le premier qui confirme le prend.
CREATE TABLE IF NOT EXISTS shipment_offers (
  shipment_id INTEGER NOT NULL REFERENCES shipments(id),
  courier_id  INTEGER NOT NULL REFERENCES users(id),
  status      TEXT NOT NULL DEFAULT 'open',   -- open | taken | lost | declined | closed
  at          INTEGER NOT NULL,
  PRIMARY KEY (shipment_id, courier_id)
);
CREATE INDEX IF NOT EXISTS idx_offers_courier ON shipment_offers(courier_id, status, at);

-- Les nouveaux colis vont à l'admin, qui les répartit (« admin ») ; « auto » = ancienne attribution automatique.
INSERT OR IGNORE INTO settings (key, value) VALUES ('dispatch_mode', 'admin');
