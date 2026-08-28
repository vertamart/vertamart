import { DatabaseSync } from 'node:sqlite'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Archivo de base de datos SQLite (se crea automáticamente en server/verta.db). */
const dbPath = join(__dirname, 'verta.db')

export const db = new DatabaseSync(dbPath)

/** Añade una columna si no existe (para migraciones simples sobre tablas existentes). */
function ensureColumn(table, ddl) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
  } catch {
    // La columna ya existe: no pasa nada
  }
}

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'customer',
    country       TEXT NOT NULL DEFAULT 'CL',
    is_premium    INTEGER NOT NULL DEFAULT 0,
    is_suspended  INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    brand       TEXT NOT NULL DEFAULT 'Verta',
    category    TEXT NOT NULL DEFAULT 'audio',
    price       INTEGER NOT NULL,
    old_price   INTEGER,
    rating      REAL NOT NULL DEFAULT 4.5,
    reviews     INTEGER NOT NULL DEFAULT 0,
    stock       INTEGER NOT NULL DEFAULT 10,
    badge       TEXT,
    description TEXT NOT NULL DEFAULT '',
    features    TEXT NOT NULL DEFAULT '[]',
    ship_days   INTEGER NOT NULL DEFAULT 2,
    colors      TEXT NOT NULL DEFAULT '["#16a34a"]',
    image       TEXT NOT NULL DEFAULT '',
    images      TEXT NOT NULL DEFAULT '[]',
    product_code TEXT UNIQUE,
    status      TEXT NOT NULL DEFAULT 'active',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
    customer_name  TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT NOT NULL DEFAULT '',
    address        TEXT NOT NULL DEFAULT '',
    city           TEXT NOT NULL DEFAULT '',
    region         TEXT NOT NULL DEFAULT '',
    postal_code    TEXT NOT NULL DEFAULT '',
    subtotal       INTEGER NOT NULL,
    discount       INTEGER NOT NULL DEFAULT 0,
    shipping       INTEGER NOT NULL DEFAULT 0,
    total          INTEGER NOT NULL,
    status         TEXT NOT NULL DEFAULT 'pending',
    estimated_delivery TEXT,
    tracking_token TEXT UNIQUE,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    name       TEXT NOT NULL,
    price      INTEGER NOT NULL,
    qty        INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS payments (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id       INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    amount         INTEGER NOT NULL,
    method         TEXT NOT NULL,
    transaction_id TEXT,
    provider_order_id TEXT,
    installments   INTEGER,
    status         TEXT NOT NULL DEFAULT 'pending',
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS payout_accounts (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    provider       TEXT NOT NULL,
    label          TEXT NOT NULL,
    account_ref    TEXT NOT NULL,
    is_active      INTEGER NOT NULL DEFAULT 1,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Dinero que llega a la cuenta receptora configurada en el panel.
  CREATE TABLE IF NOT EXISTS payout_transactions (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    payout_account_id INTEGER NOT NULL REFERENCES payout_accounts(id) ON DELETE CASCADE,
    user_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
    type              TEXT NOT NULL DEFAULT 'subscription',
    amount            REAL NOT NULL,
    currency          TEXT NOT NULL DEFAULT 'USD',
    method            TEXT NOT NULL DEFAULT 'card',
    reference         TEXT,
    status            TEXT NOT NULL DEFAULT 'pending',
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS follows (
    follower_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (follower_id, following_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content     TEXT NOT NULL,
    image_url   TEXT,
    is_read     INTEGER NOT NULL DEFAULT 0,
    edited_at   TEXT,
    deleted_at  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS blocked_users (
    blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (blocker_id, blocked_id)
  );

  CREATE TABLE IF NOT EXISTS contacts (
    owner_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (owner_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_messages_pair ON messages (sender_id, receiver_id, created_at);

  CREATE TABLE IF NOT EXISTS feed_posts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id  TEXT,
    title       TEXT NOT NULL,
    description TEXT NOT NULL,
    video_url   TEXT NOT NULL,
    likes_count INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS feed_likes (
    post_id INTEGER NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (post_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS feed_comments (
    id TEXT PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id  TEXT NOT NULL,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating      INTEGER NOT NULL,
    content     TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS promo_codes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT NOT NULL UNIQUE,
    percent     INTEGER NOT NULL,
    min_amount  INTEGER NOT NULL DEFAULT 0,
    expires_at  TEXT,
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews (product_id);
`)

// Migraciones simples para tablas creadas antes de estas columnas
ensureColumn('users', "role TEXT NOT NULL DEFAULT 'customer'")
ensureColumn('users', "country TEXT NOT NULL DEFAULT 'CL'")
ensureColumn('users', "is_premium INTEGER NOT NULL DEFAULT 0")
ensureColumn('users', "is_suspended INTEGER NOT NULL DEFAULT 0")
ensureColumn('products', "warranty TEXT")
ensureColumn('orders', "customer_phone TEXT NOT NULL DEFAULT ''")
ensureColumn('orders', "address TEXT NOT NULL DEFAULT ''")
ensureColumn('orders', "city TEXT NOT NULL DEFAULT ''")
ensureColumn('orders', "region TEXT NOT NULL DEFAULT ''")
ensureColumn('orders', "postal_code TEXT NOT NULL DEFAULT ''")
ensureColumn('payments', "provider_order_id TEXT")
ensureColumn('products', "product_code TEXT")
ensureColumn('orders', "estimated_delivery TEXT")
ensureColumn('orders', "tracking_token TEXT")
ensureColumn('messages', "image_url TEXT")
ensureColumn('messages', "edited_at TEXT")
ensureColumn('messages', "deleted_at TEXT")

/** Duración de las sesiones antes de expirar. */
export const SESSION_TTL_DAYS = 30
