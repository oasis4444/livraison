-- Synchronisation automatique avec Tsena Ampandrana (Firebase / Firestore).
CREATE TABLE IF NOT EXISTS tsena_links (
  shipment_id INTEGER PRIMARY KEY REFERENCES shipments(id) ON DELETE CASCADE,
  doc_id      TEXT NOT NULL UNIQUE,
  last_step   TEXT,
  synced_at   INTEGER
);
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('tsena_url', ''), ('tsena_project', ''), ('tsena_api_key', ''), ('tsena_refresh', ''), ('tsena_email', ''),
  ('tsena_shop_name', ''), ('tsena_shop_phone', ''), ('tsena_pickup_addr', ''),
  ('tsena_last_sync', ''), ('tsena_last_result', ''), ('tsena_last_error', '');
