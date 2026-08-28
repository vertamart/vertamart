-- Vertamart — lote de fidelización y herramientas de Panel
-- Reembolsos, reseñas con foto + compra verificada, puntos, seguimiento real,
-- analíticas, alertas de stock bajo y suscripciones a notificaciones push.

-- 1) Pedidos: número de seguimiento real + reembolsos
ALTER TABLE orders ADD COLUMN tracking_number TEXT;
ALTER TABLE orders ADD COLUMN refund_status TEXT NOT NULL DEFAULT 'none';  -- none | partial | full
ALTER TABLE orders ADD COLUMN refund_amount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN refund_reason TEXT;
ALTER TABLE orders ADD COLUMN points_earned INTEGER NOT NULL DEFAULT 0;

-- 2) Reseñas: foto (subida como data: URL o R2) + sello de compra verificada
ALTER TABLE reviews ADD COLUMN image_url TEXT;
ALTER TABLE reviews ADD COLUMN verified INTEGER NOT NULL DEFAULT 0;

-- 3) Usuarios: programa de puntos de fidelidad
ALTER TABLE users ADD COLUMN points INTEGER NOT NULL DEFAULT 0;

-- 4) Historial de puntos (para el panel del usuario)
CREATE TABLE IF NOT EXISTS points_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta       INTEGER NOT NULL,
  reason      TEXT NOT NULL,
  ref_type    TEXT NOT NULL DEFAULT 'order',
  ref_id      INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 5) Suscripciones a notificaciones push (web / escritorio / Android)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
  endpoint     TEXT NOT NULL UNIQUE,
  keys         TEXT NOT NULL,           -- JSON {p256dh, auth}
  user_agent   TEXT,
  category     TEXT NOT NULL DEFAULT 'web',   -- web | desktop | android | ios
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Índices de soporte
CREATE INDEX IF NOT EXISTS idx_orders_refund ON orders (refund_status);
CREATE INDEX IF NOT EXISTS idx_points_user ON points_history (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions (user_id);