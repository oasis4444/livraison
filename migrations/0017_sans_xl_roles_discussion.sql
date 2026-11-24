-- Alefa ne transporte que ce qui tient sur un vélo ou une moto : plus de catégorie XL sur devis (réactivable).
INSERT OR IGNORE INTO settings (key, value) VALUES ('xl_enabled', '0');
UPDATE settings SET value = 'documents, téléphone, vêtements, bijoux' WHERE key = 'cat_s_ex' AND value = '';
-- Équipe de l'administration : rubriques autorisées (vide = tout).
ALTER TABLE users ADD COLUMN perms TEXT;
-- Discussion par colis entre l'expéditeur, le destinataire, le livreur et le centre.
CREATE TABLE IF NOT EXISTS shipment_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id INTEGER NOT NULL,
  user_id INTEGER,
  role TEXT,
  body TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shipment_messages ON shipment_messages (shipment_id, id);
-- Appels audio dans la plateforme (WebRTC) : signalisation (offre, réponse, candidats) relayée par le serveur.
CREATE TABLE IF NOT EXISTS calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id INTEGER NOT NULL,
  to_id INTEGER NOT NULL,
  shipment_id INTEGER,
  status TEXT NOT NULL DEFAULT 'ringing',
  offer TEXT,
  answer TEXT,
  created_at INTEGER NOT NULL,
  answered_at INTEGER,
  ended_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_calls_to ON calls (to_id, status);
CREATE TABLE IF NOT EXISTS call_ice (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  call_id INTEGER NOT NULL,
  side TEXT NOT NULL,
  cand TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_call_ice ON call_ice (call_id, side, id);
INSERT OR IGNORE INTO settings (key, value) VALUES ('turn_url', ''), ('turn_user', ''), ('turn_pass', '');
