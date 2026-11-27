-- Alertes « ça traîne » chez le livreur : colis gardés plus de hold_hours heures, argent gardé plus de cash_alert_hours heures.
-- (Mêmes réglages et table aussi créés automatiquement au premier usage par src/shipments.js.)
INSERT OR IGNORE INTO settings (key, value) VALUES ('hold_hours', '3'), ('cash_alert_hours', '12');
CREATE TABLE IF NOT EXISTS alerts_sent (k TEXT PRIMARY KEY, at INTEGER NOT NULL);
