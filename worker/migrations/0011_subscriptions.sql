-- Suscripción Premium y transacciones de dinero de la cuenta receptora
ALTER TABLE users ADD COLUMN is_premium INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS payout_transactions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  payout_account_id INTEGER NOT NULL REFERENCES payout_accounts(id) ON DELETE CASCADE,
  user_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  type              TEXT NOT NULL,
  amount            REAL NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'USD',
  method            TEXT NOT NULL,
  reference         TEXT,
  status            TEXT NOT NULL DEFAULT 'pending',
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_payout_tx_account ON payout_transactions (payout_account_id, created_at);
CREATE INDEX IF NOT EXISTS idx_payout_tx_user ON payout_transactions (user_id, created_at);
