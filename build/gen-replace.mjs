import { PRODUCTS } from '../src/data/products.ts'

const esc = (s) => `'${String(s ?? '').replace(/'/g, "''")}'`
const j = (a) => esc(JSON.stringify(a ?? []))

const cols = `(id, owner_id, name, slug, brand, category, price, old_price, rating, reviews, stock, badge, description, features, file_type, file_size, compatibility, license, downloads, includes, requirements, updates, support, image, images, product_code, status, created_at)`

const rows = PRODUCTS.map((p, i) => {
  const vals = [
    i + 100, 'NULL', esc(p.name), esc(p.slug), esc(p.brand), esc(p.category), p.price,
    p.oldPrice ?? 'NULL', p.rating ?? 0, p.reviews ?? 0, p.stock ?? 0,
    p.badge ? esc(p.badge) : 'NULL', esc(p.description), j(p.features),
    esc(p.fileType), esc(p.fileSize), esc(p.compatibility), esc(p.license), p.downloads ?? 0,
    j(p.includes), j(p.requirements), esc(p.updates), esc(p.support),
    esc(p.image), j(p.images), esc(`VT-${(p.slug || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)}`),
    "'active'", `'${p.createdAt}'`,
  ]
  return `(${vals.join(', ')})`
}).join(',\n')

const sql = `-- Reinserta el catálogo digital completo de la tienda (id 100+ para no chocar con publicaciones)\nINSERT OR REPLACE INTO products\n${cols}\nVALUES\n${rows};\n`
const fs = await import('fs')
fs.writeFileSync('worker/migrations/0016_digital_full.sql', sql)
console.log('OK replace', PRODUCTS.length)
