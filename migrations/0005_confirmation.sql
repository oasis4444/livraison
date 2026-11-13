-- Double confirmation de livraison (preuve) : le livreur ET le destinataire (code PIN donné au livreur, ou bouton dans l'application).
ALTER TABLE shipments ADD COLUMN pin TEXT;
ALTER TABLE shipments ADD COLUMN courier_confirmed_at INTEGER;
ALTER TABLE shipments ADD COLUMN recipient_confirmed_at INTEGER;
ALTER TABLE shipments ADD COLUMN confirmed_by TEXT;
UPDATE shipments SET pin = printf('%04d', abs(random()) % 10000) WHERE pin IS NULL;
