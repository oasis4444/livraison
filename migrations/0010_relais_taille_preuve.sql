-- Contenu et taille du colis, relais par le centre (livreur de récupération ≠ livreur de livraison),
-- preuve de livraison (photo + position GPS à la remise).
ALTER TABLE shipments ADD COLUMN dim_l REAL;              -- longueur (cm)
ALTER TABLE shipments ADD COLUMN dim_w REAL;              -- largeur (cm)
ALTER TABLE shipments ADD COLUMN dim_h REAL;              -- hauteur (cm)
ALTER TABLE shipments ADD COLUMN weight_kg REAL;          -- poids (kg)
ALTER TABLE shipments ADD COLUMN relay INTEGER NOT NULL DEFAULT 0;   -- 1 = passage par le centre
ALTER TABLE shipments ADD COLUMN leg TEXT;                -- 'pickup' (vers le centre) | 'delivery' (depuis le centre)
ALTER TABLE shipments ADD COLUMN pickup_courier_id INTEGER;
ALTER TABLE shipments ADD COLUMN delivery_courier_id INTEGER;
ALTER TABLE shipments ADD COLUMN delivery_departure_at INTEGER;
ALTER TABLE shipments ADD COLUMN centre_in_at INTEGER;    -- déposé au centre
ALTER TABLE shipments ADD COLUMN centre_out_at INTEGER;   -- repris au centre par le livreur de livraison
ALTER TABLE shipments ADD COLUMN delivered_lat REAL;
ALTER TABLE shipments ADD COLUMN delivered_lng REAL;
ALTER TABLE shipments ADD COLUMN delivered_dist_m INTEGER; -- distance entre le livreur et l'adresse au moment de la remise
ALTER TABLE shipments ADD COLUMN delivery_photo INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS shipment_delivery_photos (
  shipment_id INTEGER PRIMARY KEY REFERENCES shipments(id) ON DELETE CASCADE,
  mime        TEXT NOT NULL,
  data        TEXT NOT NULL,
  at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_user_at ON shipment_events(user_id, at);

UPDATE shipments SET pickup_courier_id = courier_id, delivery_courier_id = courier_id WHERE courier_id IS NOT NULL;

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('centre_lat', ''), ('centre_lng', ''),
  ('delivery_photo_required', '1'), ('delivery_max_dist_m', '300'), ('relay_enabled', '1');
