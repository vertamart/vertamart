import express from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { db, SESSION_TTL_DAYS } from './db.js'

const app = express()
const PORT = process.env.PORT ?? 4000
const SALT_ROUNDS = 10
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ORDER_STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled']
const PRODUCT_STATUSES = ['active', 'hidden']
const MESSAGE_MAX_LENGTH = 2000
const generateToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex')

app.use(express.json({ limit: '10mb' }))

// CORS básico (en desarrollo el proxy de Vite evita CORS; esto cubre acceso directo)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

/* ------------------------------ Helpers ------------------------------- */

const ok = (res, data, status = 200) => res.status(status).json({ data })
const fail = (res, status, message, code) => res.status(status).json({ status, message, code })

const safeJson = (value, fallback) => {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    country: row.country,
    isPremium: !!row.is_premium,
    isSuspended: !!row.is_suspended,
    createdAt: row.created_at,
  }
}

function createSession(userId) {
  const token = generateToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 3600 * 1000).toISOString()
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt)
  return token
}

function getUserFromToken(req) {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return null
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > datetime('now')`,
    )
    .get(token)
  if (!row || row.is_suspended) return null
  return publicUser(row)
}

function requireAuth(req, res, next) {
  const user = getUserFromToken(req)
  if (!user) return fail(res, 401, 'Debes iniciar sesión', 'UNAUTHORIZED')
  req.user = user
  next()
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return fail(res, 403, 'Requiere permisos de administrador', 'FORBIDDEN')
  next()
}

function requireCustomer(req, res, next) {
  if (req.user?.role === 'support') return fail(res, 403, 'La cuenta de soporte solo puede usar el chat', 'SUPPORT_CHAT_ONLY')
  next()
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/** Valores digitales por defecto según la categoría (productos de la tienda). */
function digitalDefaults(category) {
  const map = {
    plantillas: { fileType: 'ZIP', fileSize: '25 MB', compatibility: 'Windows · macOS · Linux' },
    presets: { fileType: 'DNG', fileSize: '6 MB', compatibility: 'Lightroom Classic · CC · Mobile' },
    iconos: { fileType: 'SVG', fileSize: '8 MB', compatibility: 'Figma · Web · Sketch' },
    fuentes: { fileType: 'OTF', fileSize: '3 MB', compatibility: 'Windows · macOS · Linux · Web' },
    'modelos-3d': { fileType: 'OBJ', fileSize: '120 MB', compatibility: 'Blender · Maya · Unreal · Unity' },
    plugins: { fileType: 'ZIP', fileSize: '10 MB', compatibility: 'Figma · VS Code · Canva' },
    cursos: { fileType: 'MP4', fileSize: '3 GB', compatibility: 'Reproductor de vídeo' },
    packs: { fileType: 'ZIP', fileSize: '500 MB', compatibility: 'Windows · macOS · Linux' },
  }
  return map[category] ?? { fileType: 'ZIP', fileSize: '10 MB', compatibility: 'Windows · macOS · Linux' }
}

function productToApi(row) {
  return {
    id: String(row.id),
    slug: row.slug,
    name: row.name,
    brand: row.brand,
    category: row.category,
    price: row.price,
    oldPrice: row.old_price ?? undefined,
    rating: row.rating,
    reviews: row.reviews,
    stock: row.stock,
    badge: row.badge ?? undefined,
    description: row.description,
    features: safeJson(row.features, []),
    warranty: row.warranty ?? null,
    fileType: row.file_type ?? digitalDefaults(row.category).fileType,
    fileSize: row.file_size ?? digitalDefaults(row.category).fileSize,
    compatibility: row.compatibility ?? digitalDefaults(row.category).compatibility,
    license: row.license ?? 'Uso personal y comercial',
    downloads: row.downloads ?? 0,
    includes: safeJson(row.includes, []),
    requirements: safeJson(row.requirements, []),
    updates: row.updates ?? 'Actualizaciones de por vida',
    support: row.support ?? 'Soporte por correo',
    shipDays: row.ship_days ?? 0,
    colors: safeJson(row.colors, []),
    image: row.image,
    images: safeJson(row.images, row.image ? [row.image] : []),
    productCode: row.product_code ?? null,
    createdAt: row.created_at,
    status: row.status,
    ownerId: row.owner_id ?? null,
    ownerName: row.owner_name ?? null,
    ownerCountry: row.owner_country ?? null,
    owner: row.owner_id ? { id: row.owner_id, name: row.owner_name ?? 'Vendedor', country: row.owner_country ?? null } : null,
  }
}

function publicProfile(row, viewerId) {
  const stats = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM products WHERE owner_id = ? AND status = 'active') AS products_count,
        (SELECT COUNT(*) FROM follows WHERE following_id = ?) AS followers_count,
        (SELECT COUNT(*) FROM follows WHERE follower_id = ?) AS following_count`,
    )
    .get(row.id, row.id, row.id)
  const isFollowing = viewerId
    ? !!db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(viewerId, row.id)
    : false
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    country: row.country,
    createdAt: row.created_at,
    productsCount: stats.products_count,
    followersCount: stats.followers_count,
    followingCount: stats.following_count,
    isFollowing,
    isSelf: viewerId ? viewerId === row.id : false,
  }
}

const paginate = (res, items) => ok(res, { items, total: items.length, page: 1, pageSize: items.length, totalPages: 1 })

/**
 * Elige un video relacionado con el título/descripción en lugar de uno al azar.
 * Mapea palabras clave a clips de Pexels (libres de uso) para tech, setups, audio, gaming…
 */
const FEED_VIDEOS = [
  { keyword: /setup|escritorio|oficina|work|trabajo|desk|laptop|computador|notebook/i, url: 'https://videos.pexels.com/video-files/3195394/3195394-hd_1920_1080_25fps.mp4' },
  { keyword: /teclado|keyboard|typing|teclear|write|mecanico/i, url: 'https://videos.pexels.com/video-files/853800/853800-hd_1920_1080_25fps.mp4' },
  { keyword: /gaming|gamer|jugar|juego|esports|setup gaming/i, url: 'https://videos.pexels.com/video-files/3205627/3205627-hd_1920_1080_25fps.mp4' },
  { keyword: /audio|sonido|musica|m\u00fasica|auricular|bocina|parlante|radio|music/i, url: 'https://videos.pexels.com/video-files/2242403/2242403-hd_1920_1080_25fps.mp4' },
  { keyword: /monitor|pantalla|display|video|pel\u00edcula|stream|streaming/i, url: 'https://videos.pexels.com/video-files/7955311/7955311-hd_1920_1080_30fps.mp4' },
  { keyword: /wearable|reloj|smartwatch|pulsera|fitness|deporte|entrenar|health|salud/i, url: 'https://videos.pexels.com/video-files/4761732/4761732-hd_1920_1080_25fps.mp4' },
  { keyword: /mouse|rat\u00f3n|click/i, url: 'https://videos.pexels.com/video-files/3252021/3252021-hd_1920_1080_25fps.mp4' },
  { keyword: /carga|cargador|cable|poder|power|energ\u00eda/i, url: 'https://videos.pexels.com/video-files/8112441/8112441-hd_1920_1080_30fps.mp4' },
]
const FALLBACK_VIDEO = 'https://videos.pexels.com/video-files/3195394/3195394-hd_1920_1080_25fps.mp4'
function pickVideo(title, description) {
  const haystack = `${title || ''} ${description || ''}`
  for (const item of FEED_VIDEOS) if (item.keyword.test(haystack)) return item.url
  return FALLBACK_VIDEO
}

async function sendOrderEmail({ to, orderId, trackingToken, status, estimatedDelivery }) {
  const trackingUrl = `${process.env.PUBLIC_WEB_URL ?? 'http://localhost:5173'}/pedido/${trackingToken}`
  const subject = `Vertamart — pedido #${orderId} actualizado`
  const text = `Tu pedido #${orderId} está ${status}. Consulta el estado aquí: ${trackingUrl}${estimatedDelivery ? ` Fecha estimada: ${estimatedDelivery}.` : ''}`
  if (process.env.EMAIL_API_URL && process.env.EMAIL_API_KEY) {
    const response = await fetch(process.env.EMAIL_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.EMAIL_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM ?? 'Vertamart <no-reply@example.com>', to: [to], subject, text }),
    })
    if (!response.ok) throw new Error(`Proveedor de correo respondió ${response.status}`)
    return { sent: true, mode: 'provider', trackingUrl }
  }
  console.log(`[email-demo] to=${to} subject="${subject}" url=${trackingUrl}`)
  return { sent: false, mode: 'demo', trackingUrl }
}

// Cuenta administrador inicial (el "creador de la web")
const seedAdmin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get()
if (!seedAdmin) {
  const hash = bcrypt.hashSync('admin123', SALT_ROUNDS)
  db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')").run(
    'Administrador',
    'admin@vertamart.es',
    hash,
  )
  console.log('• Cuenta admin creada: admin@vertamart.es / admin123')
}

// Cuenta especial de soporte: solo puede usar el chat.
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL ?? 'support@vertamart.es'
const SUPPORT_PASSWORD = process.env.SUPPORT_PASSWORD ?? 'soporte123'
const SUPPORT_PASSWORD_HASH = bcrypt.hashSync(SUPPORT_PASSWORD, SALT_ROUNDS)
const existingSupport = db.prepare('SELECT id FROM users WHERE email = ?').get(SUPPORT_EMAIL)
if (!existingSupport) {
  db.prepare("INSERT INTO users (name, email, password_hash, role, country) VALUES (?, ?, ?, 'support', 'ES')")
    .run('Soporte Vertamart', SUPPORT_EMAIL, SUPPORT_PASSWORD_HASH)
} else {
  db.prepare("UPDATE users SET name = 'Soporte Vertamart', role = 'support', country = 'ES' WHERE id = ?").run(existingSupport.id)
}
const supportUser = db.prepare("SELECT id FROM users WHERE email = ? AND role = 'support'").get(SUPPORT_EMAIL)
if (supportUser) {
  db.prepare("INSERT OR IGNORE INTO contacts (owner_id, user_id) SELECT id, ? FROM users WHERE id != ?").run(supportUser.id, supportUser.id)
  db.prepare("INSERT OR IGNORE INTO contacts (owner_id, user_id) SELECT ?, id FROM users WHERE id != ?").run(supportUser.id, supportUser.id)
}

// Ejemplos del feed: se crean una sola vez y no afectan las publicaciones reales.
if (db.prepare('SELECT COUNT(*) AS count FROM feed_posts').get().count === 0) {
  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get()
  const first = db.prepare('SELECT id, name, product_code FROM products ORDER BY id LIMIT 3').all()
  const examples = [
    ['Setup premium para trabajar mejor', 'Descubre cómo mejorar tu escritorio con accesorios Verta.', 'https://videos.pexels.com/video-files/3195394/3195394-hd_1920_1080_25fps.mp4'],
    ['Audio para todos tus viajes', 'Sonido limpio, batería larga y cancelación de ruido.', 'https://videos.pexels.com/video-files/853800/853800-hd_1920_1080_25fps.mp4'],
    ['Mi setup gaming actualizado', 'Una configuración cómoda para jugar y crear contenido.', 'https://videos.pexels.com/video-files/3205627/3205627-hd_1920_1080_25fps.mp4'],
  ]
  for (let i = 0; i < examples.length; i++) {
    const product = first[i]
    db.prepare('INSERT INTO feed_posts (user_id, product_id, title, description, video_url) VALUES (?, ?, ?, ?, ?)').run(admin.id, product ? String(product.id) : null, examples[i][0], examples[i][1], examples[i][2])
  }
}

// Catálogo de la tienda: se siembra una sola vez para que TODOS los productos
// (incluso los de la tienda) tengan código de producto y aparezcan en el panel.
function seedStoreCatalog() {
  const px = (id, w = 800) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}`
  const STORE = [
    ['auriculares-verta-air-pro', 'Verta Air Pro ANC', 'audio', 59990, 79990, 34, 'top', px(36625733), [px(36625733), px(30981655)]],
    ['smartwatch-verta-pulse-s2', 'Verta Pulse S2', 'wearables', 89990, 119990, 22, 'nuevo', px(4041181), [px(4041181)]],
    ['teclado-mecanico-verta-ke65', 'Verta KE65 Mec\u00e1nico', 'teclado', 54990, 69990, 48, 'popular', px(7915239), [px(7915239)]],
    ['mouse-inalambrico-verta-gear-x', 'Verta Gear X Pro', 'mouse', 29990, 39990, 60, null, px(2115256), [px(2115256)]],
    ['cargador-gan-verta-100w', 'Verta GaN Charge 100W', 'carga', 34990, 44990, 80, 'top', px(4219868), [px(4219868)]],
    ['monitor-verta-pro-27', 'Verta Pro 27" 2K 165Hz', 'monitor', 329990, 399990, 11, 'popular', px(777001), [px(777001), px(1714208)]],
    ['auriculares-over-ear-verta-studio', 'Verta Studio One ANC', 'audio', 99990, 129990, 27, null, px(29377913), [px(29377913), px(33174697)]],
    ['pulsera-fitness-verta-fit-lite', 'Verta Fit Lite', 'wearables', 29990, 39990, 90, null, px(1080751), [px(1080751)]],
    ['teclado-bluetooth-verta-mini', 'Verta Mini BT 75%', 'teclado', 49990, 64990, 36, null, px(18382823), [px(18382823)]],
    ['cable-usbc-silicona-verta', 'Verta Cable USB-C 100W', 'carga', 9990, 14990, 300, null, px(3921711), [px(3921711)]],
    ['mouse-verta-max-pad', 'Verta Max Pad RGB', 'mouse', 24990, 34990, 55, null, px(27559487), [px(27559487)]],
    ['monitor-verta-gaming-24', 'Verta Sport 24" 180Hz', 'monitor', 189990, 239990, 18, null, px(668296), [px(668296)]],
    ['bocina-verta-boom-360', 'Verta Boom 360', 'audio', 49990, 64990, 40, 'nuevo', px(1034653), [px(1034653)]],
    ['auriculares-gamer-verta-one', 'Verta Gaming One', 'audio', 44990, 59990, 25, 'popular', px(18966439), [px(18966439)]],
    ['smartband-verta-band-pro-2', 'Verta Band Pro 2', 'wearables', 39990, 49990, 75, null, px(11617965), [px(11617965)]],
    ['smartwatch-verta-sport-ultra', 'Verta Sport Ultra', 'wearables', 149990, 189990, 15, 'top', px(3999644), [px(3999644)]],
    ['teclado-verta-key-100', 'Verta Key 100% RGB', 'teclado', 64990, 79990, 30, null, px(14130157), [px(14130157)]],
    ['mouse-ergonomico-verta-ergo', 'Verta Ergo Wireless', 'mouse', 19990, 27990, 95, null, px(32755759), [px(32755759)]],
    ['powerbank-verta-20000', 'Verta Power 20K', 'carga', 24990, 32990, 120, 'popular', px(10104284), [px(10104284)]],
    ['cargador-inalambrico-verta-pad', 'Verta Pad Qi 15W', 'carga', 22990, 29990, 85, null, px(7952558), [px(7952558)]],
    ['hub-usbc-verta-8en1', 'Verta Hub USB-C 8-en-1', 'carga', 29990, 39990, 45, null, px(30708285), [px(30708285)]],
    ['monitor-verta-ultrawide-34', 'Verta UltraWide 34" Curvo', 'monitor', 549990, 649990, 9, 'top', px(10130153), [px(10130153)]],
    ['monitor-portatil-verta-view-15', 'Verta View 15.6" Port\u00e1til', 'monitor', 159990, 199990, 20, 'nuevo', px(6045231), [px(6045231)]],
    ['mousepad-verta-speed-xl', 'Verta Speed XL Pro', 'mouse', 14990, 19990, 110, null, px(8576158), [px(8576158)]],
  ]
  const insert = db.prepare(
    `INSERT OR IGNORE INTO products
      (owner_id, name, slug, category, price, old_price, rating, reviews, stock, badge, description, features, image, images, product_code)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, '', '[]', ?, ?, ?)`,
  )
  // Asigna código incluso a productos de la tienda que ya existieran sin uno.
  const backfill = db.prepare('UPDATE products SET product_code = ? WHERE slug = ? AND product_code IS NULL AND owner_id IS NULL')
  for (const [slug, name, category, price, oldPrice, stock, badge, image, images] of STORE) {
    const code = `VT-${crypto.createHash('sha1').update(slug).digest('hex').slice(0, 8).toUpperCase()}`
    insert.run(null, name, slug, category, price, oldPrice, stock, badge, image, JSON.stringify(images), code)
    backfill.run(code, slug)
  }
}
seedStoreCatalog()

/* ============================== AUTH ================================= */

app.post('/api/auth/register', (req, res) => {
  const name = String(req.body?.name ?? '').trim()
  const email = String(req.body?.email ?? '').trim().toLowerCase()
  const password = String(req.body?.password ?? '')

  if (name.length < 2) return fail(res, 400, 'El nombre debe tener al menos 2 caracteres', 'INVALID_NAME')
  if (!EMAIL_RE.test(email)) return fail(res, 400, 'Correo electrónico no válido', 'INVALID_EMAIL')
  if (password.length < 6) return fail(res, 400, 'La contraseña debe tener al menos 6 caracteres', 'WEAK_PASSWORD')

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
  if (exists) return fail(res, 409, 'Ya existe una cuenta con este correo', 'EMAIL_TAKEN')

  const hash = bcrypt.hashSync(password, SALT_ROUNDS)
  const info = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)').run(name, email, hash)
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid)
  const token = createSession(user.id)
  if (supportUser) db.prepare('INSERT OR IGNORE INTO contacts (owner_id, user_id) VALUES (?, ?)').run(user.id, supportUser.id)

  return ok(res, { token, user: publicUser(user) }, 201)
})

app.get('/api/auth/email-availability', (req, res) => {
  const email = String(req.query?.email ?? '').trim().toLowerCase()
  if (!EMAIL_RE.test(email)) return ok(res, { valid: false, available: false })
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
  return ok(res, { valid: true, available: !exists })
})

const supportLoginHandler = (req, res) => {
  const password = String(req.body?.password ?? '')
  if (!password || !bcrypt.compareSync(password, SUPPORT_PASSWORD_HASH)) {
    return fail(res, 401, 'Contraseña de soporte incorrecta', 'INVALID_SUPPORT_PASSWORD')
  }
  const user = db.prepare("SELECT * FROM users WHERE email = ? AND role = 'support'").get(SUPPORT_EMAIL)
  if (!user) return fail(res, 503, 'La cuenta de soporte no está disponible', 'SUPPORT_UNAVAILABLE')
  const token = createSession(user.id)
  return ok(res, { token, user: publicUser(user) })
}

// Se mantienen ambas rutas para compatibilidad con bundles antiguos.
app.post('/api/auth/support-login', supportLoginHandler)
app.post('/api/auth/support/login', supportLoginHandler)

app.post('/api/auth/login', (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase()
  const password = String(req.body?.password ?? '')

  if (!EMAIL_RE.test(email) || !password) {
    return fail(res, 400, 'Ingresa tu correo y contraseña', 'INVALID_CREDENTIALS')
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return fail(res, 401, 'Correo o contraseña incorrectos', 'INVALID_CREDENTIALS')
  }

  const token = createSession(user.id)
  return ok(res, { token, user: publicUser(user) })
})

app.get('/api/auth/me', requireAuth, (req, res) => ok(res, { user: req.user }))

/** Actualiza el perfil del usuario autenticado (nombre y/o país). */
app.patch('/api/auth/me', requireAuth, (req, res) => {
  const name = req.body?.name !== undefined ? String(req.body.name).trim() : undefined
  const country = req.body?.country !== undefined ? String(req.body.country).trim().toUpperCase() : undefined

  if (name !== undefined && name.length < 2) return fail(res, 400, 'El nombre debe tener al menos 2 caracteres', 'INVALID_NAME')
  if (country !== undefined && !/^[A-Z]{2}$/.test(country)) return fail(res, 400, 'País no válido', 'INVALID_COUNTRY')

  if (name !== undefined) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, req.user.id)
  if (country !== undefined) db.prepare('UPDATE users SET country = ? WHERE id = ?').run(country, req.user.id)

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
  return ok(res, { user: publicUser(updated) })
})

app.post('/api/auth/logout', (req, res) => {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
  res.status(204).end()
})

// Suscripción premium (demo). En un entorno real esto lo confirmaría el proveedor de pagos.
app.post('/api/auth/subscribe', requireAuth, requireCustomer, (req, res) => {
  db.prepare('UPDATE users SET is_premium = 1 WHERE id = ?').run(req.user.id)
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
  return ok(res, { user: publicUser(updated), premiumSince: new Date().toISOString() })
})

app.post('/api/auth/unsubscribe', requireAuth, requireCustomer, (req, res) => {
  db.prepare('UPDATE users SET is_premium = 0 WHERE id = ?').run(req.user.id)
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
  return ok(res, { user: publicUser(updated) })
})

// Estado premium del usuario + cuenta receptora configurada para el checkout.
app.get('/api/auth/subscription', requireAuth, (req, res) => {
  const row = db.prepare('SELECT is_premium FROM users WHERE id = ?').get(req.user.id)
  const payout = db.prepare('SELECT id, provider, label, account_ref FROM payout_accounts WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get()
  const pending = db.prepare("SELECT id, amount, currency, method, status, created_at FROM payout_transactions WHERE user_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1").get(req.user.id)
  return ok(res, {
    isPremium: !!row?.is_premium,
    plan: row?.is_premium ? 'premium' : 'free',
    price: 1.99,
    currency: 'USD',
    interval: 'month',
    payoutConfigured: !!payout,
    payout: payout ? { provider: payout.provider, label: payout.label, maskedRef: payout.account_ref?.slice(0, 5) + (payout.account_ref?.length > 5 ? '***' : '') } : null,
    pending,
  })
})

// Procesa el pago de la suscripción. Al aprobarse, el dinero se acredita
// a la cuenta receptora configurada en el panel y se activa el premium.
app.post('/api/subscription/pay', requireAuth, requireCustomer, (req, res) => {
  const method = String(req.body?.method ?? 'card')
  const card = req.body?.card ?? {}
  if (!['card', 'webpay', 'transfer'].includes(method)) return fail(res, 400, 'Método de pago no válido', 'INVALID_METHOD')

  // El dinero solo puede llegar si hay una cuenta receptora configurada.
  const payout = db.prepare('SELECT * FROM payout_accounts WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get()
  if (!payout) return fail(res, 400, 'No hay una cuenta receptora configurada. El administrador debe configurarla en el Panel → Cuentas.', 'PAYOUT_NOT_CONFIGURED')

  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(req.user.id)
  if (!existing) return fail(res, 404, 'Usuario no encontrado', 'NOT_FOUND')

  // Validar tarjeta si el método es tarjeta (Luhn, como en el checkout).
  let processedStatus = 'approved'
  let transactionId = `VT${crypto.randomBytes(4).toString('hex').toUpperCase()}`
  if (method === 'card') {
    const digits = String(card.number ?? '').replace(/\s/g, '')
    let sum = 0, double = false
    for (let i = digits.length - 1; i >= 0; i--) {
      let d = Number(digits[i])
      if (double) { d *= 2; if (d > 9) d -= 9 }
      sum += d; double = !double
    }
    if (!/^\d{16}$/.test(digits) || sum % 10 !== 0) return fail(res, 400, 'Datos de tarjeta no válidos', 'INVALID_CARD')
    const [m, y] = String(card.expiry ?? '').split('/').map(Number)
    if (m < 1 || m > 12 || new Date(2000 + y, m, 0) < new Date()) return fail(res, 400, 'Tarjeta vencida o fecha no válida', 'INVALID_CARD')
    if (!/^\d{3,4}$/.test(String(card.cvv ?? ''))) return fail(res, 400, 'CVV no válido', 'INVALID_CARD')
    processedStatus = 'approved'
  } else if (method === 'transfer') {
    processedStatus = 'pending' // se confirma manualmente en el panel
  } else {
    processedStatus = 'approved'
  }

  // Registrar la transacción de dinero en la cuenta receptora.
  // Aprobado = dinero ya recibido; transferencia queda pendiente de confirmar.
  const moneyStatus = processedStatus === 'approved' ? 'received' : 'pending'
  const ref = `SUB-${req.user.id}-${Date.now().toString(36).toUpperCase()}`
  const info = db
    .prepare(
      'INSERT INTO payout_transactions (payout_account_id, user_id, type, amount, currency, method, reference, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(payout.id, req.user.id, 'subscription', 1.99, 'USD', method, ref, moneyStatus)
  const tx = db.prepare('SELECT * FROM payout_transactions WHERE id = ?').get(info.lastInsertRowid)

  // Solo al aprobarse se activa el premium.
  if (processedStatus === 'approved') {
    db.prepare('UPDATE users SET is_premium = 1 WHERE id = ?').run(req.user.id)
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
  return ok(res, {
    status: processedStatus,
    transactionId,
    reference: ref,
    isPremium: !!user.is_premium,
    creditedTo: { provider: payout.provider, label: payout.label },
    message: processedStatus === 'approved' ? `Pago aprobado. Se acreditaron US$1.99 a ${payout.label}.` : 'Transferencia en revisión: se activará al confirmarla en el panel.',
  }, processedStatus === 'approved' ? 201 : 202)
})

/* ===================== PRODUCTOS (catálogo + usuarios) ================ */

// Catálogo público: productos activos (mock del frontend + estos se mezclan en el cliente)
app.get('/api/products', (req, res) => {
  const rows = db
    .prepare(`SELECT p.*, u.name AS owner_name FROM products p LEFT JOIN users u ON u.id = p.owner_id WHERE p.status = 'active' ORDER BY p.created_at DESC`)
    .all()
  paginate(res, rows.map(productToApi))
})

// Mis publicaciones
app.get('/api/products/mine', requireAuth, (req, res) => {
  const rows = db
    .prepare(`SELECT p.*, u.name AS owner_name FROM products p LEFT JOIN users u ON u.id = p.owner_id WHERE p.owner_id = ? ORDER BY p.created_at DESC`)
    .all(req.user.id)
  paginate(res, rows.map(productToApi))
})

// Publicar un producto (requiere sesión)
app.post('/api/products', requireAuth, requireCustomer, (req, res) => {
  const name = String(req.body?.name ?? '').trim()
  const description = String(req.body?.description ?? '').trim()
  const category = String(req.body?.category ?? 'audio').trim()
  const price = Number(req.body?.price)
  const oldPrice = req.body?.oldPrice ? Number(req.body.oldPrice) : null
  const stock = Number(req.body?.stock ?? 10)
  const image = String(req.body?.image ?? '').trim()
  const features = Array.isArray(req.body?.features) ? req.body.features.map(String) : []
  const badge = req.body?.badge ? String(req.body.badge) : null
  const warranty = req.body?.warranty ? String(req.body.warranty).trim() : null
  const shipDays = req.body?.shipDays !== undefined ? Number(req.body.shipDays) : 2
  const productCode = `VT-${crypto.randomBytes(4).toString('hex').toUpperCase()}`

  if (name.length < 3) return fail(res, 400, 'El nombre debe tener al menos 3 caracteres', 'INVALID_NAME')
  if (!Number.isFinite(price) || price <= 0) return fail(res, 400, 'El precio debe ser mayor a 0', 'INVALID_PRICE')
  if (!Number.isInteger(stock) || stock < 0) return fail(res, 400, 'El stock no es válido', 'INVALID_STOCK')
  if (!Number.isInteger(shipDays) || shipDays < 0 || shipDays > 90) return fail(res, 400, 'Tiempo de envío no válido', 'INVALID_SHIP_DAYS')
  if (warranty && warranty.length > 80) return fail(res, 400, 'La garantía es demasiado larga', 'INVALID_WARRANTY')
  if (image && !/^(https?:\/\/|data:image\/)/.test(image)) return fail(res, 400, 'La imagen debe ser una URL o un archivo de imagen válido', 'INVALID_IMAGE')

  const base = slugify(name) || 'producto'
  let slug = base
  let n = 1
  while (db.prepare('SELECT id FROM products WHERE slug = ?').get(slug)) {
    slug = `${base}-${Date.now().toString(36).slice(-4)}${n++}`
  }

  const info = db
    .prepare(
      `INSERT INTO products (owner_id, name, slug, category, price, old_price, stock, badge, description, features, image, product_code, warranty, ship_days)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(req.user.id, name, slug, category, price, oldPrice, stock, badge, description, JSON.stringify(features), image, productCode, warranty, shipDays)

  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid)
  return ok(res, productToApi(row), 201)
})

// Editar producto propio (o cualquier producto si eres admin)
app.patch('/api/products/:id', requireAuth, requireCustomer, (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(req.params.id))
  if (!row) return fail(res, 404, 'Producto no encontrado', 'NOT_FOUND')
  if (row.owner_id !== req.user.id && req.user.role !== 'admin') {
    return fail(res, 403, 'No tienes permisos sobre este producto', 'FORBIDDEN')
  }

  const fields = ['name', 'description', 'category', 'stock', 'image', 'badge', 'warranty']
  const sets = []
  const values = []
  for (const f of fields) {
    if (req.body?.[f] !== undefined) {
      sets.push(`${f} = ?`)
      values.push(String(req.body[f]).trim())
    }
  }
  if (req.body?.shipDays !== undefined) {
    const shipDays = Number(req.body.shipDays)
    if (!Number.isInteger(shipDays) || shipDays < 0 || shipDays > 90) return fail(res, 400, 'Tiempo de envío no válido', 'INVALID_SHIP_DAYS')
    sets.push('ship_days = ?')
    values.push(shipDays)
  }
  if (req.body?.price !== undefined) {
    sets.push('price = ?')
    values.push(Number(req.body.price))
  }
  if (req.body?.oldPrice !== undefined) {
    sets.push('old_price = ?')
    values.push(req.body.oldPrice ? Number(req.body.oldPrice) : null)
  }
  if (req.body?.features !== undefined) {
    sets.push('features = ?')
    values.push(JSON.stringify(req.body.features.map(String)))
  }
  if (req.body?.status !== undefined) {
    if (!PRODUCT_STATUSES.includes(req.body.status)) return fail(res, 400, 'Estado no válido', 'INVALID_STATUS')
    sets.push('status = ?')
    values.push(req.body.status)
  }
  if (sets.length === 0) return fail(res, 400, 'No hay campos para actualizar', 'EMPTY_UPDATE')

  values.push(row.id)
  db.prepare(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(row.id)
  return ok(res, productToApi(updated))
})

// Eliminar producto propio (o cualquier producto si eres admin)
app.delete('/api/products/:id', requireAuth, requireCustomer, (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(req.params.id))
  if (!row) return fail(res, 404, 'Producto no encontrado', 'NOT_FOUND')
  if (row.owner_id !== req.user.id && req.user.role !== 'admin') {
    return fail(res, 403, 'No tienes permisos sobre este producto', 'FORBIDDEN')
  }
  db.prepare('DELETE FROM products WHERE id = ?').run(row.id)
  res.status(204).end()
})

/* ============== PERFILES, SEGUIR Y CHAT ENTRE USUARIOS ============== */

// Perfil público de un usuario (con estadísticas y estado de seguimiento)
app.get('/api/users/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.params.id))
  if (!row) return fail(res, 404, 'Usuario no encontrado', 'NOT_FOUND')
  const viewer = getUserFromToken(req)
  return ok(res, publicProfile(row, viewer?.id))
})

// Productos activos publicados por un usuario
app.get('/api/users/:id/products', (req, res) => {
  const row = db.prepare('SELECT id FROM users WHERE id = ?').get(Number(req.params.id))
  if (!row) return fail(res, 404, 'Usuario no encontrado', 'NOT_FOUND')
  const rows = db
    .prepare(
      `SELECT p.*, u.name AS owner_name FROM products p
       LEFT JOIN users u ON u.id = p.owner_id
       WHERE p.owner_id = ? AND p.status = 'active'
       ORDER BY p.created_at DESC`,
    )
    .all(row.id)
  paginate(res, rows.map(productToApi))
})

// Seguir a un usuario
app.post('/api/users/:id/follow', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  if (id === req.user.id) return fail(res, 400, 'No puedes seguirte a ti mismo', 'SELF_FOLLOW')
  const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id)
  if (!target) return fail(res, 404, 'Usuario no encontrado', 'NOT_FOUND')
  if (target.role === 'support') return fail(res, 400, 'El soporte está disponible automáticamente en tu chat', 'SUPPORT_AUTO_CONTACT')
  db.prepare('INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)').run(req.user.id, id)
  return ok(res, publicProfile(db.prepare('SELECT * FROM users WHERE id = ?').get(id), req.user.id))
})

// Dejar de seguir
app.delete('/api/users/:id/follow', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(id)
  if (!target) return fail(res, 404, 'Usuario no encontrado', 'NOT_FOUND')
  db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(req.user.id, id)
  return ok(res, publicProfile(db.prepare('SELECT * FROM users WHERE id = ?').get(id), req.user.id))
})

// Usuarios que sigo (para poder iniciar chats)
app.get('/api/me/following', requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.id, u.name, u.country, f.created_at AS followed_at
       FROM follows f JOIN users u ON u.id = f.following_id
       WHERE f.follower_id = ? ORDER BY f.created_at DESC`,
    )
    .all(req.user.id)
  ok(res, { items: rows })
})

// Conversaciones: personas con las que he hablado o a las que sigo
app.get('/api/conversations', requireAuth, (req, res) => {
  const me = req.user.id
  const rows = db
    .prepare(
      `SELECT u.id AS user_id, u.name, u.role, u.country,
        (SELECT m.content FROM messages m
         WHERE (m.sender_id = u.id AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = u.id)
         ORDER BY m.id DESC LIMIT 1) AS last_message,
        (SELECT m.created_at FROM messages m
         WHERE (m.sender_id = u.id AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = u.id)
         ORDER BY m.id DESC LIMIT 1) AS last_at,
        (SELECT COUNT(*) FROM messages m WHERE m.sender_id = u.id AND m.receiver_id = ? AND m.is_read = 0) AS unread_count
       FROM users u
       WHERE u.id != ?
         AND (
           ? = 'support'
           OR u.role = 'support'
           OR EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.following_id = u.id)
           OR EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = u.id AND f.following_id = ?)           OR EXISTS (SELECT 1 FROM messages m
              WHERE (m.sender_id = u.id AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = u.id)
         )
           OR u.role = 'support'
         )
       ORDER BY last_at DESC`,
    )
    .all(me, me, me, me, me, me, req.user.role, me, me, me, me)
  ok(res, {
    items: rows.map((r) => ({
      userId: r.user_id,
      name: r.name,
      role: r.role,
      country: r.country,
      lastMessage: r.last_message,
      lastAt: r.last_at,
      unreadCount: r.unread_count,
    })),
  })
})

// Mensajes de una conversación (marca los recibidos como leídos)
app.get('/api/conversations/:userId/messages', requireAuth, (req, res) => {
  const otherId = Number(req.params.userId)
  const other = db.prepare('SELECT id FROM users WHERE id = ?').get(otherId)
  if (!other) return fail(res, 404, 'Usuario no encontrado', 'NOT_FOUND')
  db.prepare('UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ?').run(otherId, req.user.id)
  const rows = db
    .prepare(
      `SELECT id, sender_id, receiver_id, content, image_url, is_read, edited_at, deleted_at, created_at
       FROM messages
       WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
       ORDER BY id ASC`,
    )
    .all(otherId, req.user.id, req.user.id, otherId)
  ok(res, {
    items: rows.map((r) => ({
      id: r.id,
      senderId: r.sender_id,
      receiverId: r.receiver_id,
      content: r.deleted_at ? '' : r.content,
      imageUrl: r.deleted_at ? null : r.image_url,
      isRead: r.is_read,
      editedAt: r.edited_at,
      deletedAt: r.deleted_at,
      createdAt: r.created_at,
    })),
  })
})

// Enviar mensaje (requiere seguir al otro usuario, que te siga, o conversación previa)
app.post('/api/conversations/:userId/messages', requireAuth, (req, res) => {
  const otherId = Number(req.params.userId)
  const content = String(req.body?.content ?? '').trim()
  const imageUrl = req.body?.imageUrl ? String(req.body.imageUrl).trim() : null
  if (!content && !imageUrl) return fail(res, 400, 'El mensaje no puede estar vacío', 'EMPTY_MESSAGE')
  if (content.length > MESSAGE_MAX_LENGTH) return fail(res, 400, 'El mensaje es demasiado largo', 'MESSAGE_TOO_LONG')
  // Admite tanto URLs externas como imágenes subidas del dispositivo (data URLs base64).
  if (imageUrl && !/^(https?:\/\/|data:image\/)/.test(imageUrl)) return fail(res, 400, 'La imagen debe ser una URL o un archivo de imagen válido', 'INVALID_IMAGE')

  const other = db.prepare('SELECT id FROM users WHERE id = ?').get(otherId)
  if (!other) return fail(res, 404, 'Usuario no encontrado', 'NOT_FOUND')
  if (otherId === req.user.id) return fail(res, 400, 'No puedes enviarte mensajes a ti mismo', 'SELF_MESSAGE')

  const canChat =
    !!db.prepare("SELECT 1 FROM users WHERE id = ? AND role = 'support'").get(otherId) ||
    !!db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(req.user.id, otherId) ||
    !!db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(otherId, req.user.id) ||
    !!db
      .prepare(
        'SELECT 1 FROM messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?) LIMIT 1',
      )
      .get(req.user.id, otherId, otherId, req.user.id)
  if (!canChat) {
    return fail(res, 403, 'Sigue a este usuario para poder chatear', 'FOLLOW_REQUIRED')
  }

  const info = db
    .prepare('INSERT INTO messages (sender_id, receiver_id, content, image_url) VALUES (?, ?, ?, ?)')
    .run(req.user.id, otherId, content, imageUrl)
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid)
  return ok(res, {
    id: row.id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    content: row.deleted_at ? '' : row.content,
    imageUrl: row.deleted_at ? null : row.image_url,
    isRead: row.is_read,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
  }, 201)
})

// Editar o eliminar únicamente tus propios mensajes
app.patch('/api/messages/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const row = db.prepare('SELECT * FROM messages WHERE id = ? AND sender_id = ? AND deleted_at IS NULL').get(id, req.user.id)
  if (!row) return fail(res, 404, 'Mensaje no encontrado', 'NOT_FOUND')
  const content = String(req.body?.content ?? '').trim()
  if (!content || content.length > MESSAGE_MAX_LENGTH) return fail(res, 400, 'Contenido no válido', 'INVALID_CONTENT')
  db.prepare("UPDATE messages SET content = ?, edited_at = datetime('now') WHERE id = ?").run(content, id)
  const updated = db.prepare('SELECT * FROM messages WHERE id = ?').get(id)
  return ok(res, { id: updated.id, senderId: updated.sender_id, receiverId: updated.receiver_id, content: updated.content, imageUrl: updated.image_url, editedAt: updated.edited_at, isRead: updated.is_read, createdAt: updated.created_at })
})

app.delete('/api/messages/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  const result = db.prepare("UPDATE messages SET content = '', image_url = NULL, deleted_at = datetime('now') WHERE id = ? AND sender_id = ? AND deleted_at IS NULL").run(id, req.user.id)
  if (result.changes === 0) return fail(res, 404, 'Mensaje no encontrado', 'NOT_FOUND')
  res.status(204).end()
})

// Bloqueo, desbloqueo y eliminación de contactos
app.post('/api/users/:id/block', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  if (id === req.user.id || !db.prepare('SELECT id FROM users WHERE id = ?').get(id)) return fail(res, 400, 'Usuario no válido', 'INVALID_USER')
  db.prepare('INSERT OR IGNORE INTO blocked_users (blocker_id, blocked_id) VALUES (?, ?)').run(req.user.id, id)
  return ok(res, { blocked: true, userId: id })
})
app.delete('/api/users/:id/block', requireAuth, (req, res) => {
  db.prepare('DELETE FROM blocked_users WHERE blocker_id = ? AND blocked_id = ?').run(req.user.id, Number(req.params.id))
  return ok(res, { blocked: false, userId: Number(req.params.id) })
})
app.delete('/api/contacts/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id)
  db.prepare('DELETE FROM contacts WHERE owner_id = ? AND user_id = ?').run(req.user.id, id)
  db.prepare('DELETE FROM follows WHERE (follower_id = ? AND following_id = ?) OR (follower_id = ? AND following_id = ?)').run(req.user.id, id, id, req.user.id)
  res.status(204).end()
})

/* ============================ RESEÑAS ================================= */

// Reseñas de un producto (públicas)
app.get('/api/products/:id/reviews', (req, res) => {
  const rows = db
    .prepare(
      `SELECT r.id, r.product_id, r.user_id, r.rating, r.content, r.created_at, u.name AS user_name
       FROM reviews r LEFT JOIN users u ON u.id = r.user_id
       WHERE r.product_id = ?
       ORDER BY r.id DESC`,
    )
    .all(String(req.params.id))
  paginate(
    res,
    rows.map((r) => ({
      id: r.id,
      productId: r.product_id,
      userId: r.user_id,
      userName: r.user_name ?? 'Usuario',
      rating: r.rating,
      content: r.content,
      createdAt: r.created_at,
    })),
  )
})

// Crear o actualizar tu reseña de un producto (requiere sesión)
app.post('/api/products/:id/reviews', requireAuth, requireCustomer, (req, res) => {
  const productId = String(req.params.id)
  const rating = Number(req.body?.rating)
  const content = String(req.body?.content ?? '').trim()

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return fail(res, 400, 'La valoración debe ser de 1 a 5', 'INVALID_RATING')
  }
  if (content.length < 3) return fail(res, 400, 'Escribe un comentario (mínimo 3 caracteres)', 'INVALID_CONTENT')
  if (content.length > 1000) return fail(res, 400, 'El comentario es demasiado largo', 'CONTENT_TOO_LONG')

  // Una reseña por usuario y producto: se reemplaza la anterior
  db.prepare('DELETE FROM reviews WHERE product_id = ? AND user_id = ?').run(productId, req.user.id)
  const info = db
    .prepare('INSERT INTO reviews (product_id, user_id, rating, content) VALUES (?, ?, ?, ?)')
    .run(productId, req.user.id, rating, content)

  // Si el producto vive en la BD (publicado por un usuario), recalcula su valoración media
  db.prepare(
    `UPDATE products SET
       rating = ROUND((SELECT AVG(rating) FROM reviews WHERE product_id = ?), 1),
       reviews = (SELECT COUNT(*) FROM reviews WHERE product_id = ?)
     WHERE CAST(id AS TEXT) = ?`,
  ).run(productId, productId, productId)

  const row = db.prepare('SELECT * FROM reviews WHERE id = ?').get(info.lastInsertRowid)
  return ok(res, {
    id: row.id,
    productId: row.product_id,
    userId: row.user_id,
    userName: req.user.name,
    rating: row.rating,
    content: row.content,
    createdAt: row.created_at,
  }, 201)
})

// Eliminar tu propia reseña
app.delete('/api/products/:id/reviews', requireAuth, (req, res) => {
  const productId = String(req.params.id)
  const info = db.prepare('DELETE FROM reviews WHERE product_id = ? AND user_id = ?').run(productId, req.user.id)
  if (info.changes === 0) return fail(res, 404, 'No tienes reseña en este producto', 'NOT_FOUND')

  db.prepare(
    `UPDATE products SET
       rating = COALESCE(ROUND((SELECT AVG(rating) FROM reviews WHERE product_id = ?), 1), 4.5),
       reviews = (SELECT COUNT(*) FROM reviews WHERE product_id = ?)
     WHERE CAST(id AS TEXT) = ?`,
  ).run(productId, productId, productId)

  res.status(204).end()
})

/* ============================ FEED ==================================== */

function feedPostToApi(row, viewerId) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    productId: row.product_id,
    productCode: row.product_code ?? null,
    productName: row.product_name ?? null,
    title: row.title,
    description: row.description,
    videoUrl: row.video_url,
    likesCount: row.likes_count,
    liked: viewerId ? !!db.prepare('SELECT 1 FROM feed_likes WHERE post_id = ? AND user_id = ?').get(row.id, viewerId) : false,
    commentsCount: row.comments_count ?? 0,
    createdAt: row.created_at,
  }
}

app.get('/api/feed', (req, res) => {
  const viewer = getUserFromToken(req)
  const rows = db.prepare(
    `SELECT f.*, u.name AS user_name, p.name AS product_name, p.product_code,
      (SELECT COUNT(*) FROM feed_comments c WHERE c.post_id = f.id) AS comments_count
     FROM feed_posts f JOIN users u ON u.id = f.user_id
     LEFT JOIN products p ON CAST(p.id AS TEXT) = f.product_id
     ORDER BY f.id DESC`,
  ).all()
  paginate(res, rows.map((r) => feedPostToApi(r, viewer?.id)))
})

app.get('/api/feed/mine', requireAuth, requireCustomer, (req, res) => {
  const rows = db.prepare(`
    SELECT f.*, u.name AS user_name, p.name AS product_name, p.product_code,
      (SELECT COUNT(*) FROM feed_comments c WHERE c.post_id = f.id) AS comments_count
    FROM feed_posts f JOIN users u ON u.id = f.user_id
    LEFT JOIN products p ON CAST(p.id AS TEXT) = f.product_id
    WHERE f.user_id = ? ORDER BY f.id DESC
  `).all(req.user.id)
  paginate(res, rows.map((row) => feedPostToApi(row, req.user.id)))
})

app.post('/api/feed', requireAuth, requireCustomer, (req, res) => {
  const title = String(req.body?.title ?? '').trim()
  const description = String(req.body?.description ?? '').trim()
  const videoUrl = String(req.body?.videoUrl ?? '').trim()
  const productCode = String(req.body?.productCode ?? '').trim()
  if (title.length < 3) return fail(res, 400, 'El título debe tener al menos 3 caracteres', 'INVALID_TITLE')
  if (description.length < 3) return fail(res, 400, 'La descripción es obligatoria', 'INVALID_DESCRIPTION')
  // Si no se indica un video, se asigna uno relacionado con el título/descripción.
  const resolvedVideo = videoUrl ? videoUrl : pickVideo(title, description)
  if (!/^(https?:\/\/|data:video\/)/.test(resolvedVideo)) return fail(res, 400, 'El video debe ser una URL http(s) o una grabación de vídeo válida', 'INVALID_VIDEO')
  let productId = null
  if (productCode) {
    const product = db.prepare('SELECT id FROM products WHERE product_code = ?').get(productCode)
    if (!product) return fail(res, 404, 'Código de producto no encontrado', 'PRODUCT_CODE_NOT_FOUND')
    productId = String(product.id)
  }
  const info = db.prepare('INSERT INTO feed_posts (user_id, product_id, title, description, video_url) VALUES (?, ?, ?, ?, ?)').run(req.user.id, productId, title, description, resolvedVideo)
  const row = db.prepare(`SELECT f.*, u.name AS user_name, p.name AS product_name, p.product_code, 0 AS comments_count FROM feed_posts f JOIN users u ON u.id=f.user_id LEFT JOIN products p ON CAST(p.id AS TEXT)=f.product_id WHERE f.id=?`).get(info.lastInsertRowid)
  return ok(res, feedPostToApi(row, req.user.id), 201)
})

app.patch('/api/feed/:id', requireAuth, requireCustomer, (req, res) => {
  const id = Number(req.params.id)
  const row = db.prepare('SELECT * FROM feed_posts WHERE id = ?').get(id)
  if (!row) return fail(res, 404, 'Publicación no encontrada', 'NOT_FOUND')
  if (row.user_id !== req.user.id) return fail(res, 403, 'No tienes permisos sobre esta publicación', 'FORBIDDEN')

  const title = req.body?.title !== undefined ? String(req.body.title).trim() : row.title
  const description = req.body?.description !== undefined ? String(req.body.description).trim() : row.description
  const videoUrl = req.body?.videoUrl !== undefined ? String(req.body.videoUrl).trim() : row.video_url
  const productCode = req.body?.productCode !== undefined ? String(req.body.productCode).trim() : null
  if (title.length < 3) return fail(res, 400, 'El título debe tener al menos 3 caracteres', 'INVALID_TITLE')
  if (description.length < 3) return fail(res, 400, 'La descripción es obligatoria', 'INVALID_DESCRIPTION')
  if (!/^(https?:\/\/|data:(?:video|image)\/)/.test(videoUrl)) return fail(res, 400, 'El archivo multimedia no es válido', 'INVALID_MEDIA')

  let productId = row.product_id
  if (productCode !== null) {
    if (!productCode) productId = null
    else {
      const product = db.prepare('SELECT id FROM products WHERE product_code = ?').get(productCode)
      if (!product) return fail(res, 404, 'Código de producto no encontrado', 'PRODUCT_CODE_NOT_FOUND')
      productId = String(product.id)
    }
  }
  db.prepare('UPDATE feed_posts SET title = ?, description = ?, video_url = ?, product_id = ? WHERE id = ?').run(title, description, videoUrl, productId, id)
  const updated = db.prepare(`SELECT f.*, u.name AS user_name, p.name AS product_name, p.product_code, 0 AS comments_count FROM feed_posts f JOIN users u ON u.id=f.user_id LEFT JOIN products p ON CAST(p.id AS TEXT)=f.product_id WHERE f.id=?`).get(id)
  return ok(res, feedPostToApi(updated, req.user.id))
})

app.delete('/api/feed/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM feed_posts WHERE id = ?').get(Number(req.params.id))
  if (!row) return fail(res, 404, 'Publicación no encontrada', 'NOT_FOUND')
  if (row.user_id !== req.user.id && req.user.role !== 'admin') return fail(res, 403, 'No tienes permisos', 'FORBIDDEN')
  db.prepare('DELETE FROM feed_posts WHERE id = ?').run(row.id)
  res.status(204).end()
})

/* ======================== MODERACIÓN ADMIN ============================ */

app.get('/api/admin/moderation/feed', requireAuth, requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT f.id, f.user_id, u.name AS user_name, f.title, f.description, f.video_url, f.created_at,
      (SELECT COUNT(*) FROM feed_comments c WHERE c.post_id = f.id) AS comments_count
    FROM feed_posts f JOIN users u ON u.id = f.user_id
    ORDER BY f.id DESC LIMIT 200
  `).all()
  paginate(res, rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    title: row.title,
    description: row.description,
    videoUrl: row.video_url,
    createdAt: row.created_at,
    commentsCount: row.comments_count,
  })))
})

app.delete('/api/admin/moderation/feed/:id', requireAuth, requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM feed_posts WHERE id = ?').run(Number(req.params.id))
  if (result.changes === 0) return fail(res, 404, 'Publicación no encontrada', 'NOT_FOUND')
  res.status(204).end()
})

app.delete('/api/admin/moderation/comments/:id', requireAuth, requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM feed_comments WHERE id = ?').run(String(req.params.id))
  if (result.changes === 0) return fail(res, 404, 'Comentario no encontrado', 'NOT_FOUND')
  res.status(204).end()
})

app.get('/api/admin/moderation/messages', requireAuth, requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT m.id, m.sender_id, s.name AS sender_name, m.receiver_id, r.name AS receiver_name,
      m.content, m.image_url, m.created_at
    FROM messages m
    JOIN users s ON s.id = m.sender_id
    JOIN users r ON r.id = m.receiver_id
    WHERE m.deleted_at IS NULL
    ORDER BY m.id DESC LIMIT 200
  `).all()
  paginate(res, rows.map((row) => ({
    id: row.id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    receiverId: row.receiver_id,
    receiverName: row.receiver_name,
    content: row.content,
    imageUrl: row.image_url,
    createdAt: row.created_at,
  })))
})

app.delete('/api/admin/moderation/messages/:id', requireAuth, requireAdmin, (req, res) => {
  const result = db.prepare("UPDATE messages SET content = '', image_url = NULL, deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL").run(Number(req.params.id))
  if (result.changes === 0) return fail(res, 404, 'Mensaje no encontrado', 'NOT_FOUND')
  res.status(204).end()
})

app.post('/api/feed/:id/like', requireAuth, requireCustomer, (req, res) => {
  const id = Number(req.params.id)
  if (!db.prepare('SELECT id FROM feed_posts WHERE id = ?').get(id)) return fail(res, 404, 'Publicación no encontrada', 'NOT_FOUND')
  const existing = db.prepare('SELECT 1 FROM feed_likes WHERE post_id = ? AND user_id = ?').get(id, req.user.id)
  if (existing) db.prepare('DELETE FROM feed_likes WHERE post_id = ? AND user_id = ?').run(id, req.user.id)
  else db.prepare('INSERT INTO feed_likes (post_id, user_id) VALUES (?, ?)').run(id, req.user.id)
  const count = db.prepare('SELECT COUNT(*) AS count FROM feed_likes WHERE post_id = ?').get(id).count
  return ok(res, { liked: !existing, likesCount: count })
})

app.get('/api/feed/:id/comments', (req, res) => {
  const rows = db.prepare('SELECT c.id, c.post_id, c.user_id, u.name AS user_name, c.content, c.created_at FROM feed_comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=? ORDER BY c.created_at ASC').all(Number(req.params.id))
  paginate(res, rows.map((r) => ({ id: r.id, postId: r.post_id, userId: r.user_id, userName: r.user_name, content: r.content, createdAt: r.created_at })))
})

app.post('/api/feed/:id/comments', requireAuth, requireCustomer, (req, res) => {
  const postId = Number(req.params.id)
  const content = String(req.body?.content ?? '').trim()
  if (!db.prepare('SELECT id FROM feed_posts WHERE id = ?').get(postId)) return fail(res, 404, 'Publicación no encontrada', 'NOT_FOUND')
  if (content.length < 1 || content.length > 500) return fail(res, 400, 'Comentario no válido', 'INVALID_COMMENT')
  const id = crypto.randomUUID()
  db.prepare('INSERT INTO feed_comments (id, post_id, user_id, content) VALUES (?, ?, ?, ?)').run(id, postId, req.user.id, content)
  return ok(res, { id, postId, userId: req.user.id, userName: req.user.name, content, createdAt: new Date().toISOString() }, 201)
})

// Eliminar un comentario propio de una publicación del feed
app.delete('/api/feed/comments/:id', requireAuth, (req, res) => {
  const id = String(req.params.id)
  const row = db.prepare('SELECT id, user_id FROM feed_comments WHERE id = ?').get(id)
  if (!row) return fail(res, 404, 'Comentario no encontrado', 'NOT_FOUND')
  if (row.user_id !== req.user.id && req.user.role !== 'admin') return fail(res, 403, 'No tienes permisos sobre este comentario', 'FORBIDDEN')
  db.prepare('DELETE FROM feed_comments WHERE id = ?').run(id)
  res.status(204).end()
})

// Comparte el video como mensaje: valida que el contacto pueda recibirlo.
app.post('/api/feed/:id/share', requireAuth, requireCustomer, (req, res) => {
  const post = db.prepare('SELECT * FROM feed_posts WHERE id = ?').get(Number(req.params.id))
  const receiverId = Number(req.body?.receiverId)
  if (!post) return fail(res, 404, 'Publicación no encontrada', 'NOT_FOUND')
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(receiverId) || receiverId === req.user.id) return fail(res, 400, 'Contacto no válido', 'INVALID_CONTACT')
  const allowed = !!db.prepare('SELECT 1 FROM follows WHERE follower_id=? AND following_id=?').get(req.user.id, receiverId) || !!db.prepare('SELECT 1 FROM follows WHERE follower_id=? AND following_id=?').get(receiverId, req.user.id)
  if (!allowed) return fail(res, 403, 'Sigue al contacto para compartirle videos', 'FOLLOW_REQUIRED')
  const text = `🎥 ${post.title}\\n${post.description}\\n${post.video_url}`
  const info = db.prepare('INSERT INTO messages (sender_id, receiver_id, content, image_url) VALUES (?, ?, ?, NULL)').run(req.user.id, receiverId, text)
  return ok(res, { messageId: info.lastInsertRowid }, 201)
})

/* ============================ PEDIDOS ================================= */

// Crear pedido + pago (lo llama el checkout al confirmar; permite invitados)
app.post('/api/orders', async (req, res) => {
  const checkoutUser = getUserFromToken(req)
  if (checkoutUser?.role === 'support') return fail(res, 403, 'La cuenta de soporte solo puede usar el chat', 'SUPPORT_CHAT_ONLY')
  const items = Array.isArray(req.body?.items) ? req.body.items : []
  const customerName = String(req.body?.customerName ?? '').trim()
  const customerEmail = String(req.body?.customerEmail ?? '').trim().toLowerCase()
  const customerPhone = String(req.body?.customerPhone ?? '').trim()
  const address = String(req.body?.address ?? '').trim()
  const city = String(req.body?.city ?? '').trim()
  const customerRegion = String(req.body?.region ?? '').trim()
  const postalCode = String(req.body?.postalCode ?? '').trim()
  const subtotal = Number(req.body?.subtotal ?? 0)
  const discount = Number(req.body?.discount ?? 0)
  const shipping = Number(req.body?.shipping ?? 0)
  const total = Number(req.body?.total ?? 0)
  const method = String(req.body?.method ?? 'card')
  const transactionId = req.body?.transactionId ? String(req.body.transactionId) : null
  const installments = req.body?.installments ? Number(req.body.installments) : null
  const paymentStatus = ['approved', 'pending', 'declined'].includes(req.body?.paymentStatus) ? req.body.paymentStatus : 'pending'
  const estimatedDelivery = req.body?.estimatedDelivery ? String(req.body.estimatedDelivery) : null
  const trackingToken = generateToken(24)

  if (!customerName || !EMAIL_RE.test(customerEmail)) {
    return fail(res, 400, 'Faltan datos del cliente', 'INVALID_CUSTOMER')
  }
  if (!Number.isFinite(total) || total <= 0 || items.length === 0) {
    return fail(res, 400, 'Pedido inválido', 'INVALID_ORDER')
  }

  const user = getUserFromToken(req)
  const userId = user?.id ?? null

  // Validación de stock realista: comprueba disponibilidad y cantidad antes de guardar.
  const getStock = db.prepare('SELECT id, stock FROM products WHERE name = ? OR name = ? LIMIT 1')
  const decrement = db.prepare('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?')
  for (const it of items) {
    const qty = Number(it.qty ?? 1)
    const productName = String(it.name ?? '')
    const row =
      db.prepare('SELECT id, stock FROM products WHERE id = ?').get(String(it.productId ?? '')) ??
      getStock.get(productName, productName)
    if (row && Number(row.stock) < qty) {
      return fail(res, 409, `"${productName}" no tiene stock suficiente (solo quedan ${row.stock})`, 'INSUFFICIENT_STOCK')
    }
  }

  const order = db
    .prepare(
      `INSERT INTO orders (user_id, customer_name, customer_email, customer_phone, address, city, region, postal_code, subtotal, discount, shipping, total, status, estimated_delivery, tracking_token)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(userId, customerName, customerEmail, customerPhone, address, city, customerRegion, postalCode, subtotal, discount, shipping, total, paymentStatus === 'approved' ? 'paid' : 'pending', estimatedDelivery, trackingToken)

  const insertItem = db.prepare('INSERT INTO order_items (order_id, product_id, name, price, qty) VALUES (?, ?, ?, ?, ?)')
  for (const it of items) {
    const qty = Number(it.qty ?? 1)
    insertItem.run(order.lastInsertRowid, String(it.productId ?? ''), String(it.name ?? ''), Number(it.price ?? 0), qty)
    // Resta el stock vendido al producto correspondiente.
    const productName = String(it.name ?? '')
    const row =
      db.prepare('SELECT id, stock FROM products WHERE id = ?').get(String(it.productId ?? '')) ??
      getStock.get(productName, productName)
    if (row) decrement.run(qty, row.id)
  }

  db.prepare(
    `INSERT INTO payments (order_id, amount, method, transaction_id, installments, status) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(order.lastInsertRowid, total, method, transactionId, installments, paymentStatus)

  const emailResult = await sendOrderEmail({ to: customerEmail, orderId: order.lastInsertRowid, trackingToken, status: paymentStatus, estimatedDelivery }).catch((error) => ({ sent: false, mode: 'error', error: error.message }))
  return ok(res, { id: order.lastInsertRowid, trackingToken, trackingUrl: emailResult.trackingUrl, email: { sent: emailResult.sent, mode: emailResult.mode } }, 201)
})

// Seguimiento privado: solo quien tenga el token del correo puede abrirlo.
app.get('/api/orders/track/:token', (req, res) => {
  const order = db
    .prepare(`SELECT id, customer_name, customer_email, status, total, estimated_delivery, created_at, tracking_token FROM orders WHERE tracking_token = ?`)
    .get(String(req.params.token))
  if (!order) return fail(res, 404, 'Enlace de seguimiento no válido o expirado', 'INVALID_TRACKING_LINK')
  return ok(res, {
    id: order.id,
    customerName: order.customer_name,
    customerEmail: order.customer_email,
    status: order.status,
    total: order.total,
    estimatedDelivery: order.estimated_delivery,
    createdAt: order.created_at,
  })
})

/* ========================= PAYPAL / CUENTA RECEPTORA =================== */

app.post('/api/payments/paypal/orders', (req, res) => {
  return fail(res, 503, 'PayPal no está configurado; usa el modo demo', 'PAYPAL_NOT_CONFIGURED')
})

app.post('/api/payments/paypal/orders/:id/capture', (req, res) => {
  return fail(res, 503, 'PayPal no está configurado', 'PAYPAL_NOT_CONFIGURED')
})

/* ========================= CUENTA RECEPTORA ============================ */

app.get('/api/admin/payout-account', requireAuth, requireAdmin, (req, res) => {
  const account = db.prepare('SELECT id, provider, label, account_ref, is_active, created_at FROM payout_accounts WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get()
  if (!account) return ok(res, null)
  const balance = db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM payout_transactions WHERE payout_account_id = ? AND status = 'received'").get(account.id).total
  const transactions = db
    .prepare(
      `SELECT t.id, t.payout_account_id, t.user_id, u.name AS user_name, t.type, t.amount, t.currency, t.method, t.reference, t.status, t.created_at
       FROM payout_transactions t LEFT JOIN users u ON u.id = t.user_id
       WHERE t.payout_account_id = ? ORDER BY t.id DESC LIMIT 50`,
    )
    .all(account.id)
  return ok(res, {
    id: account.id,
    provider: account.provider,
    label: account.label,
    accountRef: account.account_ref,
    isActive: account.is_active,
    createdAt: account.created_at,
    balance,
    transactions: transactions.map((t) => ({
      id: t.id,
      userId: t.user_id,
      userName: t.user_name ?? '—',
      type: t.type,
      amount: t.amount,
      currency: t.currency,
      method: t.method,
      reference: t.reference,
      status: t.status,
      createdAt: t.created_at,
    })),
  })
})

// Confirma que el dinero de una transacción pendiente (p. ej. transferencia)
// llegó a la cuenta receptora y, si es una suscripción, activa el premium.
app.post('/api/admin/payout-transactions/:id/confirm', requireAuth, requireAdmin, (req, res) => {
  const tx = db.prepare('SELECT * FROM payout_transactions WHERE id = ?').get(Number(req.params.id))
  if (!tx) return fail(res, 404, 'Transacción no encontrada', 'NOT_FOUND')
  if (tx.status === 'received') return ok(res, { message: 'Ya estaba confirmada' })
  db.prepare("UPDATE payout_transactions SET status = 'received' WHERE id = ?").run(tx.id)
  if (tx.user_id) db.prepare('UPDATE users SET is_premium = 1 WHERE id = ?').run(tx.user_id)
  return ok(res, { id: tx.id, status: 'received', credited: tx.amount, currency: tx.currency, premiumActivated: !!tx.user_id })
})

// Opcional: revertir/refund de una transacción (el dinero ya no está recibido).
app.post('/api/admin/payout-transactions/:id/refund', requireAuth, requireAdmin, (req, res) => {
  const tx = db.prepare('SELECT * FROM payout_transactions WHERE id = ?').get(Number(req.params.id))
  if (!tx) return fail(res, 404, 'Transacción no encontrada', 'NOT_FOUND')
  db.prepare("UPDATE payout_transactions SET status = 'refunded' WHERE id = ?").run(tx.id)
  if (tx.user_id) db.prepare('UPDATE users SET is_premium = 0 WHERE id = ?').run(tx.user_id)
  return ok(res, { id: tx.id, status: 'refunded' })
})

app.put('/api/admin/payout-account', requireAuth, requireAdmin, (req, res) => {
  const provider = String(req.body?.provider ?? '').trim().toLowerCase()
  const label = String(req.body?.label ?? '').trim()
  const accountRef = String(req.body?.accountRef ?? '').trim()
  if (!['paypal', 'bank', 'stripe'].includes(provider)) return fail(res, 400, 'Proveedor no válido', 'INVALID_PROVIDER')
  if (label.length < 2 || accountRef.length < 3) return fail(res, 400, 'Completa los datos de la cuenta receptora', 'INVALID_ACCOUNT')
  db.prepare('UPDATE payout_accounts SET is_active = 0 WHERE is_active = 1').run()
  const info = db.prepare('INSERT INTO payout_accounts (provider, label, account_ref) VALUES (?, ?, ?)').run(provider, label, accountRef)
  const account = db.prepare('SELECT id, provider, label, account_ref, is_active, created_at FROM payout_accounts WHERE id = ?').get(info.lastInsertRowid)
  return ok(res, { id: account.id, provider: account.provider, label: account.label, accountRef: account.account_ref, isActive: account.is_active, createdAt: account.created_at })
})

/* ========================= CUPONES ADMIN ============================== */

app.get('/api/admin/promo-codes', requireAuth, requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT id, code, percent, min_amount, expires_at, active, created_at FROM promo_codes ORDER BY id DESC').all()
  ok(res, { items: rows.map((r) => ({ id: r.id, code: r.code, percent: r.percent, minAmount: r.min_amount, expiresAt: r.expires_at, active: r.active, createdAt: r.created_at })), total: rows.length })
})
app.post('/api/admin/promo-codes', requireAuth, requireAdmin, (req, res) => {
  const code = String(req.body?.code ?? '').trim().toUpperCase()
  const percent = Number(req.body?.percent)
  const minAmount = Number(req.body?.minAmount ?? 0)
  const expiresAt = req.body?.expiresAt ? String(req.body.expiresAt) : null
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return fail(res, 400, 'Código inválido', 'INVALID_CODE')
  if (!Number.isInteger(percent) || percent < 1 || percent > 90) return fail(res, 400, 'Descuento entre 1 y 90%', 'INVALID_PERCENT')
  if (!Number.isFinite(minAmount) || minAmount < 0) return fail(res, 400, 'Mínimo inválido', 'INVALID_MINIMUM')
  if (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) return fail(res, 400, 'Fecha de caducidad inválida', 'INVALID_EXPIRY')
  try {
    const info = db.prepare('INSERT INTO promo_codes (code, percent, min_amount, expires_at) VALUES (?, ?, ?, ?)').run(code, percent, minAmount, expiresAt)
    return ok(res, { id: info.lastInsertRowid, code, percent, minAmount, expiresAt, active: 1 }, 201)
  } catch { return fail(res, 409, 'Ese código ya existe', 'CODE_TAKEN') }
})
app.delete('/api/admin/promo-codes/:id', requireAuth, requireAdmin, (req, res) => {
  const info = db.prepare('DELETE FROM promo_codes WHERE id = ?').run(Number(req.params.id))
  if (info.changes === 0) return fail(res, 404, 'Código no encontrado', 'NOT_FOUND')
  res.status(204).end()
})

/* ========================= PANEL ADMIN ================================ */

app.get('/api/admin/products', requireAuth, requireAdmin, (req, res) => {
  const rows = db
    .prepare(`SELECT p.*, u.name AS owner_name, u.country AS owner_country FROM products p LEFT JOIN users u ON u.id = p.owner_id ORDER BY p.created_at DESC`)
    .all()
  paginate(res, rows.map(productToApi))
})

app.get('/api/admin/orders', requireAuth, requireAdmin, (req, res) => {
  const rows = db
    .prepare(
      `SELECT o.*, (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS items_count,
        (SELECT p.method FROM payments p WHERE p.order_id = o.id ORDER BY p.id DESC LIMIT 1) AS payment_method,
        (SELECT p.status FROM payments p WHERE p.order_id = o.id ORDER BY p.id DESC LIMIT 1) AS payment_status
       FROM orders o ORDER BY o.created_at DESC`,
    )
    .all()
  ok(res, {
    items: rows.map((r) => ({
      id: r.id,
      customerName: r.customer_name,
      customerEmail: r.customer_email,
      customerPhone: r.customer_phone,
      address: r.address,
      city: r.city,
      region: r.region,
      postalCode: r.postal_code,
      subtotal: r.subtotal,
      discount: r.discount,
      shipping: r.shipping,
      total: r.total,
      status: r.status,
      itemsCount: r.items_count,
      paymentMethod: r.payment_method ?? null,
      paymentStatus: r.payment_status ?? null,
      estimatedDelivery: r.estimated_delivery ?? null,
      createdAt: r.created_at,
    })),
    total: rows.length,
  })
})

app.get('/api/admin/orders/:id/items', requireAuth, requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(Number(req.params.id))
  ok(res, { items: rows })
})

app.patch('/api/admin/orders/:id/status', requireAuth, requireAdmin, (req, res) => {
  const status = String(req.body?.status ?? '')
  if (!ORDER_STATUSES.includes(status)) return fail(res, 400, 'Estado no válido', 'INVALID_STATUS')
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(req.params.id))
  if (!order) return fail(res, 404, 'Pedido no encontrado', 'NOT_FOUND')
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, order.id)
  return ok(res, { id: order.id, status })
})

// Aprobar pedido pendiente: se registra la aprobación y el pago queda aprobado.
app.patch('/api/admin/orders/:id/delivery', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  const date = String(req.body?.estimatedDelivery ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(res, 400, 'Fecha de entrega no válida', 'INVALID_DELIVERY_DATE')
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id)
  if (!order) return fail(res, 404, 'Pedido no encontrado', 'NOT_FOUND')
  db.prepare('UPDATE orders SET estimated_delivery = ? WHERE id = ?').run(date, id)
  const result = await sendOrderEmail({ to: order.customer_email, orderId: id, trackingToken: order.tracking_token, status: order.status, estimatedDelivery: date }).catch(() => ({ sent: false, mode: 'error' }))
  return ok(res, { id, estimatedDelivery: date, email: result })
})

app.post('/api/admin/orders/:id/approve', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id)
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id)
  if (!order) return fail(res, 404, 'Pedido no encontrado', 'NOT_FOUND')
  db.prepare("UPDATE orders SET status = 'paid' WHERE id = ?").run(id)
  db.prepare("UPDATE payments SET status = 'approved' WHERE order_id = ? AND status = 'pending'").run(id)
  return ok(res, { id, status: 'paid', paymentStatus: 'approved' })
})

app.get('/api/admin/payments', requireAuth, requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM payments ORDER BY created_at DESC').all()
  ok(res, { items: rows.map((r) => ({ id: r.id, orderId: r.order_id, amount: r.amount, method: r.method, transactionId: r.transaction_id, installments: r.installments, status: r.status, createdAt: r.created_at })), total: rows.length })
})

app.delete('/api/admin/payments/:id', requireAuth, requireAdmin, (req, res) => {
  const info = db.prepare('DELETE FROM payments WHERE id = ?').run(Number(req.params.id))
  if (info.changes === 0) return fail(res, 404, 'Pago no encontrado', 'NOT_FOUND')
  res.status(204).end()
})

app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT id, name, email, role, country, is_suspended, created_at FROM users ORDER BY created_at DESC').all()
  ok(res, { items: rows.map((row) => ({ ...row, isSuspended: !!row.is_suspended, createdAt: row.created_at })), total: rows.length })
})

app.patch('/api/admin/users/:id/suspension', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id)
  const suspended = Boolean(req.body?.suspended)
  if (!Number.isInteger(id) || id === req.user.id) return fail(res, 400, 'Usuario no válido', 'INVALID_USER')
  const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id)
  if (!user) return fail(res, 404, 'Usuario no encontrado', 'NOT_FOUND')
  if (user.role === 'admin' || user.role === 'support') return fail(res, 403, 'No puedes suspender cuentas internas', 'PROTECTED_ACCOUNT')
  db.prepare('UPDATE users SET is_suspended = ? WHERE id = ?').run(suspended ? 1 : 0, id)
  if (suspended) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id)
  return ok(res, { id, isSuspended: suspended })
})

app.patch('/api/admin/users/:id/role', requireAuth, requireAdmin, (req, res) => {
  const role = String(req.body?.role ?? '')
  if (!['admin', 'customer'].includes(role)) return fail(res, 400, 'Rol no válido', 'INVALID_ROLE')
  const id = Number(req.params.id)
  if (id === req.user.id) return fail(res, 400, 'No puedes cambiar tu propio rol', 'SELF_ROLE')
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
  if (!user) return fail(res, 404, 'Usuario no encontrado', 'NOT_FOUND')
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id)
  return ok(res, { id, role })
})

app.delete('/api/admin/users/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id)
  if (id === req.user.id) return fail(res, 400, 'No puedes eliminar tu propia cuenta', 'SELF_DELETE')
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
  if (!user) return fail(res, 404, 'Usuario no encontrado', 'NOT_FOUND')
  if (user.role === 'admin' || user.role === 'support') return fail(res, 403, 'No puedes eliminar cuentas internas', 'PROTECTED_ACCOUNT')
  db.prepare('DELETE FROM users WHERE id = ?').run(id)
  res.status(204).end()
})

/* ------------------------------ 404 resto ------------------------------ */

app.use('/api', (req, res) => fail(res, 404, `Ruta no encontrada: ${req.method} ${req.path}`, 'NOT_FOUND'))

app.listen(PORT, () => {
  console.log(`✓ Vertamart API escuchando en http://localhost:${PORT} (SQLite: server/verta.db)`)
})
