-- Créneau d'axe d'un livreur : lieu de départ et d'arrivée saisis par l'admin (+ itinéraire selon le véhicule).
ALTER TABLE courier_axes ADD COLUMN from_addr TEXT;
ALTER TABLE courier_axes ADD COLUMN from_lat REAL;
ALTER TABLE courier_axes ADD COLUMN from_lng REAL;
ALTER TABLE courier_axes ADD COLUMN to_addr TEXT;
ALTER TABLE courier_axes ADD COLUMN to_lat REAL;
ALTER TABLE courier_axes ADD COLUMN to_lng REAL;
ALTER TABLE courier_axes ADD COLUMN route TEXT;
ALTER TABLE courier_axes ADD COLUMN km REAL;
