-- GPS permanent : le téléphone du livreur envoie sa position même application fermée ou écran éteint,
-- via l'application gratuite « Traccar Client » (protocole OsmAnd). Clé personnelle par livreur.
ALTER TABLE couriers ADD COLUMN gps_key TEXT;
ALTER TABLE couriers ADD COLUMN gps_seen INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS couriers_gps_key ON couriers (gps_key);
