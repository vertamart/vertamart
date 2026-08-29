import { PRODUCTS } from '../src/data/products.ts'

const j = (a) => JSON.stringify(a ?? [])
const rows = PRODUCTS.map((p, i) => {
  const code = `VT-${p.slug.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)}-${i + 1}`
  return `  { id: ${i + 100}, name: ${JSON.stringify(p.name)}, slug: ${JSON.stringify(p.slug)}, brand: ${JSON.stringify(p.brand)}, category: ${JSON.stringify(p.category)}, price: ${p.price}, oldPrice: ${p.oldPrice ?? 'null'}, rating: ${p.rating ?? 0}, reviews: ${p.reviews ?? 0}, badge: ${p.badge ? JSON.stringify(p.badge) : 'null'}, description: ${JSON.stringify(p.description)}, features: ${j(p.features)}, fileType: ${JSON.stringify(p.fileType)}, fileSize: ${JSON.stringify(p.fileSize)}, compatibility: ${JSON.stringify(p.compatibility)}, license: ${JSON.stringify(p.license)}, downloads: ${p.downloads ?? 0}, includes: ${j(p.includes)}, requirements: ${j(p.requirements)}, updates: ${JSON.stringify(p.updates)}, support: ${JSON.stringify(p.support)}, image: ${JSON.stringify(p.image)}, images: ${j(p.images)}, code: ${JSON.stringify(code)} }`
}).join(',\n')
const fs = await import('fs')
fs.writeFileSync('build/digital-catalog-data.mjs', `export const DIGITAL_CATALOG = [\n${rows},\n]\n`)
console.log('OK', PRODUCTS.length)
