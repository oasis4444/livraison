-- Étapes détaillées d'un colis : parti du centre, arrivé chez l'expéditeur, en route, proche du destinataire.
ALTER TABLE shipments ADD COLUMN stage TEXT;
ALTER TABLE shipments ADD COLUMN stage_at INTEGER;
CREATE INDEX IF NOT EXISTS idx_pos_at ON positions(at);
