-- Versements aux expéditeurs par Mobile Money : numéro de paiement de chaque expéditeur et détail de chaque versement.
-- (Les mêmes tables sont aussi créées automatiquement au premier usage par src/payouts.js.)
CREATE TABLE IF NOT EXISTS payout_accounts (
  user_id    INTEGER PRIMARY KEY,
  method     TEXT NOT NULL,
  phone      TEXT,
  holder     TEXT,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS vendor_payout_details (
  payout_id INTEGER PRIMARY KEY,
  method    TEXT NOT NULL,
  phone     TEXT,
  reference TEXT
);
