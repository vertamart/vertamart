import { PRODUCTS } from '../src/data/products.ts'

const esc = (s) => `'${String(s ?? '').replace(/'/g, "''")}'`
const j = (a) => esc(JSON.stringify(a ?? []))
const targets = ['plantilla-presentacion-empresa', 'fuente-verta-display']

const parts = []
for (const p of PRODUCTS.filter((x) => targets.includes(x.slug))) {
  parts.push(`UPDATE products SET
  owner_id = NULL,
  name = ${esc(p.name)},
  brand = ${esc(p.brand)},
  category = ${esc(p.category)},
  price = ${p.price},
  old_price = ${p.oldPrice ?? 'NULL'},
  rating = ${p.rating ?? 0},
  reviews = ${p.reviews ?? 0},
  stock = 0,
  badge = ${p.badge ? esc(p.badge) : 'NULL'},
  description = ${esc(p.description)},
  features = ${j(p.features)},
  file_type = ${esc(p.fileType)},
  file_size = ${esc(p.fileSize)},
  compatibility = ${esc(p.compatibility)},
  license = ${esc(p.license)},
  downloads = ${p.downloads ?? 0},
  includes = ${j(p.includes)},
  requirements = ${j(p.requirements)},
  updates = ${esc(p.updates)},
  support = ${esc(p.support)},
  image = ${esc(p.image)},
  images = ${j(p.images)},
  product_code = ${esc(`VT-${(p.slug || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)}`)},
  status = 'active'
WHERE slug = ${esc(p.slug)};`)
}
const fs = await import('fs')
fs.writeFileSync('worker/migrations/0015_digital_fixup.sql', parts.join('\n\n') + '\n')
console.log('OK fixup', parts.length)
