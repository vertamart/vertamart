import { PRODUCTS } from '../src/data/products.ts'
import { writeFileSync } from 'fs'

const esc = (s) => `'${String(s ?? '').replace(/'/g, "''")}'`
const j = (a) => esc(JSON.stringify(a ?? []))

const cols = `(owner_id, name, slug, brand, category, price, old_price, rating, reviews, stock, badge, description, features, file_type, file_size, compatibility, license, downloads, includes, requirements, updates, support, image, images, product_code, status, created_at)`

const rows = PRODUCTS.map((p) => {
  const vals = [
    'NULL', esc(p.name), esc(p.slug), esc(p.brand), esc(p.category), p.price,
    p.oldPrice ?? 'NULL', p.rating ?? 0, p.reviews ?? 0, p.stock ?? 0,
    p.badge ? esc(p.badge) : 'NULL', esc(p.description), j(p.features),
    esc(p.fileType), esc(p.fileSize), esc(p.compatibility), esc(p.license), p.downloads ?? 0,
    j(p.includes), j(p.requirements), esc(p.updates), esc(p.support),
    esc(p.image), j(p.images), esc(`VT-${(p.slug || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)}`),
    "'active'", `'${p.createdAt}'`,
  ]
  return `(${vals.join(', ')})`
}).join(',\n')

const sql = `-- Vertamart → tienda de productos digitales
-- 1) Columnas digitales en products
ALTER TABLE products ADD COLUMN file_type TEXT;
ALTER TABLE products ADD COLUMN file_size TEXT;
ALTER TABLE products ADD COLUMN compatibility TEXT;
ALTER TABLE products ADD COLUMN license TEXT;
ALTER TABLE products ADD COLUMN downloads INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN includes TEXT NOT NULL DEFAULT '[]';
ALTER TABLE products ADD COLUMN requirements TEXT NOT NULL DEFAULT '[]';
ALTER TABLE products ADD COLUMN updates TEXT;
ALTER TABLE products ADD COLUMN support TEXT;

-- 2) Reemplazar el catálogo de la tienda (productos sin dueño) por el digital
DELETE FROM products WHERE owner_id IS NULL;

INSERT OR IGNORE INTO products\n${cols}\nVALUES\n${rows};

-- 3) Columnas digitales en order_items (para la biblioteca del cliente)
ALTER TABLE order_items ADD COLUMN file_type TEXT;
ALTER TABLE order_items ADD COLUMN license TEXT;
ALTER TABLE order_items ADD COLUMN download_url TEXT;
`
writeFileSync('worker/migrations/0014_digital_store.sql', sql)
console.log('OK: worker/migrations/0014_digital_store.sql (' + PRODUCTS.length + ' productos)')
