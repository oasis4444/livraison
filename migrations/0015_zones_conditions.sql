-- Tarifs selon la distance (zones), plusieurs colis, grosse valeur, XL minimum, tentatives de livraison, acceptation des conditions.
ALTER TABLE shipments ADD COLUMN qty INTEGER NOT NULL DEFAULT 1;          -- plusieurs colis, même adresse
ALTER TABLE shipments ADD COLUMN distance_km REAL;
ALTER TABLE shipments ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;     -- tentatives de livraison (destinataire injoignable)
ALTER TABLE shipments ADD COLUMN cat_changed_at INTEGER;                  -- catégorie corrigée par le livreur : l'expéditeur peut annuler sans frais
ALTER TABLE users ADD COLUMN terms_version TEXT;
ALTER TABLE users ADD COLUMN terms_at INTEGER;

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('zone1_km', '3'), ('zone1_fee', '2000'), ('zone2_km', '7'), ('zone2_fee', '3000'), ('zone3_km', '12'), ('zone3_fee', '4000'), ('zone4_fee', '5000'),
  ('multi_discount', '50'), ('big_value', '200000'), ('big_value_pct', '1'), ('xl_min_fee', '15000'), ('max_attempts', '2'), ('centre_keep_days', '7'),
  ('liability_cap', ''), ('support_phone', ''), ('terms_version', '2026-11-24'), ('zones_enabled', '1');
UPDATE settings SET value = 'Lot II V 89 Ampandrana, Antananarivo' WHERE key = 'centre_addr' AND value IN ('', 'Antananarivo');
UPDATE settings SET value = '' WHERE key IN ('centre_lat', 'centre_lng') AND (SELECT value FROM settings WHERE key = 'centre_addr') = 'Lot II V 89 Ampandrana, Antananarivo';
UPDATE settings SET value = 'meuble, matelas, sac de riz de 50 kg — sur devis (minimum 15 000 Ar)' WHERE key = 'cat_xl_ex' AND value = 'plus lourd ou plus grand : sur devis du centre';
