-- Créneaux prévus de récupération / livraison, validation par l'admin (valeur ou poids), parts du centre et du livreur,
-- frais encaissés à la récupération (marchandise payée par Mobile Money), service client.
ALTER TABLE shipments ADD COLUMN pickup_from INTEGER;
ALTER TABLE shipments ADD COLUMN pickup_to INTEGER;
ALTER TABLE shipments ADD COLUMN deliver_from INTEGER;
ALTER TABLE shipments ADD COLUMN deliver_to INTEGER;
ALTER TABLE shipments ADD COLUMN review TEXT;                    -- motif si le colis attend la validation de l'admin
ALTER TABLE shipments ADD COLUMN moto_only INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shipments ADD COLUMN centre_share INTEGER;           -- part du centre sur les frais
ALTER TABLE shipments ADD COLUMN courier_share INTEGER;          -- part du livreur qui livre
ALTER TABLE shipments ADD COLUMN pickup_fee INTEGER;             -- frais encaissés à la récupération
ALTER TABLE shipments ADD COLUMN pickup_fee_by INTEGER;          -- livreur qui les a encaissés (à remettre au centre)
ALTER TABLE shipments ADD COLUMN pickup_fee_settled_at INTEGER;

CREATE TABLE IF NOT EXISTS support_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),   -- client ou livreur (fil de discussion)
  author_id   INTEGER NOT NULL REFERENCES users(id),
  from_centre INTEGER NOT NULL DEFAULT 0,
  body        TEXT NOT NULL,
  shipment_id INTEGER,
  at          INTEGER NOT NULL,
  read_centre INTEGER NOT NULL DEFAULT 0,
  read_user   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_support_user ON support_messages(user_id, id);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('am_start', '08:00'), ('am_end', '12:00'), ('pm_start', '13:00'), ('pm_end', '17:00'),
  ('max_value', '300000'),
  ('bike_max_kg', '10'), ('moto_max_kg', '25'), ('weight_free_kg', '5'), ('weight_step_kg', '5'), ('weight_step_fee', '1000'),
  ('share_t1_max', '4000'), ('share_t1', '1000'), ('share_t2_max', '8000'), ('share_t2', '2000'), ('share_t3', '3000');
