/**
 * Vertamart API — Cloudflare Worker + D1.
 *
 * Port de server/index.js (Express + node:sqlite) al runtime de Workers.
 * Mismo contrato de endpoints (/api/*), misma base SQL (SQLite/D1).
 * Diferencias: handler asíncrono (D1 es async) y sesiones con Web Crypto.
 */

import bcrypt from 'bcryptjs'
import { WorkerMailer } from 'worker-mailer'
import Stripe from 'stripe'

/** Binding D1 inyectado por wrangler (env.DB). */
let DB = null

/** Cliente Stripe (lazy): solo se crea si hay clave secreta configurada. */
let STRIPE = null
function getStripe(env) {
  const key = env?.STRIPE_SECRET_KEY || ''
  if (!key) return null
  if (!STRIPE) {
    STRIPE = new Stripe(key, { apiVersion: '2024-06-20' })
  }
  return STRIPE
}
/** Modo actual: 'test' o 'live', según el prefijo de la clave secreta. */
function stripeMode(env) {
  const key = env?.STRIPE_SECRET_KEY || ''
  return key.startsWith('sk_live') ? 'live' : 'test'
}

const SALT_ROUNDS = 10
const SESSION_TTL_DAYS = 30
const LOW_STOCK_THRESHOLD = 3
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ORDER_STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled', 'failed', 'refunded']
const PRODUCT_STATUSES = ['active', 'hidden']
const MESSAGE_MAX_LENGTH = 2000

/** Videos de ejemplo para el feed, elegidos según el título/descripción. */
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

/* ------------------------------ db helper ------------------------------ */

const db = {
  /** Devuelve la primera fila o null. */
  async get(sql, ...params) {
    return await DB.prepare(sql).bind(...params).first()
  },
  /** Devuelve todas las filas. */
  async all(sql, ...params) {
    const res = await DB.prepare(sql).bind(...params).all()
    return res.results ?? []
  },
  /** Ejecuta INSERT/UPDATE/DELETE. */
  async run(sql, ...params) {
    const res = await DB.prepare(sql).bind(...params).run()
    return { changes: Number(res.meta.changes ?? 0), lastId: Number(res.meta.last_row_id ?? 0) }
  },
}

/* ------------------------------ helpers -------------------------------- */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
}

const withCors = (res) => {
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v)
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

const json = (data, status = 200) => new Response(JSON.stringify({ data }), {
  status,
  headers: { 'Content-Type': 'application/json', ...CORS },
})
const fail = (status, message, code) => new Response(JSON.stringify({ status, message, code }), {
  status,
  headers: { 'Content-Type': 'application/json', ...CORS },
})

const safeJson = (value, fallback) => {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

async function verificationFor(userId) {
  const user = await db.get('SELECT name, email, country FROM users WHERE id = ?', userId)
  const product = await db.get("SELECT id FROM products WHERE owner_id = ? AND status = 'active' LIMIT 1", userId)
  const post = await db.get('SELECT id FROM feed_posts WHERE user_id = ? LIMIT 1', userId)
  const checks = {
    email: !!user?.email && EMAIL_RE.test(user.email),
    profile: !!user?.name && user.name.trim().length >= 2 && !!user?.country,
    activity: !!product || !!post,
  }
  return { verified: Object.values(checks).every(Boolean), checks }
}

/** Verificación calculada en lote para varios usuarios (map id -> boolean). */
async function verifiedMapFor(ids) {
  const unique = [...new Set((ids ?? []).filter(Boolean))]
  const map = new Map()
  if (unique.length === 0) return map
  const placeholders = unique.map(() => '?').join(',')
  const rows = await db.all(
    `SELECT u.id, u.name, u.email, u.country,
      EXISTS(SELECT 1 FROM products p WHERE p.owner_id = u.id AND p.status = 'active') AS has_product,
      EXISTS(SELECT 1 FROM feed_posts f WHERE f.user_id = u.id) AS has_post
     FROM users u WHERE u.id IN (${placeholders})`,
    ...unique,
  )
  for (const r of rows) {
    const checks = {
      email: !!r.email && EMAIL_RE.test(r.email),
      profile: !!r.name && r.name.trim().length >= 2 && !!r.country,
      activity: !!r.has_product || !!r.has_post,
    }
    map.set(r.id, Object.values(checks).every(Boolean))
  }
  return map
}

/* ------------------- notificaciones push (RFC 8291) -------------------- */

const b64ToBuf = (b64) => {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'))
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf
}
const bufToB64url = (buf) => {
  let bin = ''
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** HKDF (RFC 5869) usando Web Crypto. */
async function hkdf(ikm, salt, info, length) {
  const key = await crypto.subtle.importKey('raw', typeof ikm === 'string' ? new TextEncoder().encode(ikm) : ikm, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: typeof salt === 'string' ? new TextEncoder().encode(salt) : salt, info: new TextEncoder().encode(info) }, key, length * 8)
  return new Uint8Array(bits)
}

/** Cifra el payload para una suscripción push (RFC 8291 / aes128gcm). */
async function encryptPayload(clientPublicRaw, authSecret, payload) {
  const enc = new TextEncoder()
  const ecdhKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const ephPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', ecdhKeys.publicKey))
  const pubImported = await crypto.subtle.importKey('raw', clientPublicRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: pubImported }, ecdhKeys.privateKey, 256))

  const prk = await hkdf(shared, authSecret, 'WebPush: info\x00' + bufToB64url_std(clientPublicRaw) + bufToB64url_std(ephPubRaw), 32)
  const ikm = await hkdf(prk, new Uint8Array(0), 'Content-Encoding: aes128gcm\x00', 32)
  const combined = new Uint8Array(ephPubRaw.length + ikm.length)
  combined.set(ephPubRaw, 0)
  combined.set(ikm, ephPubRaw.length)
  const prkFinal = await hkdf(combined, new Uint8Array(0), 'Content-Encoding: aes128gcm\x00', 32)
  const cek = await hkdf(prkFinal, new Uint8Array(0), 'Content-Encoding: aes128gcm\x00', 16)
  const nonce = await hkdf(prkFinal, new Uint8Array(0), 'Content-Encoding: nonce\x00', 12)

  // Header aes128gcm: salt(16) || rs(4) || idlen(1) || keyid(65)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const rs = new Uint8Array([0x00, 0x00, 0x10, 0x00]) // 4096 (datagramas de record group)
  const idLen = new Uint8Array([ephPubRaw.length])
  const header = new Uint8Array(16 + 4 + 1 + ephPubRaw.length)
  header.set(salt, 0); header.set(rs, 16); header.set(idLen, 20); header.set(ephPubRaw, 21)

  const padded = new Uint8Array(enc.encode(payload).length + 1)
  padded.set(enc.encode(payload), 0) // último byte 0x00 (delimitador de record group)

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: header }, key, padded))
  const out = new Uint8Array(header.length + ct.length)
  out.set(header, 0); out.set(ct, header.length)
  return out
}

function bufToB64url_std(buf) { return bufToB64url(buf) }

/** Firma JWT ES256 para la autorización VAPID del push. */
async function vapidJwt(env, audience) {
  const header = { typ: 'JWT', alg: 'ES256' }
  const now = Math.floor(Date.now() / 1000)
  const payload = { aud: new URL(audience).origin, exp: now + 12 * 3600, sub: `mailto:${env.GMAIL_USER || 'vertamart027@gmail.com'}` }
  const signing = bufToB64url(new TextEncoder().encode(JSON.stringify(header))) + '.' + bufToB64url(new TextEncoder().encode(JSON.stringify(payload)))
  const key = await crypto.subtle.importKey('pkcs8', b64ToBuf(env.PUSH_VAPID_PRIVATE_PKCS8), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(signing)))
  const half = sig.length / 2
  const r = sig.slice(0, half), s = sig.slice(half)
  const jose = new Uint8Array(64)
  jose.set(r, 0); jose.set(s, 32)
  return signing + '.' + bufToB64url(jose)
}

/** Envía una notificación push a una suscripción guardada. */
async function sendPushToOne(env, sub, title, body, url) {
  if (!env.PUSH_VAPID_PRIVATE_PKCS8 || !env.PUSH_VAPID_PUBLIC) return false
  try {
    const keys = safeJson(sub.keys, {})
    if (!keys.p256dh || !keys.auth) return false
    const payload = JSON.stringify({ title, body, url, icon: '/favicon.svg' })
    const encrypted = await encryptPayload(b64ToBuf(keys.p256dh), b64ToBuf(keys.auth), payload)
    const aud = new URL(sub.endpoint).origin
    const token = await vapidJwt(env, sub.endpoint)
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'TTL': '86400',
        // TTL + topic en cabeceras de control HTTP2 no requeridas.
        'Authorization': `vapid t=${token}, k=${env.PUSH_VAPID_PUBLIC}`,
      },
      body: encrypted,
    })
    if (res.status >= 400 && res.status < 500) {
      // Suscripción muerta o rechazada: la eliminamos.
      await db.run('DELETE FROM push_subscriptions WHERE endpoint = ?', sub.endpoint)
    }
    return res.ok || res.status === 201
  } catch { return false }
}

async function pushToAll(env, title, body, url) {
  if (!env.PUSH_VAPID_PRIVATE_PKCS8 || !env.PUSH_VAPID_PUBLIC) return 0
  const subs = await db.all('SELECT * FROM push_subscriptions')
  let sent = 0
  for (const s of subs) {
    if (await sendPushToOne(env, s, title, body, url)) sent++
  }
  return sent
}

async function pushToAllForUser(env, userId, title, body, url) {
  if (!env.PUSH_VAPID_PRIVATE_PKCS8 || !env.PUSH_VAPID_PUBLIC) return 0
  const subs = await db.all('SELECT * FROM push_subscriptions WHERE user_id = ?', userId)
  let sent = 0
  for (const s of subs) {
    if (await sendPushToOne(env, s, title, body, url)) sent++
  }
  return sent
}

/* ------------------- correo y OAuth (Google / Apple) ------------------- */

/**
 * Envía un correo. Prioridad:
 * 1) Gmail SMTP (gratis, sin dominio propio) si GMAIL_USER + GMAIL_APP_PASSWORD existen.
 * 2) Resend si RESEND_API_KEY existe (requiere dominio verificado para destinatarios ajenos).
 * Si nada funciona devuelve false (el frontend muestra el enlace en pantalla).
 */
async function sendEmail(env, to, subject, html) {
  // Vía 1: Gmail SMTP desde el Worker (sockets TCP nativos).
  if (env.GMAIL_USER && env.GMAIL_APP_PASSWORD) {
    try {
      const mailer = await WorkerMailer.connect({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        startTls: false,
        credentials: { username: env.GMAIL_USER, password: env.GMAIL_APP_PASSWORD },
        authType: 'plain',
        responseTimeoutMs: 10000,
        socketTimeoutMs: 15000,
      })
      await mailer.send({
        from: { name: 'Vertamart', email: env.GMAIL_USER },
        to: { email: to },
        subject,
        html,
      })
      // mailer.send no devuelve nada: si no lanza error, el correo se envió.
      return true
    } catch (e) {
      // Si Gmail falla, intenta con Resend antes de rendirse.
      try { console.log('gmail smtp error:', String(e?.message ?? e)) } catch { /* noop */ }
    }
  }
  // Vía 2: Resend (requiere dominio verificado para llegar a cualquier destinatario).
  if (env.RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: env.EMAIL_FROM || 'Vertamart <onboarding@resend.dev>', to: [to], subject, html }),
      })
      if (res.ok) return true
    } catch {
      /* sigue abajo */
    }
  }
  return false
}

/** Busca un usuario por email o lo crea (login con Google/Apple). Contraseña aleatoria no compartida. */
async function findOrCreateOAuthUser(profile) {
  const email = String(profile?.email ?? '').trim().toLowerCase()
  if (!EMAIL_RE.test(email)) return null
  const existing = await db.get('SELECT * FROM users WHERE email = ?', email)
  if (existing) return existing
  const name = String(profile?.name ?? '').trim() || email.split('@')[0]
  const hash = await bcrypt.hash(randomToken() + randomToken(), SALT_ROUNDS)
  const info = await db.run('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)', name, email, hash)
  return db.get('SELECT * FROM users WHERE id = ?', info.lastId)
}

/** client_secret JWT (ES256) que Apple exige para canjear el código. */
async function appleClientSecret(env) {
  const now = Math.floor(Date.now() / 1000)
  const b64u = (obj) => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const input = `${b64u({ alg: 'ES256', kid: env.APPLE_KEY_ID })}.${b64u({ iss: env.APPLE_TEAM_ID, iat: now, exp: now + 15777000, aud: 'https://appleid.apple.com', sub: env.APPLE_CLIENT_ID })}`
  const pem = String(env.APPLE_PRIVATE_KEY).replace(/\\n/g, '\n')
  const raw = pem.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '')
  const der = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(input))
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${input}.${sigB64}`
}

function publicUser(row, verification = null) {
  return { id: row.id, name: row.name, email: row.email, role: row.role, country: row.country, createdAt: row.created_at, isPremium: !!row.is_premium, verified: verification?.verified ?? false }
}

function randomToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

// Bloque de 4 caracteres para licencias VERTA-XXXX-XXXX-XXXX
function rand4() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
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

async function createSession(userId) {
  const token = randomToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 3600 * 1000).toISOString()
  await db.run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', token, userId, expiresAt)
  return token
}

async function getUserFromToken(req) {
  const header = req.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return null
  const row = await db.get(
    `SELECT u.* FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > datetime('now')`,
    token,
  )
  return row ? publicUser(row) : null
}

function productToApi(row, ownerVerified = false) {
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
    // Producto digital: formato, tamaño, compatibilidad, licencia, descargas...
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
    version: row.version ?? '1.0.0',
    createdAt: row.created_at,
    status: row.status,
    ownerId: row.owner_id ?? null,
    ownerName: row.owner_name ?? null,
    owner: row.owner_id ? { id: row.owner_id, name: row.owner_name ?? 'Vendedor', verified: ownerVerified } : null,
  }
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
    android: { fileType: 'ZIP', fileSize: '45 MB', compatibility: 'Android 8+ · Launchers' },
  }
  return map[category] ?? { fileType: 'ZIP', fileSize: '10 MB', compatibility: 'Windows · macOS · Linux' }
}

async function publicProfile(row, viewerId) {
  const verification = await verificationFor(row.id)
  const stats = await db.get(
    `SELECT
      (SELECT COUNT(*) FROM products WHERE owner_id = ? AND status = 'active') AS products_count,
      (SELECT COUNT(*) FROM follows WHERE following_id = ?) AS followers_count,
      (SELECT COUNT(*) FROM follows WHERE follower_id = ?) AS following_count`,
    row.id, row.id, row.id,
  )
  const isFollowing = viewerId
    ? !!(await db.get('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?', viewerId, row.id))
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
    verified: verification.verified,
    verification: verification.checks,
  }
}

const paginate = (items) => ({ items, total: items.length, page: 1, pageSize: items.length, totalPages: 1 })

/** Convierte una fila de feed_posts al formato de la API (con likes y comentarios reales). */
async function feedPostToApi(row, viewerId) {
  const likesCount = await db.get('SELECT COUNT(*) AS count FROM feed_likes WHERE post_id = ?', row.id)
  const liked = viewerId
    ? !!(await db.get('SELECT 1 FROM feed_likes WHERE post_id = ? AND user_id = ?', row.id, viewerId))
    : false
  const commentsCount = await db.get('SELECT COUNT(*) AS count FROM feed_comments WHERE post_id = ?', row.id)
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userVerified: (await verificationFor(row.user_id)).verified,
    productId: row.product_id,
    productCode: row.product_code ?? null,
    productName: row.product_name ?? null,
    title: row.title,
    description: row.description,
    videoUrl: row.video_url,
    likesCount: likesCount?.count ?? 0,
    liked,
    commentsCount: commentsCount?.count ?? 0,
    createdAt: row.created_at,
  }
}/* ---------------- esquema del panel: categorías y cupones ---------------- */
let adminSchemaReady = false
let adminSchemaPromise = null
async function ensureAdminSchema() {
  if (adminSchemaReady) return
  adminSchemaPromise ??= (async () => {
    await db.run(`CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      tagline TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
    // Sembrar categorías del catálogo actual (si la tabla está vacía)
    const existing = await db.get('SELECT COUNT(*) AS n FROM categories')
    if ((existing?.n ?? 0) === 0) {
      const rows = await db.all('SELECT DISTINCT category FROM products')
      const label = { plantillas: 'Plantillas', presets: 'Presets', iconos: 'Iconos', fuentes: 'Fuentes', 'modelos-3d': 'Modelos 3D', plugins: 'Plugins', cursos: 'Cursos', packs: 'Packs', android: 'Android', audio: 'Audio', wearables: 'Wearables', teclado: 'Teclados', mouse: 'Mouse', carga: 'Carga', monitor: 'Monitores', streaming: 'Streaming', oficina: 'Oficina', accesorios: 'Accesorios', general: 'General' }
      for (const r of rows) {
        const key = String(r.category).trim()
        if (!key) continue
        const pretty = label[key] ?? key.charAt(0).toUpperCase() + key.slice(1)
        await db.run(`INSERT OR IGNORE INTO categories (key, name, tagline) VALUES (?, ?, ?)`, key, pretty, `Productos de ${pretty}`)
      }
    }
    // Columna de versión en productos (sistema de actualizaciones)
    const prodCols = await db.all(`PRAGMA table_info(products)`)
    if (!prodCols.some((c) => c.name === 'version')) {
      await db.run(`ALTER TABLE products ADD COLUMN version TEXT NOT NULL DEFAULT '1.0.0'`)
    }
    // Ajustes globales (key/value) + cliente Stripe por usuario
    await db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`)
    await db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('demo_payments', '1')`)
    const userCols = await db.all(`PRAGMA table_info(users)`)
    if (!userCols.some((c) => c.name === 'stripe_customer_id')) {
      await db.run(`ALTER TABLE users ADD COLUMN stripe_customer_id TEXT`)
    }
    // Historial de versiones de cada producto (changelog visible para compradores)
    await db.run(`CREATE TABLE IF NOT EXISTS product_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT NOT NULL,
      version TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
    await db.run(`CREATE INDEX IF NOT EXISTS idx_product_versions_product ON product_versions (product_id, id)`)
    // Licencia única y versión comprada por cada ítem de pedido
    const oiCols = await db.all(`PRAGMA table_info(order_items)`)
    if (!oiCols.some((c) => c.name === 'license_key')) {
      await db.run(`ALTER TABLE order_items ADD COLUMN license_key TEXT`)
    }
    if (!oiCols.some((c) => c.name === 'version_at_purchase')) {
      await db.run(`ALTER TABLE order_items ADD COLUMN version_at_purchase TEXT`)
    }
    // Columnas extra de cupones
    const promoCols = await db.all(`PRAGMA table_info(promo_codes)`)
    const has = (name) => promoCols.some((c) => c.name === name)
    if (!has('type')) await db.run(`ALTER TABLE promo_codes ADD COLUMN type TEXT NOT NULL DEFAULT 'percent'`)
    if (!has('value')) await db.run(`ALTER TABLE promo_codes ADD COLUMN value INTEGER NOT NULL DEFAULT 0`)
    if (!has('starts_at')) await db.run(`ALTER TABLE promo_codes ADD COLUMN starts_at TEXT`)
    if (!has('max_uses')) await db.run(`ALTER TABLE promo_codes ADD COLUMN max_uses INTEGER`)
    if (!has('used_count')) await db.run(`ALTER TABLE promo_codes ADD COLUMN used_count INTEGER NOT NULL DEFAULT 0`)
    adminSchemaReady = true
  })()
  return adminSchemaPromise
}

/* ------------------------- seed admin (una vez) ------------------------- */
let adminSeeded = false
let adminSeedPromise = null
async function seedAdmin() {
  if (adminSeeded) return
  adminSeedPromise ??= (async () => {
    const existing = await db.get("SELECT id FROM users WHERE role = 'admin' LIMIT 1")
    if (!existing) {
      const hash = await bcrypt.hash('admin123', SALT_ROUNDS)
      await db.run("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')", 'Administrador', 'admin@vertamart.es', hash)
      console.log('• Cuenta admin creada: admin@vertamart.es / admin123')
    }
    adminSeeded = true
  })()
  return adminSeedPromise
}

/* ------------------------------- handlers ------------------------------- */

async function paypalAccessToken(env) {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) return null
  const base = env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'
  const credentials = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`)
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new Error('No se pudo autenticar con PayPal')
  const payload = await res.json()
  return { token: payload.access_token, base }
}

async function paypalRequest(env, path, options = {}) {
  const auth = await paypalAccessToken(env)
  if (!auth) return null
  const res = await fetch(`${auth.base}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  })
  const payload = await res.json().catch(() => null)
  if (!res.ok) throw new Error(payload?.message ?? 'PayPal rechazó la operación')
  return payload
}

/* ==========================================================================
   GENERADORES DE ARCHIVOS REALES PARA PRODUCTOS DIGITALES
   Cada producto comprado descarga un archivo real y utilizable, generado
   desde los metadatos del producto según su categoría:
   plantillas→HTML · presets→XMP · iconos→SVG · fuentes→TTF · modelos-3D→OBJ
   plugins→tema VS Code / plugin Figma / paquete npm · cursos→PDF+HTML
   packs→recursos+manifest. Se entrega en ZIP salvo indicación contraria.
   ========================================================================== */
function text(s) { return new TextEncoder().encode(s) }

function concatBytes(arrs) {
  const total = arrs.reduce((s, a) => s + a.length, 0)
  const out = new Uint8Array(total)
  let p = 0
  for (const a of arrs) { out.set(a, p); p += a.length }
  return out
}

/* ------------------------------- ZIP (store) ---------------------------- */
const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 }
  return t
})()
function crc32(buf) { let crc = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8); return (crc ^ 0xFFFFFFFF) >>> 0 }

function zipStore(files) {
  const enc = new TextEncoder()
  const now = new Date()
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF
  const chunks = []
  const central = []
  let offset = 0
  for (const f of files) {
    const nameBytes = enc.encode(f.name)
    const data = f.data
    const crc = crc32(data)
    const local = new Uint8Array(30 + nameBytes.length)
    const dv = new DataView(local.buffer)
    dv.setUint32(0, 0x04034B50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0x0800, true)
    dv.setUint16(8, 0, true); dv.setUint16(10, dosTime, true); dv.setUint16(12, dosDate, true)
    dv.setUint32(14, crc, true); dv.setUint32(18, data.length, true); dv.setUint32(22, data.length, true)
    dv.setUint16(26, nameBytes.length, true)
    local.set(nameBytes, 30)
    chunks.push(local, data)
    central.push({ nameBytes, crc, size: data.length, offset })
    offset += local.length + data.length
  }
  const cdStart = offset
  for (const c of central) {
    const cd = new Uint8Array(46 + c.nameBytes.length)
    const dv = new DataView(cd.buffer)
    dv.setUint32(0, 0x02014B50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 20, true)
    dv.setUint16(8, 0x0800, true); dv.setUint16(10, 0, true); dv.setUint16(12, dosTime, true); dv.setUint16(14, dosDate, true)
    dv.setUint32(16, c.crc, true); dv.setUint32(20, c.size, true); dv.setUint32(24, c.size, true)
    dv.setUint16(28, c.nameBytes.length, true); dv.setUint32(42, c.offset, true)
    cd.set(c.nameBytes, 46)
    chunks.push(cd)
    offset += cd.length
  }
  const eocd = new Uint8Array(22)
  const dv = new DataView(eocd.buffer)
  dv.setUint32(0, 0x06054B50, true); dv.setUint16(8, central.length, true); dv.setUint16(10, central.length, true)
  dv.setUint32(12, offset - cdStart, true); dv.setUint32(16, cdStart, true)
  chunks.push(eocd)
  return concatBytes(chunks)
}

/* ------------------------------- PDF ------------------------------------ */
function buildPdf(title, lines) {
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  const content = [
    `BT /F1 16 Tf 60 800 Td (${esc(title)}) Tj ET`,
    ...lines.map((l, i) => `BT /F1 11 Tf 60 ${770 - i * 17} Td (${esc(l)}) Tj ET`),
  ].join('\n')
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let out = '%PDF-1.4\n'
  const offsets = []
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const xrefStart = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  offsets.forEach((off) => { out += `${String(off).padStart(10, '0')} 00000 n \n` })
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
  return text(out)
}

/* ------------------------------- WAV ------------------------------------ */
function buildWav(seconds = 3) {
  const rate = 22050
  const samples = rate * seconds
  const dataSize = samples * 2
  const buf = new Uint8Array(44 + dataSize)
  const dv = new DataView(buf.buffer)
  const w = (off, str) => { for (let i = 0; i < str.length; i++) buf[off + i] = str.charCodeAt(i) }
  w(0, 'RIFF'); dv.setUint32(4, 36 + dataSize, true); w(8, 'WAVE')
  w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true)
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true)
  w(36, 'data'); dv.setUint32(40, dataSize, true)
  for (let i = 0; i < samples; i++) {
    const t = i / rate
    const env = 1 - i / samples
    const v = Math.round(10000 * env * (0.5 * Math.sin(2 * Math.PI * 440 * t) + 0.25 * Math.sin(2 * Math.PI * 660 * t) + 0.125 * Math.sin(2 * Math.PI * 880 * t)))
    dv.setInt16(44 + i * 2, v, true)
  }
  return buf
}

/* ------------------------------- XMP (Lightroom) ------------------------ */
function buildXmp(name) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
    crs:Version="12.0"
    crs:Name="${name}"
    crs:PresetType="Normal"
    crs:UUID="${crypto.randomUUID()}"
    crs:WhiteBalance="As Shot"
    crs:Temperature="5200"
    crs:Tint="+5"
    crs:Exposure2012="+0.35"
    crs:Contrast2012="+15"
    crs:Highlights2012="-25"
    crs:Shadows2012="+20"
    crs:Whites2012="+10"
    crs:Blacks2012="-10"
    crs:Clarity2012="+12"
    crs:Dehaze="+8"
    crs:Saturation="-5"
    crs:Vibrance="+20"
    crs:HueAdjustmentGreen="+15"/>
 </rdf:RDF>
</x:xmpmeta>`
  return text(xml)
}

/* ------------------------------- OBJ + MTL ------------------------------ */
function buildObj() {
  const v = []
  const f = []
  let vi = 1
  const box = (cx, cy, cz, sx, sy, sz) => {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2
    const pts = [
      [cx - hx, cy - hy, cz - hz], [cx + hx, cy - hy, cz - hz], [cx + hx, cy + hy, cz - hz], [cx - hx, cy + hy, cz - hz],
      [cx - hx, cy - hy, cz + hz], [cx + hx, cy - hy, cz + hz], [cx + hx, cy + hy, cz + hz], [cx - hx, cy + hy, cz + hz],
    ]
    const base = vi
    pts.forEach((p) => v.push(`v ${p[0].toFixed(3)} ${p[1].toFixed(3)} ${p[2].toFixed(3)}`))
    ;[[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 4, 7, 3]].forEach((q) => f.push(`f ${q.map((i) => base + i).join(' ')}`))
    vi += 8
  }
  box(0, 0.15, 0, 1.6, 0.3, 1.6)
  box(0, 0.85, 0, 0.8, 1.1, 0.8)
  box(0, 1.7, 0, 1.2, 0.6, 1.2)
  box(-0.7, 1.3, 0, 0.5, 0.9, 0.5)
  box(0.7, 1.3, 0, 0.5, 0.9, 0.5)
  const obj = `# Vertamart — modelo 3D de demostración (OBJ válido)\n# Importa en Blender: File → Import → Wavefront (.obj)\n# o en: Maya, Cinema 4D, Unreal, Unity…\n${v.join('\n')}\n\n${f.join('\n')}\n`
  const mtl = `newmtl verta_green\nKa 0.1 0.2 0.1\nKd 0.2 0.6 0.35\nKs 0.4 0.6 0.5\nNs 30\n`
  return { obj, mtl }
}

/* ------------------------------- ICONOS SVG ------------------------------ */
const ICON_PATHS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  heart: '<path d="M12 20s-7-4.4-9.3-8.6C1 8 2.7 5 5.8 5c2 0 3.4 1.1 4.2 2.4h4c.8-1.3 2.2-2.4 4.2-2.4 3.1 0 4.8 3 3.1 6.4C19 15.6 12 20 12 20z"/>',
  arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  x: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/><path d="M3 3h3l2.5 12h10L21 7H6"/>',
  bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M10 21a2 2 0 0 0 4 0"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="14" r="3.5"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  play: '<path d="M7 4.5v15l13-7.5z"/>',
  zap: '<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
}
function makeSvgIcon(name, color = '#16a34a') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name] ?? ICON_PATHS.star}</svg>`
}
function iconPreviewHtml(p, icons) {
  const items = icons.map((n) => `<div class="i">${makeSvgIcon(n)}<p>${n}.svg</p></div>`).join('')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${p.name} — Preview</title><style>body{font-family:system-ui;background:#0b1220;color:#e2e8f0;margin:0;padding:40px}h1{font-size:20px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:16px;margin-top:24px}.i{background:#111a2e;border:1px solid #1e293b;border-radius:14px;padding:20px;display:flex;flex-direction:column;align-items:center;gap:10px}.i p{font-size:11px;color:#64748b;margin:0}.i svg{width:32px;height:32px}</style></head><body><h1>${p.name} — ${icons.length} iconos SVG</h1><div class="grid">${items}</div></body></html>`
}

/* --------------------------- FUENTE: TTF mínimo -------------------------- */
function buildTtf() {
  const u16 = (n) => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n & 0xFFFF, false); return b }
  const s16 = (n) => { const b = new Uint8Array(2); new DataView(b.buffer).setInt16(0, n, false); return b }
  const u32 = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0, false); return b }
  const area = (pts) => { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1] } return s / 2 }
  const norm = (pts, wantHole) => { const ccw = area(pts) > 0; return (ccw !== wantHole) ? [...pts].reverse() : pts }
  // Glifos: avance + polígonos (el primero contorno exterior, el resto huecos)
  const glyphs = [
    { adv: 600, polys: [[[50, 0], [550, 0], [550, 700], [50, 700]]] },
    { adv: 400, polys: [] },
    { adv: 700, polys: [[[110, 0], [590, 0], [350, 720]]] },
    { adv: 700, polys: [[[110, 720], [590, 720], [350, 0]]] },
    { adv: 620, polys: [[[100, 0], [580, 0], [580, 90], [200, 90], [200, 310], [520, 310], [520, 400], [200, 400], [200, 630], [580, 630], [580, 720], [100, 720]]] },
    { adv: 680, polys: [[[100, 0], [180, 0], [180, 300], [560, 60], [560, 120], [180, 360], [180, 330], [520, 330], [520, 660], [180, 660], [180, 720], [100, 720]]] },
    { adv: 660, polys: [[[100, 720], [600, 720], [600, 640], [360, 640], [360, 0], [300, 0], [300, 640], [100, 640]]] },
    { adv: 260, polys: [[[80, 0], [180, 0], [180, 700], [80, 700]]] },
    { adv: 560, polys: [
      [[280, 0], [430, 80], [500, 230], [500, 470], [430, 620], [280, 700], [130, 620], [60, 470], [60, 230], [130, 80]],
      [[280, 160], [360, 210], [400, 280], [400, 420], [360, 490], [280, 540], [200, 490], [160, 420], [160, 280], [200, 210]],
    ] },
    { adv: 460, polys: [[[140, 0], [240, 0], [240, 700], [140, 700]]] },
    { adv: 300, polys: [[[100, 0], [200, 0], [200, 110], [100, 110]]] },
    { adv: 300, polys: [[[110, 300], [190, 300], [190, 700], [110, 700]], [[100, 0], [200, 0], [200, 130], [100, 130]]] },
  ]
  const cmapEntries = [[0x20, 1], [0x21, 11], [0x2E, 10], [0x31, 9], [0x41, 2], [0x45, 4], [0x52, 5], [0x54, 6], [0x56, 3], [0x6C, 7], [0x6F, 8]]
  const nGlyphs = glyphs.length

  // hmtx
  const hmtxParts = []
  glyphs.forEach((g) => { hmtxParts.push(u16(g.adv)); hmtxParts.push(s16(g.polys.length ? Math.min(...g.polys[0].map((p) => p[0])) : 0)) })
  const hmtx = concatBytes(hmtxParts)

  // glyf + loca
  const glyfParts = []
  const locaOffsets = [0]
  let glyfLen = 0
  glyphs.forEach((g) => {
    const contours = g.polys.length ? g.polys.map((poly, idx) => norm(poly, idx > 0)) : []
    const all = contours.flat()
    const xMin = all.length ? Math.min(...all.map((p) => p[0])) : 0
    const yMin = all.length ? Math.min(...all.map((p) => p[1])) : 0
    const xMax = all.length ? Math.max(...all.map((p) => p[0])) : 0
    const yMax = all.length ? Math.max(...all.map((p) => p[1])) : 0
    const parts = [s16(contours.length), s16(xMin), s16(yMin), s16(xMax), s16(yMax)]
    if (contours.length > 0) {
      let end = -1
      contours.forEach((poly) => { end += poly.length; parts.push(u16(end)) })
      parts.push(u16(0)) // instructionLength = 0
      const flags = []
      const xs = []
      const ys = []
      let px = 0, py = 0
      contours.forEach((poly) => poly.forEach(([x, y]) => {
        const dx = x - px, dy = y - py
        let fl = 0x01
        if (dx !== 0) { if (dx > -256 && dx < 256) { fl |= 0x02; if (dx < 0) fl |= 0x10; xs.push(Math.abs(dx)) } else xs.push(dx) }
        if (dy !== 0) { if (dy > -256 && dy < 256) { fl |= 0x04; if (dy < 0) fl |= 0x20; ys.push(Math.abs(dy)) } else ys.push(dy) }
        flags.push(fl)
        px = x; py = y
      }))
      const flagBytes = new Uint8Array(flags.length)
      flags.forEach((fl, i) => { flagBytes[i] = fl & 0xFF })
      const coordBytes = []
      xs.forEach((v) => coordBytes.push(typeof v === 'number' && v > 255 ? s16(v) : new Uint8Array([v & 0xFF])))
      ys.forEach((v) => coordBytes.push(typeof v === 'number' && v > 255 ? s16(v) : new Uint8Array([v & 0xFF])))
      glyfParts.push(concatBytes([...parts, flagBytes, ...coordBytes]))
    } else {
      glyfParts.push(concatBytes(parts))
    }
    glyfLen += glyfParts[glyfParts.length - 1].length
    locaOffsets.push(glyfLen / 2)
  })
  const glyf = concatBytes(glyfParts)
  const loca = concatBytes(locaOffsets.map((o) => u16(o)))

  // head (54 bytes)
  const head = concatBytes([
    u32(0x00010000), u32(0x00010000), u32(0), u32(0x5F0F3CF5),
    u16(0), u16(1000), u32(0), u32(0), u32(0), u32(0),
    s16(0), s16(0), s16(600), s16(720),
    u16(0), u16(8), s16(2), s16(0), s16(0),
  ])

  // hhea (36 bytes)
  const maxPoints = Math.max(...glyphs.map((g) => g.polys.reduce((s, p) => s + p.length, 0)))
  const hhea = concatBytes([
    u32(0x00010000), s16(800), s16(-200), s16(0), u16(700), s16(0), s16(0), s16(700),
    s16(1), s16(0), s16(0), s16(0), s16(0), s16(0), s16(0),
    s16(0), u16(nGlyphs),
  ])

  // maxp (32 bytes)
  const maxContours = Math.max(...glyphs.map((g) => g.polys.length))
  const maxp = concatBytes([
    u32(0x00010000), u16(nGlyphs), u16(maxPoints), u16(maxContours),
    u16(0), u16(0), u16(1), u16(0), u16(0), u16(0), u16(0), u16(0), u16(0), u16(0), u16(0),
  ])

  // cmap format 4
  const segCount = cmapEntries.length + 1
  const segCountX2 = segCount * 2
  const searchRange = 16
  const entrySelector = 3
  const rangeShift = segCountX2 - searchRange
  const cmapParts = [u16(4), u16(0), u16(0), u16(segCountX2), u16(searchRange), u16(entrySelector), u16(rangeShift)]
  cmapEntries.forEach(([c]) => cmapParts.push(u16(c)))
  cmapParts.push(u16(0xFFFF))
  cmapParts.push(u16(0))
  cmapEntries.forEach(([c]) => cmapParts.push(u16(c)))
  cmapParts.push(u16(0xFFFF))
  cmapEntries.forEach(([c, g]) => cmapParts.push(u16((g - c) & 0xFFFF)))
  cmapParts.push(u16(1))
  cmapEntries.forEach(() => cmapParts.push(u16(0)))
  cmapParts.push(u16(0))
  const cmap = concatBytes(cmapParts)
  // (la longitud se parchea debajo)
  new DataView(cmap.buffer).setUint16(2, cmap.length, false)

  // name
  const nameStrings = { 1: 'Verta Demo', 2: 'Regular', 4: 'Verta Demo', 6: 'VertaDemo-Regular' }
  const nameBytes = {}
  let nameStrLen = 0
  const nameOffsets = {}
  for (const id of [1, 2, 4, 6]) {
    nameOffsets[id] = nameStrLen
    const b = text(nameStrings[id])
    nameBytes[id] = b
    nameStrLen += b.length
  }
  const nameParts = [u16(0), u16(4), u16(6 + 4 * 12)]
  for (const id of [1, 2, 4, 6]) {
    nameParts.push(u16(3), u16(1), u16(0x409), u16(id), u16(nameBytes[id].length), u16(nameOffsets[id]))
  }
  for (const id of [1, 2, 4, 6]) nameParts.push(nameBytes[id])
  const name = concatBytes(nameParts)

  // OS/2 (versión 0, 78 bytes)
  const os2 = concatBytes([
    u16(0), u16(550), u16(400), u16(5), u16(0),
    s16(650), s16(600), s16(0), s16(75), s16(650), s16(600), s16(0), s16(350),
    s16(50), s16(250), s16(0),
    new Uint8Array(10), u32(0), u32(0), u32(0), u32(0),
    text('VRTM'), u16(0x0040), u16(0x20), u16(0x6F),
    s16(800), s16(-200), s16(0), u16(800), u16(200),
  ])

  // post (32 bytes, version 3.0)
  const post = concatBytes([u32(0x00030000), u32(0), s16(-75), s16(50), u32(0), u32(0), u32(0), u32(0), u32(0)])

  // ensamblado sfnt
  const tables = { cmap, glyf, head, hhea, hmtx, loca, maxp, name, 'OS/2': os2, post }
  const tags = Object.keys(tables).sort()
  const numTables = tags.length
  const maxPow = 2 ** Math.floor(Math.log2(numTables))
  const header = concatBytes([u32(0x00010000), u16(numTables), u16(maxPow * 16), u16(Math.log2(maxPow)), u16(numTables * 16 - maxPow * 16)])
  const tableChecksum = (data) => {
    const padded = new Uint8Array(Math.ceil(data.length / 4) * 4)
    padded.set(data)
    let sum = 0
    for (let i = 0; i < padded.length; i += 4) sum = (sum + new DataView(padded.buffer).getUint32(i, false)) >>> 0
    return sum
  }
  const records = []
  const tableOffsets = {}
  let offset = header.length + numTables * 16
  for (const tag of tags) {
    tableOffsets[tag] = offset
    records.push({ tag, offset })
    offset += Math.ceil(tables[tag].length / 4) * 4
  }
  const seq = [header]
  for (const r of records) {
    seq.push(concatBytes([text(r.tag), u32(tableChecksum(tables[r.tag])), u32(r.offset), u32(tables[r.tag].length)]))
  }
  for (const r of records) {
    seq.push(tables[r.tag])
    const pad = Math.ceil(tables[r.tag].length / 4) * 4 - tables[r.tag].length
    if (pad) seq.push(new Uint8Array(pad))
  }
  const fontNoAdj = concatBytes(seq)
  const adj = (0xB1B0AFBA - tableChecksum(fontNoAdj)) >>> 0
  const font = fontNoAdj.slice()
  new DataView(font.buffer).setUint32(tableOffsets.head + 8, adj, false)
  return font
}

/* --------------------------- plantillas HTML reales ---------------------- */
const escHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
function slugifyName(s) { return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'recurso' }
function toBase64(bytes) {
  let bin = ''
  const CH = 8192
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH))
  return btoa(bin)
}

function templateHtml(p) {
  const feats = (p.features?.length ? p.features : ['Diseño 100% responsive', 'Fácil de personalizar', 'SEO optimizado', 'Documentación incluida', 'Animaciones suaves', 'Tipografía profesional']).slice(0, 6)
  const featsHtml = feats.map((f) => `<div class="f"><span class="dot"></span><p>${escHtml(f)}</p></div>`).join('')
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(p.name)}</title>
<meta name="description" content="${escHtml(p.description ?? '')}">
<style>
  :root { --brand: #16a34a; --brand2: #15803d; --bg: #ffffff; --dark: #0b1220; --muted: #64748b; --line: #e2e8f0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; color: #0f172a; background: var(--bg); line-height: 1.6; }
  .container { max-width: 1080px; margin: 0 auto; padding: 0 24px; }
  header { position: sticky; top: 0; z-index: 10; background: rgba(255,255,255,.9); backdrop-filter: blur(8px); border-bottom: 1px solid var(--line); }
  .nav { display: flex; align-items: center; justify-content: space-between; height: 64px; }
  .logo { font-weight: 800; font-size: 20px; color: var(--dark); } .logo span { color: var(--brand); }
  .nav a { color: var(--muted); text-decoration: none; margin-left: 22px; font-size: 14px; font-weight: 600; }
  .nav a:hover { color: var(--brand); }
  .btn { display: inline-block; background: var(--brand); color: #fff; padding: 12px 26px; border-radius: 999px; font-weight: 700; text-decoration: none; transition: background .2s; }
  .btn:hover { background: var(--brand2); }
  .hero { padding: 90px 0 70px; text-align: center; background: radial-gradient(60% 60% at 50% 0%, #f0fdf4 0%, #ffffff 70%); }
  .hero .tag { display: inline-block; background: #dcfce7; color: var(--brand2); font-size: 13px; font-weight: 700; padding: 6px 14px; border-radius: 999px; }
  .hero h1 { font-size: clamp(32px, 6vw, 56px); line-height: 1.1; margin: 22px auto 18px; max-width: 760px; color: var(--dark); }
  .hero h1 em { color: var(--brand); font-style: normal; }
  .hero p { max-width: 620px; margin: 0 auto 30px; color: var(--muted); font-size: 17px; }
  .features { padding: 70px 0; }
  .features h2 { text-align: center; font-size: 30px; margin-bottom: 40px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 18px; }
  .f { border: 1px solid var(--line); border-radius: 16px; padding: 22px; transition: transform .2s, box-shadow .2s; }
  .f:hover { transform: translateY(-4px); box-shadow: 0 12px 30px rgba(15,23,42,.08); }
  .f .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--brand); display: inline-block; margin-bottom: 10px; }
  .f p { color: #334155; font-size: 15px; }
  .cta { padding: 80px 0; text-align: center; background: var(--dark); color: #fff; border-radius: 24px; margin: 20px auto 80px; max-width: 1080px; }
  .cta h2 { font-size: 30px; margin-bottom: 14px; } .cta p { color: #94a3b8; margin-bottom: 26px; }
  footer { text-align: center; padding: 30px 0; color: var(--muted); font-size: 13px; border-top: 1px solid var(--line); }
  @media (max-width: 640px) { .nav a { margin-left: 12px; } .hero { padding: 60px 0 50px; } }
</style>
</head>
<body>
<header><div class="container nav"><div class="logo">${escHtml(p.brand ?? 'Vertamart')}<span>.</span></div><nav><a href="#features">Características</a><a href="#cta">Contacto</a></nav></div></header>
<section class="hero">
  <div class="container">
    <span class="tag">Plantilla digital · Versión ${escHtml(p.version ?? '1.0.0')}</span>
    <h1>${escHtml(p.name)} — <em>tu próximo proyecto</em></h1>
    <p>${escHtml(p.description ?? 'Plantilla profesional lista para personalizar y publicar.')}</p>
    <a class="btn" href="#features">Explorar</a>
  </div>
</section>
<section id="features" class="features">
  <div class="container">
    <h2>Características</h2>
    <div class="grid">${featsHtml}</div>
  </div>
</section>
<section class="cta" id="cta">
  <div class="container">
    <h2>¿Listo para empezar?</h2>
    <p>Personaliza esta plantilla con tu contenido y publícala cuando quieras.</p>
    <a class="btn" href="#">Comenzar ahora</a>
  </div>
</section>
<footer><div class="container">© ${new Date().getFullYear()} ${escHtml(p.brand ?? 'Vertamart')} · Plantilla generada con licencia ${escHtml(p.license ?? 'Uso personal y comercial')}</div></footer>
</body>
</html>`
}

/* --------------------------- cursos: página + PDF ------------------------ */
function courseHtml(p) {
  const mods = (p.includes?.length ? p.includes : ['Introducción', 'Fundamentos', 'Proyecto práctico']).slice(0, 6)
  const modsHtml = mods.map((m, i) => `<li data-m="${i}" class="${i === 0 ? 'open' : ''}"><span class="num">${i + 1}</span>${escHtml(m)}</li>`).join('')
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(p.name)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; background: #0b1220; color: #e2e8f0; display: flex; min-height: 100vh; }
  aside { width: 300px; background: #0f172a; padding: 26px 18px; border-right: 1px solid #1e293b; }
  aside h2 { font-size: 16px; margin-bottom: 18px; color: #fff; }
  aside li { list-style: none; display: flex; align-items: center; gap: 10px; padding: 11px 12px; border-radius: 10px; margin-bottom: 6px; color: #94a3b8; cursor: pointer; font-size: 14px; }
  aside li.open { background: #16a34a22; color: #86efac; }
  aside .num { width: 24px; height: 24px; border-radius: 50%; background: #16a34a; color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; }
  main { flex: 1; padding: 40px; max-width: 780px; }
  main h1 { font-size: 28px; margin-bottom: 8px; }
  .meta { color: #64748b; font-size: 14px; margin-bottom: 26px; }
  .card { background: #111a2e; border: 1px solid #1e293b; border-radius: 16px; padding: 22px; margin-bottom: 18px; }
  .card h3 { color: #86efac; margin-bottom: 10px; }
  .card p { color: #cbd5e1; font-size: 15px; }
  label.check { display: flex; align-items: center; gap: 10px; color: #94a3b8; font-size: 14px; cursor: pointer; margin-top: 14px; }
  .btn { background: #16a34a; color: #fff; border: 0; padding: 12px 24px; border-radius: 999px; font-weight: 700; cursor: pointer; margin-top: 10px; }
  @media (max-width: 720px) { body { flex-direction: column; } aside { width: 100%; border-right: 0; border-bottom: 1px solid #1e293b; } }
</style>
</head>
<body>
<aside><h2>Módulos del curso</h2><ul>${modsHtml}</ul></aside>
<main>
  <h1>${escHtml(p.name)}</h1>
  <p class="meta">Versión ${escHtml(p.version ?? '1.0.0')} · ${escHtml(p.fileType ?? 'Curso')} · ${escHtml(p.fileSize ?? '')} · Licencia ${escHtml(p.license ?? 'Uso personal')}</p>
  <div class="card"><h3>Bienvenida</h3><p>${escHtml(p.description ?? 'Curso práctico con acceso inmediato.')}</p></div>
  <div class="card"><h3>Cómo usar este curso</h3><p>Abre cada módulo del menú, sigue las lecciones en orden y marca tu progreso. Tus avances se guardan en este dispositivo.</p><label class="check"><input type="checkbox" data-save="done1"> Módulo 1 completado</label></div>
  <div class="card"><h3>Certificado</h3><p>Al finalizar todos los módulos tendrás acceso al certificado de finalización de ${escHtml(p.brand ?? 'Verta Academy')}.</p><button class="btn" onclick="alert('¡Curso completado! Guarda esta página como comprobante.')">Descargar certificado</button></div>
</main>
<script>
  document.querySelectorAll('aside li').forEach(li => li.addEventListener('click', () => { document.querySelectorAll('aside li').forEach(x => x.classList.remove('open')); li.classList.add('open'); }));
  document.querySelectorAll('[data-save]').forEach(cb => { cb.checked = localStorage.getItem('verta.' + cb.dataset.save) === '1'; cb.addEventListener('change', () => localStorage.setItem('verta.' + cb.dataset.save, cb.checked ? '1' : '0')); });
</script>
</body>
</html>`
}

function courseNotesLines(p) {
  const mods = (p.includes?.length ? p.includes : ['Introducción', 'Fundamentos', 'Proyecto práctico']).slice(0, 8)
  return [
    `Curso: ${p.name}`,
    `Formato: ${p.fileType} · Tamaño: ${p.fileSize}`,
    `Licencia: ${p.license} · Versión: ${p.version ?? '1.0.0'}`,
    '',
    'Contenido del curso:',
    ...mods.map((m, i) => `${i + 1}. ${m}`),
    '',
    'Requisitos:',
    ...(p.requirements?.length ? p.requirements : ['Conexión a internet', 'Ganas de aprender']).map((r) => `  • ${r}`),
  ]
}

/* ------------------------------- plugins -------------------------------- */
function vsCodeTheme(p) {
  return {
    name: p.name,
    type: 'dark',
    colors: {
      'editor.background': '#0b1220',
      'editor.foreground': '#e2e8f0',
      'editor.selectionBackground': '#16a34a55',
      'focusBorder': '#22c55e',
      'activityBar.background': '#0b1220',
      'sideBar.background': '#0f172a',
      'editorGutter.background': '#0b1220',
      'statusBar.background': '#15803d',
      'statusBar.foreground': '#ffffff',
      'titleBar.activeBackground': '#0b1220',
      'input.background': '#111a2e',
      'input.border': '#1e293b',
    },
    tokenColors: [
      { scope: ['keyword', 'storage'], settings: { foreground: '#4ade80' } },
      { scope: ['string', 'string.quoted'], settings: { foreground: '#86efac' } },
      { scope: ['comment'], settings: { foreground: '#64748b', fontStyle: 'italic' } },
      { scope: ['entity.name.function', 'support.function'], settings: { foreground: '#facc15' } },
      { scope: ['variable', 'entity.name.variable'], settings: { foreground: '#7dd3fc' } },
      { scope: ['constant', 'constant.numeric'], settings: { foreground: '#fda4af' } },
      { scope: ['entity.name.class', 'support.type'], settings: { foreground: '#f0abfc' } },
    ],
  }
}
function figmaPlugin(p) {
  const manifest = JSON.stringify({
    name: p.name, id: `vertamart-${p.slug}`, api: '1.0.0', main: 'code.js', ui: 'ui.html', editorType: ['figma'], networkAccess: { allowedDomains: ['none'] },
  }, null, 2)
  const code = `// ${p.name} — plugin de Figma (demo real)
figma.showUI(__html__, { width: 300, height: 240 })
figma.ui.onmessage = (msg) => {
  if (msg.type === 'create') {
    const frame = figma.createFrame()
    frame.name = 'Vertamart'
    frame.resize(640, 360)
    frame.fills = [{ type: 'SOLID', color: { r: 0.04, g: 0.07, b: 0.13 } }]
    for (let i = 0; i < 5; i++) {
      const rect = figma.createRectangle()
      rect.resize(60 + i * 30, 40)
      rect.x = 40 + i * 120
      rect.y = 160
      rect.fills = [{ type: 'SOLID', color: { r: 0.09, g: 0.64, b: 0.29 } }]
      rect.cornerRadius = 8
      frame.appendChild(rect)
    }
    frame.x = figma.viewport.center.x - 320
    frame.y = figma.viewport.center.y - 180
    figma.currentPage.selection = [frame]
    figma.viewport.scrollAndZoomIntoView([frame])
  }
  if (msg.type === 'close') figma.closePlugin()
}
`
  const ui = `<!doctype html><html><body style="font-family:system-ui;background:#0b1220;color:#e2e8f0;padding:16px"><h2 style="font-size:16px;margin:0 0 12px">${escHtml(p.name)}</h2><button id="b" style="background:#16a34a;color:#fff;border:0;padding:10px 16px;border-radius:8px;font-weight:700;cursor:pointer">Crear marco demo</button><script>document.getElementById('b').onclick=()=>parent.postMessage({pluginMessage:{type:'create'}},'*')</script></body></html>`
  return { manifest, code, ui }
}
function npmPlugin(p) {
  const pkg = JSON.stringify({
    name: `vertamart-${slugifyName(p.name)}`, version: p.version ?? '1.0.0', description: p.description ?? '',
    main: 'index.js', license: 'MIT', files: ['index.js'],
  }, null, 2)
  const js = `/** ${p.name} v${p.version ?? '1.0.0'}
 * ${p.description ?? ''}
 * Compatibilidad: ${p.compatibility ?? ''}
 * Licencia: ${p.license ?? 'Uso personal y comercial'}
 */

/** Convierte un hex (#16a34a) a RGB. */
export function hexToRgb(hex) {
  const h = hex.replace('#', '')
  if (h.length !== 6) throw new Error('Formato inválido')
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

/** Genera una paleta de N tonos a partir de un color base. */
export function palette(base, n = 5) {
  const { r, g, b } = hexToRgb(base)
  return Array.from({ length: n }, (_, i) => {
    const t = i / Math.max(1, n - 1)
    const mix = (v) => Math.round(v + (255 - v) * t * 0.6)
    return \`rgb(\${mix(r)}, \${mix(g)}, \${mix(b)})\`
  })
}

/** Retorna un color con opacidad aplicada. */
export function withAlpha(hex, alpha) {
  const { r, g, b } = hexToRgb(hex)
  return \`rgba(\${r}, \${g}, \${b}, \${alpha})\`
}

export default { hexToRgb, palette, withAlpha }
`
  return { packageJson: pkg, indexJs: js }
}

/* ---------------------------- packs: recursos ---------------------------- */
function packManifest(p) {
  return JSON.stringify({
    name: p.name, version: p.version ?? '1.0.0', format: p.fileType, size: p.fileSize,
    license: p.license, compatibility: p.compatibility, brand: p.brand,
    includes: p.includes ?? [], updatedAt: new Date().toISOString(),
  }, null, 2)
}
function makeMockupSvg(title, sub) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
<rect width="1200" height="800" fill="#0b1220"/>
<rect x="140" y="120" width="920" height="560" rx="24" fill="#111a2e" stroke="#1e293b" stroke-width="2"/>
<circle cx="240" cy="200" r="36" fill="#16a34a"/>
<rect x="300" y="184" width="340" height="18" rx="9" fill="#e2e8f0"/>
<rect x="300" y="216" width="220" height="12" rx="6" fill="#64748b"/>
<rect x="140" y="560" width="920" height="120" rx="20" fill="#16a34a22" stroke="#16a34a" stroke-width="2"/>
<text x="600" y="640" font-family="system-ui" font-size="34" font-weight="700" fill="#86efac" text-anchor="middle">${escHtml(title)}</text>
<text x="600" y="440" font-family="system-ui" font-size="44" font-weight="800" fill="#ffffff" text-anchor="middle">${escHtml(sub)}</text>
</svg>`
}
function makeSocialSvg(title, sub) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#15803d"/><stop offset="1" stop-color="#0b1220"/></linearGradient></defs>
<rect width="1080" height="1080" fill="url(#g)"/>
<circle cx="900" cy="180" r="160" fill="#ffffff12"/>
<circle cx="180" cy="900" r="220" fill="#16a34a22"/>
<text x="540" y="480" font-family="system-ui" font-size="64" font-weight="800" fill="#ffffff" text-anchor="middle">${escHtml(title)}</text>
<text x="540" y="560" font-family="system-ui" font-size="36" fill="#86efac" text-anchor="middle">${escHtml(sub)}</text>
<text x="540" y="960" font-family="system-ui" font-size="30" font-weight="700" fill="#ffffffcc" text-anchor="middle">vertamart.pages.dev</text>
</svg>`
}
function makeTextureSvg() {
  const tiles = []
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    tiles.push(`<rect x="${x * 128}" y="${y * 128}" width="128" height="128" fill="${(x + y) % 2 === 0 ? '#16a34a' : '#15803d'}"/>`)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${tiles.join('')}</svg>`
}
function genericContentHtml(p) {
  const inc = (p.includes?.length ? p.includes : ['Archivos principales', 'Documentación', 'Extras']).map((i) => `<li>${escHtml(i)}</li>`).join('')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escHtml(p.name)}</title><style>body{font-family:system-ui;background:#0b1220;color:#e2e8f0;max-width:720px;margin:40px auto;padding:0 20px}h1{font-size:26px;color:#86efac}.meta{color:#64748b;font-size:14px}ul{line-height:2}.box{background:#111a2e;border:1px solid #1e293b;border-radius:14px;padding:18px 22px;margin:14px 0}</style></head><body><h1>${escHtml(p.name)}</h1><p class="meta">Versión ${escHtml(p.version ?? '1.0.0')} · ${escHtml(p.fileType ?? '')} · ${escHtml(p.fileSize ?? '')}</p><div class="box"><p>${escHtml(p.description ?? '')}</p></div><div class="box"><strong>Contenido incluido:</strong><ul>${inc}</ul></div><div class="box"><strong>Compatibilidad:</strong> ${escHtml(p.compatibility ?? '')}<br><strong>Licencia:</strong> ${escHtml(p.license ?? 'Uso personal y comercial')}</div></body></html>`
}
function objPreviewHtml(p) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escHtml(p.name)} — Preview 3D</title><style>body{font-family:system-ui;background:#0b1220;color:#e2e8f0;margin:0;padding:40px;text-align:center}h1{font-size:22px;color:#86efac}p{color:#94a3b8}.stage{max-width:420px;margin:30px auto}</style></head><body><h1>${escHtml(p.name)}</h1><p>Modelo OBJ + materiales MTL incluidos. Ábrelo en Blender, Maya, Cinema 4D, Unreal o Unity.</p><div class="stage"><svg viewBox="0 0 200 200"><rect x="20" y="150" width="160" height="20" fill="#1e293b"/><rect x="70" y="80" width="60" height="70" fill="#16a34a"/><rect x="50" y="30" width="100" height="50" fill="#15803d"/><rect x="10" y="100" width="50" height="70" fill="#22c55e"/><rect x="140" y="100" width="50" height="70" fill="#22c55e"/></svg></div><p>Modelo de demostración generado por Vertamart — versión ${escHtml(p.version ?? '1.0.0')}</p></body></html>`
}
function fontCss(p) {
  return `@font-face {
  font-family: 'Verta Demo';
  src: url('font.ttf') format('truetype');
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}

.verta-demo {
  font-family: 'Verta Demo', sans-serif;
}
`
}
function fontSpecimenHtml(p, base64Ttf) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(p.name)} — Muestra</title>
<style>@font-face{font-family:'Verta Demo';src:url(data:font/ttf;base64,${base64Ttf}) format('truetype')}
body{font-family:system-ui;background:#0b1220;color:#e2e8f0;margin:0;padding:50px 30px}.demo{font-family:'Verta Demo',sans-serif;color:#86efac;line-height:1.1}.big{font-size:96px}.med{font-size:44px}.meta{color:#64748b;font-size:14px;margin:24px 0 10px}.row{border-bottom:1px solid #1e293b;padding:22px 0}h1{font-size:22px}</style></head><body><h1>${escHtml(p.name)} — Muestra de fuente (v${escHtml(p.version ?? '1.0.0')})</h1>
<p class="meta">Instala font.ttf en tu sistema o usa font.css en tu proyecto web.</p>
<div class="row"><div class="demo big">Vertamart</div></div>
<div class="row"><div class="demo med">Aa Vv Tt 1. !</div></div>
<div class="row"><div class="demo" style="font-size:24px">La fuente digital de demostración incluida con tu compra.</div></div></body></html>`
}

/* ----------------------------- README y licencia ------------------------- */
function productReadme(p, licenseKey) {
  const lines = [
    `${p.name}`,
    `${'='.repeat(Math.min(50, String(p.name).length + 2))}`,
    `Producto digital entregado por Vertamart (vertamart.pages.dev)`,
    '',
    `  Código:       ${p.productCode ?? '—'}`,
    `  Versión:      ${p.version ?? '1.0.0'}`,
    `  Formato:      ${p.fileType ?? 'ZIP'}`,
    `  Tamaño:       ${p.fileSize ?? '—'}`,
    `  Licencia:     ${p.license ?? 'Uso personal y comercial'}`,
    `  Compatible:   ${p.compatibility ?? '—'}`,
    `  Actualiz.:    ${p.updates ?? '—'}`,
    `  Soporte:      ${p.support ?? '—'}`,
    `  Descargado:   ${new Date().toISOString().slice(0, 10)}`,
    '',
    `DESCRIPCIÓN`,
    p.description ?? '',
    '',
    `QUÉ INCLUYE`,
    ...(p.includes?.length ? p.includes.map((i) => `  • ${i}`) : ['  • Archivos del producto']),
    '',
    `REQUISITOS`,
    ...(p.requirements?.length ? p.requirements.map((i) => `  • ${i}`) : ['  • Ninguno adicional']),
    '',
    `LICENCIA ÚNICA`,
    `  ${licenseKey}`,
    `  Esta licencia está asociada a tu cuenta y a este pedido. No la compartas.`,
    '',
    `Gracias por tu compra. Si el administrador publica una versión nueva, podrás`,
    `descargarla desde tu biblioteca en Vertamart según las condiciones de la licencia.`,
  ]
  return lines.join('\n')
}
function licenseText(p, licenseKey) {
  return [
    `VERTAMART — LICENCIA DE PRODUCTO DIGITAL`,
    `======================================`,
    `Producto:   ${p.name}`,
    `Código:     ${p.productCode ?? '—'}`,
    `Versión:    ${p.version ?? '1.0.0'}`,
    `Nº licencia: ${licenseKey}`,
    `Fecha:      ${new Date().toISOString().slice(0, 10)}`,
    `Tipo:       ${p.license ?? 'Uso personal y comercial'}`,
    '',
    `Este documento acredita la compra legítima del producto digital anterior.`,
    `La licencia es personal e intransferible, vinculada a la cuenta que realizó`,
    `la compra. No está permitida la redistribución del archivo.`,
    '',
    `Vertamart — vertamart.pages.dev`,
  ].join('\n')
}

/* ------------------- despachador principal de archivos ------------------- */
const zipResult = (p, files) => ({ filename: `vertamart-${p.slug}-v${p.version ?? '1.0.0'}.zip`, contentType: 'application/zip', bytes: zipStore(files) })

function buildProductFile(p, licenseKey) {
  const readme = productReadme(p, licenseKey)
  const lic = licenseText(p, licenseKey)
  const base = (extra) => [...extra, { name: 'README.txt', data: text(readme) }, { name: 'LICENCIA.txt', data: text(lic) }]
  const cat = p.category
  if (cat === 'plantillas') {
    return zipResult(p, base([{ name: 'index.html', data: text(templateHtml(p)) }]))
  }
  if (cat === 'presets') {
    const names = (p.includes?.length ? p.includes : ['Forest Green', 'Moody Green', 'Soft Portrait', 'Golden Hour', 'Noir']).slice(0, 5)
    return zipResult(p, base(names.map((n, i) => ({ name: `presets/${String(i + 1).padStart(2, '0')}-${slugifyName(n)}.xmp`, data: buildXmp(n) }))))
  }
  if (cat === 'iconos') {
    const icons = Object.keys(ICON_PATHS)
    return zipResult(p, base([
      ...icons.map((n) => ({ name: `iconos/${n}.svg`, data: text(makeSvgIcon(n)) })),
      { name: 'preview.html', data: text(iconPreviewHtml(p, icons)) },
    ]))
  }
  if (cat === 'fuentes') {
    const ttf = buildTtf()
    return zipResult(p, base([
      { name: 'font.ttf', data: ttf },
      { name: 'font.css', data: text(fontCss(p)) },
      { name: 'specimen.html', data: text(fontSpecimenHtml(p, toBase64(ttf))) },
    ]))
  }
  if (cat === 'modelos-3d') {
    const m = buildObj()
    return zipResult(p, base([
      { name: 'modelo.obj', data: text(m.obj) },
      { name: 'materiales.mtl', data: text(m.mtl) },
      { name: 'preview.html', data: text(objPreviewHtml(p)) },
    ]))
  }
  if (cat === 'plugins') {
    const lower = `${p.name} ${p.compatibility ?? ''} ${p.description ?? ''}`.toLowerCase()
    if (lower.includes('vs code') || lower.includes('vscode') || lower.includes('theme')) {
      return zipResult(p, base([{ name: 'tema-vscode.json', data: text(JSON.stringify(vsCodeTheme(p), null, 2)) }]))
    }
    if (lower.includes('figma')) {
      const fig = figmaPlugin(p)
      return zipResult(p, base([
        { name: 'manifest.json', data: text(fig.manifest) },
        { name: 'code.js', data: text(fig.code) },
        { name: 'ui.html', data: text(fig.ui) },
      ]))
    }
    const npm = npmPlugin(p)
    return zipResult(p, base([
      { name: 'package.json', data: text(npm.packageJson) },
      { name: 'index.js', data: text(npm.indexJs) },
    ]))
  }
  if (cat === 'cursos') {
    return zipResult(p, base([
      { name: 'curso.html', data: text(courseHtml(p)) },
      { name: 'apuntes.pdf', data: buildPdf(`${p.name} — Apuntes`, courseNotesLines(p)) },
    ]))
  }
  if (cat === 'packs') {
    const files = []
    const lower = `${p.name} ${p.description ?? ''}`.toLowerCase()
    if (lower.includes('sonido') || lower.includes('wav') || lower.includes('audio')) {
      files.push({ name: 'demo-sonido.wav', data: buildWav(3) })
    }
    if (lower.includes('mockup')) {
      files.push({ name: 'plantilla-mockup-1.svg', data: text(makeMockupSvg(`${p.name} — Tarjeta`, 'Tarjeta de presentación')) })
      files.push({ name: 'plantilla-mockup-2.svg', data: text(makeMockupSvg(`${p.name} — Póster`, 'Póster A4 vertical')) })
    }
    if (lower.includes('social') || lower.includes('instagram')) {
      files.push({ name: 'post-instagram-1.svg', data: text(makeSocialSvg(p.name, 'Post 1080×1080')) })
      files.push({ name: 'historia-instagram-1.svg', data: text(makeSocialSvg(p.name, 'Historia 1080×1920')) })
    }
    if (lower.includes('textura') || lower.includes('pbr')) {
      files.push({ name: 'textura-verde.svg', data: text(makeTextureSvg()) })
    }
    files.push({ name: 'manifest.json', data: text(packManifest(p)) })
    files.push({ name: 'contenido.html', data: text(genericContentHtml(p)) })
    return zipResult(p, base(files))
  }
  if (cat === 'android') {
    const lower = `${p.name} ${p.description ?? ''}`.toLowerCase()
    const files = []
    if (lower.includes('icon')) {
      const names = ['camera', 'gallery', 'mail', 'music', 'phone', 'settings', 'maps', 'clock', 'weather', 'games']
      files.push(...names.map((n, i) => ({ name: `iconos/android-${n}.svg`, data: text(makeAndroidIcon(n, i)) })))
      files.push({ name: 'iconos/preview.html', data: text(androidIconsPreviewHtml(p, names)) })
    }
    if (lower.includes('wallpaper') || lower.includes('fondo')) {
      const tones = ['#14532d', '#16a34a', '#052e16', '#0b1220', '#1e3a2f']
      tones.forEach((c, i) => files.push({ name: `wallpapers/fondo-${i + 1}.svg`, data: text(makeAndroidWallpaper(p, c, i + 1)) }))
      files.push({ name: 'wallpapers/README.txt', data: text('Fondos 1440×3200 (escala a tu pantalla). Formato SVG escalable sin pérdida.') })
    }
    if (lower.includes('ui kit') || lower.includes('interfaz')) {
      files.push({ name: 'uikit/componentes.html', data: text(androidUiKitHtml(p)) })
      files.push({ name: 'uikit/colors.xml', data: text(androidColorsXml()) })
      files.push({ name: 'uikit/strings.xml', data: text(androidStringsXml()) })
    }
    if (lower.includes('launcher')) {
      files.push({ name: 'launcher/manifest.json', data: text(androidLauncherManifest(p)) })
      files.push({ name: 'launcher/iconos-extra.svg', data: text(makeAndroidIcon('apps', 9)) })
    }
    if (lower.includes('developer') || lower.includes('desarrollador')) {
      files.push({ name: 'dev/MainActivity.kt', data: text(androidKotlinSample(p)) })
      files.push({ name: 'dev/build.gradle.kts', data: text(androidGradleSample()) })
      files.push({ name: 'dev/AndroidManifest.xml', data: text(androidManifestSample(p)) })
    }
    files.push({ name: 'contenido.html', data: text(genericContentHtml(p)) })
    return zipResult(p, base(files))
  }
  // Categoría genérica: nunca entrega vacío
  return zipResult(p, base([
    { name: 'contenido.html', data: text(genericContentHtml(p)) },
  ]))
}

/* --------------------- generadores de contenido Android ------------------ */
function makeAndroidIcon(name, i) {
  const colors = ['#16a34a', '#22c55e', '#4ade80', '#15803d', '#0f172a', '#2563eb', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6']
  const c = colors[i % colors.length]
  return `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192"><rect width="192" height="192" rx="42" fill="${c}"/><g stroke="#fff" stroke-width="12" stroke-linecap="round" fill="none">${androidIconPath(name)}</g></svg>`
}
function androidIconPath(name) {
  const p = {
    camera: '<circle cx="96" cy="96" r="30"/><path d="M66 60 L74 42 H118 L126 60 M60 60 H132 V138 H60 Z"/>',
    gallery: '<rect x="52" y="56" width="88" height="80" rx="14"/><circle cx="78" cy="84" r="10"/><path d="M56 126 L86 100 L104 116 L122 100 L138 118"/>',
    mail: '<rect x="46" y="60" width="100" height="72" rx="14"/><path d="M50 66 L96 104 L142 66"/>',
    music: '<path d="M84 118 V66 L132 56 V108"/><circle cx="70" cy="118" r="16"/><circle cx="118" cy="108" r="16"/>',
    phone: '<path d="M66 44 H126 V148 H66 Z M84 120 H108"/>',
    settings: '<circle cx="96" cy="96" r="22"/><circle cx="96" cy="96" r="40" stroke-dasharray="18 14"/>',
    maps: '<path d="M96 44 C70 44 54 64 54 84 C54 108 96 148 96 148 C96 148 138 108 138 84 C138 64 122 44 96 44 Z"/><circle cx="96" cy="82" r="12"/>',
    clock: '<circle cx="96" cy="96" r="40"/><path d="M96 70 V98 L116 112"/>',
    weather: '<circle cx="96" cy="74" r="22"/><path d="M74 118 H126 C136 118 142 110 142 102 C142 94 136 88 126 88 C122 88 118 90 116 92"/><path d="M96 44 V30 M140 74 H152 M52 74 H64 M128 48 L136 40 M64 48 L56 40"/>',
    games: '<rect x="44" y="84" width="104" height="56" rx="20"/><path d="M76 84 V70 H116 V84 M64 104 H84 M74 94 V114 M84 104 H104"/>',
    apps: '<rect x="56" y="56" width="32" height="32" rx="8"/><rect x="104" y="56" width="32" height="32" rx="8"/><rect x="56" y="104" width="32" height="32" rx="8"/><rect x="104" y="104" width="32" height="32" rx="8"/>',
  }
  return p[name] ?? '<circle cx="96" cy="96" r="30"/>'
}
function makeAndroidWallpaper(p, color, n) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="3200" viewBox="0 0 1440 3200"><defs><radialGradient id="g${n}" cx="50%" cy="35%" r="75%"><stop offset="0%" stop-color="${color}"/><stop offset="100%" stop-color="#020617"/></radialGradient></defs><rect width="1440" height="3200" fill="url(#g${n})"/><circle cx="720" cy="900" r="260" fill="none" stroke="#ffffff22" stroke-width="4"/><circle cx="720" cy="900" r="420" fill="none" stroke="#ffffff14" stroke-width="4"/><text x="720" y="1600" text-anchor="middle" fill="#ffffffcc" font-family="sans-serif" font-size="72" font-weight="700">${escHtml(p.name.split(' ').slice(0, 3).join(' '))}</text><text x="720" y="1680" text-anchor="middle" fill="#ffffff66" font-family="sans-serif" font-size="34">Vertamart · demo de demostración</text></svg>`
}
function androidIconsPreviewHtml(p, names) {
  const tiles = names.map((n) => `<div style="display:inline-block;text-align:center;margin:10px"><img src="android-${n}.svg" width="72" height="72"><p style="color:#94a3b8;font-size:12px">${n}</p></div>`).join('')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escHtml(p.name)} — vista previa</title></head><body style="background:#0b1220;font-family:system-ui;padding:30px"><h1 style="color:#86efac;font-size:20px">${escHtml(p.name)}</h1><p style="color:#64748b;font-size:13px">Iconos SVG listos para tu launcher o aplicación. Contenido de demostración.</p><div style="margin-top:20px">${tiles}</div></body></html>`
}
function androidUiKitHtml(p) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(p.name)}</title><style>body{font-family:system-ui;background:#0b1220;color:#e2e8f0;padding:30px;max-width:640px;margin:auto}h1{color:#86efac;font-size:22px}.card{background:#111a2e;border:1px solid #1e293b;border-radius:16px;padding:20px;margin:14px 0}.btn{display:inline-block;background:#16a34a;color:#fff;padding:10px 22px;border-radius:999px;font-weight:700}.chip{display:inline-block;background:#16a34a22;color:#86efac;padding:4px 12px;border-radius:999px;font-size:12px;margin:2px}input{width:100%;background:#0f172a;border:1px solid #334155;border-radius:12px;padding:12px;color:#fff;margin:6px 0}</style></head><body><h1>${escHtml(p.name)}</h1><p>Componentes Material adaptados a la identidad verde de Vertamart. Contenido de demostración para diseñar tu app Android.</p><div class="card"><p style="font-size:12px;color:#64748b">Botón</p><span class="btn">Continuar</span></div><div class="card"><p style="font-size:12px;color:#64748b">Chips</p><span class="chip">Inicio</span><span class="chip">Categorías</span><span class="chip">Ajustes</span></div><div class="card"><p style="font-size:12px;color:#64748b">Campo de texto</p><input placeholder="Buscar…"></div></body></html>`
}
function androidColorsXml() {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <color name="verta_green">#16A34A</color>
  <color name="verta_green_dark">#15803D</color>
  <color name="verta_bg">#0B1220</color>
  <color name="verta_surface">#111A2E</color>
  <color name="verta_text">#E2E8F0</color>
  <color name="verta_muted">#64748B</color>
</resources>`
}
function androidStringsXml() {
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="app_name">Vertamart Demo</string>
  <string name="welcome">Bienvenido a Vertamart</string>
  <string name="action_download">Descargar</string>
  <string name="action_buy">Comprar</string>
</resources>`
}
function androidLauncherManifest(p) {
  return JSON.stringify({ name: p.name, version: p.version ?? '1.0.0', type: 'launcher-resources', iconCount: 12, wallpaperCount: 5, license: p.license ?? 'Uso personal', note: 'Contenido de demostración de Vertamart' }, null, 2)
}
function androidKotlinSample(p) {
  return `package com.vertamart.demo

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.*

/** Ejemplo funcional de MainActivity para el pack de desarrollo (demo). */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Scaffold { padding ->
                    Column(Modifier.padding(padding).padding(24.dp)) {
                        Text(text = "${escHtml(p.name)}", style = MaterialTheme.typography.headlineMedium)
                        Text(text = "Pack de desarrollo de demostración de Vertamart")
                        Button(onClick = { /* acción de ejemplo */ }) { Text("Descargar") }
                    }
                }
            }
        }
    }
}`
}
function androidGradleSample() {
  return `plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.vertamart.demo"
    compileSdk = 34
    defaultConfig {
        applicationId = "com.vertamart.demo"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.compose.ui:ui:1.6.8")
    implementation("androidx.compose.material3:material3:1.2.1")
}`
}
function androidManifestSample(p) {
  return `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application android:label="${escHtml(p.name)}" android:theme="@style/Theme.Vertamart">
        <activity android:name=".MainActivity" android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>`
}

function promoToApi(r) {
  return {
    id: r.id,
    code: r.code,
    type: r.type ?? 'percent',
    percent: r.percent,
    value: r.value ?? 0,
    minAmount: r.min_amount,
    startsAt: r.starts_at ?? null,
    expiresAt: r.expires_at ?? null,
    maxUses: r.max_uses ?? null,
    usedCount: r.used_count ?? 0,
    active: r.active,
    createdAt: r.created_at,
  }
}

const handlers = {
  // AUTH
  async register(body) {
    const name = String(body?.name ?? '').trim()
    const email = String(body?.email ?? '').trim().toLowerCase()
    const password = String(body?.password ?? '')
    if (name.length < 2) return fail(400, 'El nombre debe tener al menos 2 caracteres', 'INVALID_NAME')
    if (!EMAIL_RE.test(email)) return fail(400, 'Correo electrónico no válido', 'INVALID_EMAIL')
    if (password.length < 6) return fail(400, 'La contraseña debe tener al menos 6 caracteres', 'WEAK_PASSWORD')
    const exists = await db.get('SELECT id FROM users WHERE email = ?', email)
    if (exists) return fail(409, 'Ya existe una cuenta con este correo', 'EMAIL_TAKEN')
    const hash = await bcrypt.hash(password, SALT_ROUNDS)
    const info = await db.run('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)', name, email, hash)
    const user = await db.get('SELECT * FROM users WHERE id = ?', info.lastId)
    const token = await createSession(user.id)
    return json({ token, user: publicUser(user) }, 201)
  },

  async supportLogin(body) {
    const password = String(body?.password ?? '')
    const user = await db.get("SELECT * FROM users WHERE email = 'support@vertamart.es' AND role = 'support'")
    if (!user || password !== 'soporte123') return fail(401, 'Contraseña de soporte incorrecta', 'INVALID_SUPPORT_PASSWORD')
    const token = await createSession(user.id)
    return json({ token, user: publicUser(user) })
  },

  async login(body) {
    const email = String(body?.email ?? '').trim().toLowerCase()
    const password = String(body?.password ?? '')
    if (!EMAIL_RE.test(email) || !password) return fail(400, 'Ingresa tu correo y contraseña', 'INVALID_CREDENTIALS')
    const user = await db.get('SELECT * FROM users WHERE email = ?', email)
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return fail(401, 'Correo o contraseña incorrectos', 'INVALID_CREDENTIALS')
    }
    const token = await createSession(user.id)
    return json({ token, user: publicUser(user) })
  },

  async meGet(user) {
    const verification = await verificationFor(user.id)
    return json({ user: { ...user, verified: verification.verified }, verification: verification.checks })
  },

  async verification(user) {
    return json(await verificationFor(user.id))
  },

  // RECUPERACIÓN DE CONTRASEÑA
  async forgotPassword(body, req, m, env) {
    const email = String(body?.email ?? '').trim().toLowerCase()
    if (!EMAIL_RE.test(email)) return fail(400, 'Correo electrónico no válido', 'INVALID_EMAIL')
    const frontend = env.FRONTEND_URL || 'https://vertamart.pages.dev'
    // Respuesta genérica: no se revela si el correo está registrado.
    const generic = { message: 'Si el correo está registrado, recibirás un enlace para restablecer la contraseña. Caduca en 1 hora.', emailSent: false }
    const user = await db.get('SELECT * FROM users WHERE email = ?', email)
    if (!user) return json(generic)
    await db.run('DELETE FROM password_resets WHERE user_id = ?', user.id)
    const token = randomToken()
    const expiresAt = new Date(Date.now() + 3600_000).toISOString()
    await db.run('INSERT INTO password_resets (token, user_id, expires_at) VALUES (?, ?, ?)', token, user.id, expiresAt)
    const resetUrl = `${frontend}/recuperar?token=${token}`
    const sent = await sendEmail(
      env,
      user.email,
      'Restablece tu contraseña de Vertamart',
      `<p>Hola ${user.name},</p><p>Has solicitado restablecer tu contraseña. Abre este enlace (caduca en 1 hora):</p><p><a href="${resetUrl}">Restablecer contraseña</a></p><p>Si no fuiste tú, ignora este mensaje.</p>`,
    )
    if (sent) return json({ ...generic, emailSent: true })
    // Sin proveedor de correo configurado (modo demo): se devuelve el enlace para poder probar el flujo.
    return json({ ...generic, resetUrl, demo: true })
  },

  async verifyResetToken(req) {
    const token = new URL(req.url).searchParams.get('token') ?? ''
    if (!/^[a-f0-9]{64}$/.test(token)) return json({ valid: false })
    const row = await db.get(
      "SELECT r.token FROM password_resets r WHERE r.token = ? AND r.used_at IS NULL AND r.expires_at > datetime('now')",
      token,
    )
    return json({ valid: !!row })
  },

  async resetPassword(body) {
    const token = String(body?.token ?? '')
    const password = String(body?.password ?? '')
    if (password.length < 6) return fail(400, 'La contraseña debe tener al menos 6 caracteres', 'WEAK_PASSWORD')
    const row = await db.get(
      "SELECT * FROM password_resets WHERE token = ? AND used_at IS NULL AND expires_at > datetime('now')",
      token,
    )
    if (!row) return fail(400, 'El enlace no es válido o ha caducado. Solicita uno nuevo.', 'INVALID_RESET_TOKEN')
    const hash = await bcrypt.hash(password, SALT_ROUNDS)
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', hash, row.user_id)
    await db.run("UPDATE password_resets SET used_at = datetime('now') WHERE token = ?", token)
    // Cierra todas las sesiones activas de esa cuenta.
    await db.run('DELETE FROM sessions WHERE user_id = ?', row.user_id)
    return json({ message: 'Contraseña actualizada. Ya puedes iniciar sesión con tu nueva contraseña.' })
  },

  // OAUTH: GOOGLE Y APPLE (requieren secretos; si faltan, se redirige con aviso)
  async oauthStart(provider, req, env) {
    const frontend = env.FRONTEND_URL || 'https://vertamart.pages.dev'
    const ok = provider === 'google'
      ? !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
      : !!(env.APPLE_CLIENT_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY)
    if (!ok) return Response.redirect(`${frontend}/login?oauth=no_configurado`, 302)
    const origin = new URL(req.url).origin
    const redirectUri = `${origin}/api/auth/${provider}/callback`
    const state = randomToken().slice(0, 40)
    await db.run('INSERT INTO oauth_states (state, provider) VALUES (?, ?)', state, provider)
    await db.run("DELETE FROM oauth_states WHERE created_at < datetime('now', '-15 minutes')")
    const url = provider === 'google'
      ? `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(env.GOOGLE_CLIENT_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent('openid email profile')}&state=${state}&prompt=select_account`
      : `https://appleid.apple.com/auth/authorize?client_id=${encodeURIComponent(env.APPLE_CLIENT_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&response_mode=form_post&scope=${encodeURIComponent('name email')}&state=${state}`
    return Response.redirect(url, 302)
  },

  async googleCallback(req, env) {
    const frontend = env.FRONTEND_URL || 'https://vertamart.pages.dev'
    const onError = () => Response.redirect(`${frontend}/login?oauth=error`, 302)
    try {
      const url = new URL(req.url)
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')
      const valid = state && !!(await db.get("SELECT state FROM oauth_states WHERE state = ? AND provider = 'google'", state))
      if (valid) await db.run('DELETE FROM oauth_states WHERE state = ?', state)
      if (!code || !valid) return onError()
      const redirectUri = `${url.origin}/api/auth/google/callback`
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }),
      })
      const tokens = await tokenRes.json().catch(() => null)
      if (!tokenRes.ok || !tokens?.access_token) return onError()
      const profRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })
      const profile = await profRes.json().catch(() => null)
      if (!profRes.ok || !profile?.email) return onError()
      const user = await findOrCreateOAuthUser({ email: profile.email, name: profile.name })
      if (!user) return onError()
      const token = await createSession(user.id)
      return Response.redirect(`${frontend}/auth/callback#token=${token}`, 302)
    } catch {
      return onError()
    }
  },

  async appleCallback(req, env) {
    const frontend = env.FRONTEND_URL || 'https://vertamart.pages.dev'
    const onError = () => Response.redirect(`${frontend}/login?oauth=error`, 302)
    try {
      const form = new URLSearchParams(await req.text())
      const code = form.get('code')
      const state = form.get('state')
      const valid = state && !!(await db.get("SELECT state FROM oauth_states WHERE state = ? AND provider = 'apple'", state))
      if (valid) await db.run('DELETE FROM oauth_states WHERE state = ?', state)
      if (!code || !valid) return onError()
      const clientSecret = await appleClientSecret(env)
      const redirectUri = `${new URL(req.url).origin}/api/auth/apple/callback`
      const tokenRes = await fetch('https://appleid.apple.com/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.APPLE_CLIENT_ID,
          client_secret: clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }),
      })
      const tokens = await tokenRes.json().catch(() => null)
      if (!tokenRes.ok || !tokens?.id_token) return onError()
      const b64 = tokens.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
      const payload = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)))
      let name = ''
      try {
        const posted = JSON.parse(form.get('user') ?? '{}')
        name = `${posted?.name?.firstName ?? ''} ${posted?.name?.lastName ?? ''}`.trim()
      } catch { /* Apple solo envía el nombre la primera vez */ }
      const user = await findOrCreateOAuthUser({ email: payload.email, name: name || undefined })
      if (!user) return onError()
      const token = await createSession(user.id)
      return Response.redirect(`${frontend}/auth/callback#token=${token}`, 302)
    } catch {
      return onError()
    }
  },

  async mePatch(user, body) {
    const name = body?.name !== undefined ? String(body.name).trim() : undefined
    const country = body?.country !== undefined ? String(body.country).trim().toUpperCase() : undefined
    if (name !== undefined && name.length < 2) return fail(400, 'El nombre debe tener al menos 2 caracteres', 'INVALID_NAME')
    if (country !== undefined && !/^[A-Z]{2}$/.test(country)) return fail(400, 'País no válido', 'INVALID_COUNTRY')
    if (name !== undefined) await db.run('UPDATE users SET name = ? WHERE id = ?', name, user.id)
    if (country !== undefined) await db.run('UPDATE users SET country = ? WHERE id = ?', country, user.id)
    const updated = await db.get('SELECT * FROM users WHERE id = ?', user.id)
    const verification = await verificationFor(user.id)
    return json({ user: publicUser(updated, verification) })
  },

  async logout(req) {
    const header = req.headers.get('authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    if (token) await db.run('DELETE FROM sessions WHERE token = ?', token)
    return new Response(null, { status: 204 })
  },

  // PRODUCTOS
  async listCategories() {
    const cats = await db.all(`SELECT key, name, tagline FROM categories WHERE active = 1 ORDER BY sort_order ASC, name ASC`)
    if (cats.length > 0) return json(cats.map((c) => ({ id: c.key, name: c.name, tagline: c.tagline ?? `Productos de ${c.name}` })))
    const rows = await db.all(`SELECT category AS id, category AS name FROM products WHERE status = 'active' GROUP BY category ORDER BY category`)
    const labels = { audio: 'Audio', wearables: 'Wearables', teclado: 'Teclados', mouse: 'Mouse', carga: 'Carga', monitor: 'Monitores', streaming: 'Streaming', oficina: 'Oficina', accesorios: 'Accesorios' }
    return json(rows.map((row) => ({ id: row.id, name: labels[row.id] ?? row.name, tagline: `Productos de ${labels[row.id] ?? row.name}` })))
  },

  async listProducts() {
    const rows = await db.all(
      `SELECT p.*, u.name AS owner_name FROM products p LEFT JOIN users u ON u.id = p.owner_id WHERE p.status = 'active' ORDER BY p.created_at DESC`,
    )
    const vmap = await verifiedMapFor(rows.map((r) => r.owner_id))
    return json(paginate(rows.map((r) => productToApi(r, vmap.get(r.owner_id)))))
  },

  async listFeed(user) {
    const rows = await db.all(`
      SELECT f.*, u.name AS user_name, p.name AS product_name, p.product_code
      FROM feed_posts f JOIN users u ON u.id = f.user_id
      LEFT JOIN products p ON CAST(p.id AS TEXT) = f.product_id
      ORDER BY f.id DESC
    `)
    const items = await Promise.all(rows.map((row) => feedPostToApi(row, user?.id)))
    return json(paginate(items))
  },

  async myProducts(user) {
    const rows = await db.all(
      `SELECT p.*, u.name AS owner_name FROM products p LEFT JOIN users u ON u.id = p.owner_id WHERE p.owner_id = ? ORDER BY p.created_at DESC`,
      user.id,
    )
    const vmap = await verifiedMapFor(rows.map((r) => r.owner_id))
    return json(paginate(rows.map((r) => productToApi(r, vmap.get(r.owner_id)))))
  },

  async createProduct(user, body) {
    const name = String(body?.name ?? '').trim()
    const description = String(body?.description ?? '').trim()
    const category = String(body?.category ?? 'audio').trim()
    const price = Number(body?.price)
    const oldPrice = body?.oldPrice ? Number(body.oldPrice) : null
    const stock = Number(body?.stock ?? 10)
    const image = String(body?.image ?? '').trim()
    const features = Array.isArray(body?.features) ? body.features.map(String) : []
    const badge = body?.badge ? String(body.badge) : null
    const fileType = String(body?.fileType ?? 'ZIP').trim() || 'ZIP'
    const fileSize = String(body?.fileSize ?? '10 MB').trim() || '10 MB'
    const compatibility = String(body?.compatibility ?? 'Windows · macOS · Linux').trim()
    const license = String(body?.license ?? 'Uso personal y comercial').trim()
    const version = String(body?.version ?? '1.0.0').trim() || '1.0.0'
    const productCode = `VT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`

    if (name.length < 3) return fail(400, 'El nombre debe tener al menos 3 caracteres', 'INVALID_NAME')
    if (!Number.isFinite(price) || price < 0) return fail(400, 'El precio no es válido', 'INVALID_PRICE')
    if (!Number.isInteger(stock) || stock < 0) return fail(400, 'El stock no es válido', 'INVALID_STOCK')
    if (image && !/^https?:\/\//.test(image)) return fail(400, 'La imagen debe ser una URL http(s)', 'INVALID_IMAGE')

    const base = slugify(name) || 'producto'
    let slug = base
    let n = 1
    while (await db.get('SELECT id FROM products WHERE slug = ?', slug)) {
      slug = `${base}-${Date.now().toString(36).slice(-4)}${n++}`
    }
    const info = await db.run(
      `INSERT INTO products (owner_id, name, slug, category, price, old_price, stock, badge, description, features, image, product_code, file_type, file_size, compatibility, license, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      user.id, name, slug, category, price, oldPrice, stock, badge, description, JSON.stringify(features), image, productCode, fileType, fileSize, compatibility, license, version,
    )
    const row = await db.get('SELECT * FROM products WHERE id = ?', info.lastId)
    return json(productToApi(row), 201)
  },

  async patchProduct(user, id, body) {
    const row = await db.get('SELECT * FROM products WHERE id = ?', id)
    if (!row) return fail(404, 'Producto no encontrado', 'NOT_FOUND')
    if (row.owner_id !== user.id && user.role !== 'admin') return fail(403, 'No tienes permisos sobre este producto', 'FORBIDDEN')
    const fields = ['name', 'description', 'category', 'stock', 'image', 'badge']
    const sets = []
    const values = []
    for (const f of fields) {
      if (body?.[f] !== undefined) {
        sets.push(`${f} = ?`)
        values.push(String(body[f]).trim())
      }
    }
    if (body?.price !== undefined) {
      sets.push('price = ?')
      values.push(Number(body.price))
    }
    if (body?.oldPrice !== undefined) {
      sets.push('old_price = ?')
      values.push(body.oldPrice ? Number(body.oldPrice) : null)
    }
    if (body?.features !== undefined) {
      sets.push('features = ?')
      values.push(JSON.stringify(body.features.map(String)))
    }
    // Campos digitales (formato, tamaño, licencia, descargas, soporte...)
    const digitalMap = { fileType: 'file_type', fileSize: 'file_size', compatibility: 'compatibility', license: 'license', updates: 'updates', support: 'support', version: 'version' }
    for (const [bodyKey, col] of Object.entries(digitalMap)) {
      if (body?.[bodyKey] !== undefined) {
        sets.push(`${col} = ?`)
        values.push(String(body[bodyKey]).trim())
      }
    }
    if (body?.downloads !== undefined) {
      sets.push('downloads = ?')
      values.push(Math.max(0, Number(body.downloads)))
    }
    if (body?.includes !== undefined) {
      sets.push('includes = ?')
      values.push(JSON.stringify(body.includes.map(String)))
    }
    if (body?.requirements !== undefined) {
      sets.push('requirements = ?')
      values.push(JSON.stringify(body.requirements.map(String)))
    }
    if (body?.status !== undefined) {
      if (!PRODUCT_STATUSES.includes(body.status)) return fail(400, 'Estado no válido', 'INVALID_STATUS')
      sets.push('status = ?')
      values.push(body.status)
    }
    if (sets.length === 0) return fail(400, 'No hay campos para actualizar', 'EMPTY_UPDATE')
    values.push(row.id)
    await db.run(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`, ...values)
    // Historial de versiones: cada cambio de versión queda registrado con sus notas.
    if (body?.version !== undefined && String(body.version).trim() !== String(row.version ?? '').trim()) {
      await db.run(
        'INSERT INTO product_versions (product_id, version, notes) VALUES (?, ?, ?)',
        String(Math.trunc(Number(row.id))),
        String(body.version).trim(),
        String(body?.versionNotes ?? '').trim().slice(0, 2000) || null,
      )
    }
    const updated = await db.get('SELECT * FROM products WHERE id = ?', row.id)
    return json(productToApi(updated))
  },

  // Historial de versiones de un producto (visible para compradores y dueños).
  async productVersions(user, id, env) {
    const row = await db.get('SELECT * FROM products WHERE id = ?', id)
    if (!row) return fail(404, 'Producto no encontrado', 'NOT_FOUND')
    // Acceso: cualquier usuario autenticado puede ver el historial público del producto.
    const rows = await db.all(
      `SELECT id, version, notes, created_at FROM product_versions WHERE product_id = ? ORDER BY id DESC`,
      String(Math.trunc(Number(row.id))),
    )
    return json({
      currentVersion: row.version ?? '1.0.0',
      items: rows.map((r) => ({ id: r.id, version: r.version, notes: r.notes ?? '', createdAt: r.created_at })),
    })
  },

  async deleteProduct(user, id) {
    const row = await db.get('SELECT * FROM products WHERE id = ?', id)
    if (!row) return fail(404, 'Producto no encontrado', 'NOT_FOUND')
    if (row.owner_id !== user.id && user.role !== 'admin') return fail(403, 'No tienes permisos sobre este producto', 'FORBIDDEN')
    await db.run('DELETE FROM products WHERE id = ?', row.id)
    return new Response(null, { status: 204 })
  },

  // PERFILES, SEGUIR Y CHAT
  async getUser(user, id) {
    const row = await db.get('SELECT * FROM users WHERE id = ?', id)
    if (!row) return fail(404, 'Usuario no encontrado', 'NOT_FOUND')
    return json(await publicProfile(row, user?.id))
  },

  async getUserProducts(id) {
    const row = await db.get('SELECT id FROM users WHERE id = ?', id)
    if (!row) return fail(404, 'Usuario no encontrado', 'NOT_FOUND')
    const rows = await db.all(
      `SELECT p.*, u.name AS owner_name FROM products p
       LEFT JOIN users u ON u.id = p.owner_id
       WHERE p.owner_id = ? AND p.status = 'active'
       ORDER BY p.created_at DESC`,
      id,
    )
    const vmap = await verifiedMapFor(rows.map((r) => r.owner_id))
    return json(paginate(rows.map((r) => productToApi(r, vmap.get(r.owner_id)))))
  },

  async follow(user, id) {
    if (id === user.id) return fail(400, 'No puedes seguirte a ti mismo', 'SELF_FOLLOW')
    const target = await db.get('SELECT id FROM users WHERE id = ?', id)
    if (!target) return fail(404, 'Usuario no encontrado', 'NOT_FOUND')
    await db.run('INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)', user.id, id)
    return json(await publicProfile(await db.get('SELECT * FROM users WHERE id = ?', id), user.id))
  },

  async unfollow(user, id) {
    const target = await db.get('SELECT id FROM users WHERE id = ?', id)
    if (!target) return fail(404, 'Usuario no encontrado', 'NOT_FOUND')
    await db.run('DELETE FROM follows WHERE follower_id = ? AND following_id = ?', user.id, id)
    return json(await publicProfile(await db.get('SELECT * FROM users WHERE id = ?', id), user.id))
  },

  async following(user) {
    const rows = await db.all(
      `SELECT u.id, u.name, u.country, f.created_at AS followed_at
       FROM follows f JOIN users u ON u.id = f.following_id
       WHERE f.follower_id = ? ORDER BY f.created_at DESC`,
      user.id,
    )
    return json({ items: rows })
  },

  async conversations(user) {
    const me = user.id
    const rows = await db.all(
      `SELECT u.id AS user_id, u.name, u.country,
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
           EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.following_id = u.id)
           OR EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = u.id AND f.following_id = ?)
           OR EXISTS (SELECT 1 FROM messages m
              WHERE (m.sender_id = u.id AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = u.id))
         )
       ORDER BY last_at DESC`,
      me, me, me, me, me, me, me, me, me, me,
    )
    const vmap = await verifiedMapFor(rows.map((r) => r.user_id))
    return json({
      items: rows.map((r) => ({
        userId: r.user_id,
        name: r.name,
        country: r.country,
        verified: vmap.get(r.user_id) ?? false,
        lastMessage: r.last_message,
        lastAt: r.last_at,
        unreadCount: r.unread_count,
      })),
    })
  },

  async getMessages(user, otherId) {
    const other = await db.get('SELECT id FROM users WHERE id = ?', otherId)
    if (!other) return fail(404, 'Usuario no encontrado', 'NOT_FOUND')
    await db.run('UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ?', otherId, user.id)
    const rows = await db.all(
      `SELECT id, sender_id, receiver_id, content, is_read, created_at
       FROM messages
       WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
       ORDER BY id ASC`,
      otherId, user.id, user.id, otherId,
    )
    return json({
      items: rows.map((r) => ({
        id: r.id,
        senderId: r.sender_id,
        receiverId: r.receiver_id,
        content: r.content,
        isRead: r.is_read,
        createdAt: r.created_at,
      })),
    })
  },

  async sendMessage(user, otherId, body) {
    const content = String(body?.content ?? '').trim()
    if (!content) return fail(400, 'El mensaje no puede estar vacío', 'EMPTY_MESSAGE')
    if (content.length > 2000) return fail(400, 'El mensaje es demasiado largo', 'MESSAGE_TOO_LONG')
    const other = await db.get('SELECT id FROM users WHERE id = ?', otherId)
    if (!other) return fail(404, 'Usuario no encontrado', 'NOT_FOUND')
    if (otherId === user.id) return fail(400, 'No puedes enviarte mensajes a ti mismo', 'SELF_MESSAGE')

    const canChat =
      !!(await db.get('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?', user.id, otherId)) ||
      !!(await db.get('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?', otherId, user.id)) ||
      !!(await db.get(
        'SELECT 1 FROM messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?) LIMIT 1',
        user.id, otherId, otherId, user.id,
      ))
    if (!canChat) return fail(403, 'Sigue a este usuario para poder chatear', 'FOLLOW_REQUIRED')

    const info = await db.run('INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)', user.id, otherId, content)
    const row = await db.get('SELECT * FROM messages WHERE id = ?', info.lastId)
    return json({
      id: row.id,
      senderId: row.sender_id,
      receiverId: row.receiver_id,
      content: row.content,
      isRead: row.is_read,
      createdAt: row.created_at,
    }, 201)
  },

  async emailAvailability(req) {
    const email = String(new URL(req.url).searchParams.get('email') ?? '').trim().toLowerCase()
    if (!EMAIL_RE.test(email)) return json({ valid: false, available: false })
    const exists = await db.get('SELECT id FROM users WHERE email = ?', email)
    return json({ valid: true, available: !exists })
  },

  async editMessage(user, id, body) {
    const row = await db.get('SELECT * FROM messages WHERE id = ? AND sender_id = ? AND deleted_at IS NULL', id, user.id)
    if (!row) return fail(404, 'Mensaje no encontrado', 'NOT_FOUND')
    const content = String(body?.content ?? '').trim()
    if (!content || content.length > MESSAGE_MAX_LENGTH) return fail(400, 'Contenido no válido', 'INVALID_CONTENT')
    await db.run("UPDATE messages SET content = ?, edited_at = datetime('now') WHERE id = ?", content, id)
    const updated = await db.get('SELECT * FROM messages WHERE id = ?', id)
    return json({
      id: updated.id,
      senderId: updated.sender_id,
      receiverId: updated.receiver_id,
      content: updated.content,
      imageUrl: updated.image_url,
      editedAt: updated.edited_at,
      isRead: updated.is_read,
      createdAt: updated.created_at,
    })
  },

  async deleteMessage(user, id) {
    const result = await db.run("UPDATE messages SET content = '', image_url = NULL, deleted_at = datetime('now') WHERE id = ? AND sender_id = ? AND deleted_at IS NULL", id, user.id)
    if (result.changes === 0) return fail(404, 'Mensaje no encontrado', 'NOT_FOUND')
    return new Response(null, { status: 204 })
  },

  async blockUser(user, id) {
    if (id === user.id || !(await db.get('SELECT id FROM users WHERE id = ?', id))) return fail(400, 'Usuario no válido', 'INVALID_USER')
    await db.run('INSERT OR IGNORE INTO blocked_users (blocker_id, blocked_id) VALUES (?, ?)', user.id, id)
    return json({ blocked: true, userId: id })
  },

  async unblockUser(user, id) {
    await db.run('DELETE FROM blocked_users WHERE blocker_id = ? AND blocked_id = ?', user.id, id)
    return json({ blocked: false, userId: id })
  },

  async deleteContact(user, id) {
    await db.run('DELETE FROM contacts WHERE owner_id = ? AND user_id = ?', user.id, id)
    await db.run('DELETE FROM follows WHERE (follower_id = ? AND following_id = ?) OR (follower_id = ? AND following_id = ?)', user.id, id, id, user.id)
    return new Response(null, { status: 204 })
  },

  async myFeedPosts(user) {
    const rows = await db.all(
      `SELECT f.*, u.name AS user_name, p.name AS product_name, p.product_code
       FROM feed_posts f JOIN users u ON u.id = f.user_id
       LEFT JOIN products p ON CAST(p.id AS TEXT) = f.product_id
       WHERE f.user_id = ? ORDER BY f.id DESC`,
      user.id,
    )
    const items = await Promise.all(rows.map((row) => feedPostToApi(row, user.id)))
    return json(paginate(items))
  },

  async createFeed(user, body) {
    if (user.role === 'support') return fail(403, 'La cuenta de soporte solo puede usar el chat', 'SUPPORT_CHAT_ONLY')
    const title = String(body?.title ?? '').trim()
    const description = String(body?.description ?? '').trim()
    const videoUrl = String(body?.videoUrl ?? '').trim()
    const productCode = String(body?.productCode ?? '').trim()
    if (title.length < 3) return fail(400, 'El título debe tener al menos 3 caracteres', 'INVALID_TITLE')
    if (description.length < 3) return fail(400, 'La descripción es obligatoria', 'INVALID_DESCRIPTION')
    const resolvedVideo = videoUrl ? videoUrl : pickVideo(title, description)
    if (!/^(https?:\/\/|data:video\/)/.test(resolvedVideo)) return fail(400, 'El video debe ser una URL http(s) o una grabación de vídeo válida', 'INVALID_VIDEO')
    let productId = null
    if (productCode) {
      const product = await db.get('SELECT id FROM products WHERE product_code = ?', productCode)
      if (!product) return fail(404, 'Código de producto no encontrado', 'PRODUCT_CODE_NOT_FOUND')
      productId = String(product.id)
    }
    const info = await db.run('INSERT INTO feed_posts (user_id, product_id, title, description, video_url) VALUES (?, ?, ?, ?, ?)', user.id, productId, title, description, resolvedVideo)
    const row = await db.get(
      `SELECT f.*, u.name AS user_name, p.name AS product_name, p.product_code
       FROM feed_posts f JOIN users u ON u.id = f.user_id
       LEFT JOIN products p ON CAST(p.id AS TEXT) = f.product_id
       WHERE f.id = ?`,
      info.lastId,
    )
    return json(await feedPostToApi(row, user.id), 201)
  },

  async patchFeed(user, id, body) {
    const row = await db.get('SELECT * FROM feed_posts WHERE id = ?', id)
    if (!row) return fail(404, 'Publicación no encontrada', 'NOT_FOUND')
    if (row.user_id !== user.id) return fail(403, 'No tienes permisos sobre esta publicación', 'FORBIDDEN')
    const title = body?.title !== undefined ? String(body.title).trim() : row.title
    const description = body?.description !== undefined ? String(body.description).trim() : row.description
    const videoUrl = body?.videoUrl !== undefined ? String(body.videoUrl).trim() : row.video_url
    const productCode = body?.productCode !== undefined ? String(body.productCode).trim() : null
    if (title.length < 3) return fail(400, 'El título debe tener al menos 3 caracteres', 'INVALID_TITLE')
    if (description.length < 3) return fail(400, 'La descripción es obligatoria', 'INVALID_DESCRIPTION')
    if (!/^(https?:\/\/|data:(?:video|image)\/)/.test(videoUrl)) return fail(400, 'El archivo multimedia no es válido', 'INVALID_MEDIA')
    let productId = row.product_id
    if (productCode !== null) {
      if (!productCode) productId = null
      else {
        const product = await db.get('SELECT id FROM products WHERE product_code = ?', productCode)
        if (!product) return fail(404, 'Código de producto no encontrado', 'PRODUCT_CODE_NOT_FOUND')
        productId = String(product.id)
      }
    }
    await db.run('UPDATE feed_posts SET title = ?, description = ?, video_url = ?, product_id = ? WHERE id = ?', title, description, videoUrl, productId, id)
    const updated = await db.get(
      `SELECT f.*, u.name AS user_name, p.name AS product_name, p.product_code
       FROM feed_posts f JOIN users u ON u.id = f.user_id
       LEFT JOIN products p ON CAST(p.id AS TEXT) = f.product_id
       WHERE f.id = ?`,
      id,
    )
    return json(await feedPostToApi(updated, user.id))
  },

  async deleteFeed(user, id) {
    const row = await db.get('SELECT * FROM feed_posts WHERE id = ?', id)
    if (!row) return fail(404, 'Publicación no encontrada', 'NOT_FOUND')
    if (row.user_id !== user.id && user.role !== 'admin') return fail(403, 'No tienes permisos', 'FORBIDDEN')
    await db.run('DELETE FROM feed_posts WHERE id = ?', row.id)
    return new Response(null, { status: 204 })
  },

  async feedLike(user, id) {
    if (!(await db.get('SELECT id FROM feed_posts WHERE id = ?', id))) return fail(404, 'Publicación no encontrada', 'NOT_FOUND')
    const existing = await db.get('SELECT 1 FROM feed_likes WHERE post_id = ? AND user_id = ?', id, user.id)
    if (existing) await db.run('DELETE FROM feed_likes WHERE post_id = ? AND user_id = ?', id, user.id)
    else await db.run('INSERT INTO feed_likes (post_id, user_id) VALUES (?, ?)', id, user.id)
    const count = await db.get('SELECT COUNT(*) AS count FROM feed_likes WHERE post_id = ?', id)
    return json({ liked: !existing, likesCount: count?.count ?? 0 })
  },

  async feedComments(id) {
    const rows = await db.all(
      'SELECT c.id, c.post_id, c.user_id, u.name AS user_name, c.content, c.created_at FROM feed_comments c JOIN users u ON u.id = c.user_id WHERE c.post_id = ? ORDER BY c.created_at ASC',
      id,
    )
    return json(paginate(rows.map((r) => ({ id: r.id, postId: r.post_id, userId: r.user_id, userName: r.user_name, content: r.content, createdAt: r.created_at }))))
  },

  async addFeedComment(user, id, body) {
    if (user.role === 'support') return fail(403, 'La cuenta de soporte solo puede usar el chat', 'SUPPORT_CHAT_ONLY')
    const postId = Number(id)
    const content = String(body?.content ?? '').trim()
    if (!(await db.get('SELECT id FROM feed_posts WHERE id = ?', postId))) return fail(404, 'Publicación no encontrada', 'NOT_FOUND')
    if (content.length < 1 || content.length > 500) return fail(400, 'Comentario no válido', 'INVALID_COMMENT')
    const commentId = crypto.randomUUID()
    await db.run('INSERT INTO feed_comments (id, post_id, user_id, content) VALUES (?, ?, ?, ?)', commentId, postId, user.id, content)
    return json({ id: commentId, postId, userId: user.id, userName: user.name, content, createdAt: new Date().toISOString() }, 201)
  },

  async deleteFeedComment(user, commentId) {
    const row = await db.get('SELECT id, user_id FROM feed_comments WHERE id = ?', commentId)
    if (!row) return fail(404, 'Comentario no encontrado', 'NOT_FOUND')
    if (row.user_id !== user.id && user.role !== 'admin') return fail(403, 'No tienes permisos sobre este comentario', 'FORBIDDEN')
    await db.run('DELETE FROM feed_comments WHERE id = ?', commentId)
    return new Response(null, { status: 204 })
  },

  async shareFeed(user, id, body) {
    if (user.role === 'support') return fail(403, 'La cuenta de soporte solo puede usar el chat', 'SUPPORT_CHAT_ONLY')
    const post = await db.get('SELECT * FROM feed_posts WHERE id = ?', id)
    const receiverId = Number(body?.receiverId)
    if (!post) return fail(404, 'Publicación no encontrada', 'NOT_FOUND')
    if (!(await db.get('SELECT id FROM users WHERE id = ?', receiverId)) || receiverId === user.id) return fail(400, 'Contacto no válido', 'INVALID_CONTACT')
    const allowed =
      !!(await db.get('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?', user.id, receiverId)) ||
      !!(await db.get('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?', receiverId, user.id))
    if (!allowed) return fail(403, 'Sigue al contacto para compartirle videos', 'FOLLOW_REQUIRED')
    const text = `🎥 ${post.title}\n${post.description}\n${post.video_url}`
    const info = await db.run('INSERT INTO messages (sender_id, receiver_id, content, image_url) VALUES (?, ?, ?, NULL)', user.id, receiverId, text)
    return json({ messageId: info.lastId }, 201)
  },

  async adminModerationFeed() {
    const rows = await db.all(
      `SELECT f.id, f.user_id, u.name AS user_name, f.title, f.description, f.video_url, f.created_at,
        (SELECT COUNT(*) FROM feed_comments c WHERE c.post_id = f.id) AS comments_count
       FROM feed_posts f JOIN users u ON u.id = f.user_id
       ORDER BY f.id DESC LIMIT 200`,
    )
    return json(paginate(rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      userName: row.user_name,
      title: row.title,
      description: row.description,
      videoUrl: row.video_url,
      createdAt: row.created_at,
      commentsCount: row.comments_count,
    }))))
  },

  async adminDeleteModerationFeed(id) {
    const result = await db.run('DELETE FROM feed_posts WHERE id = ?', id)
    if (result.changes === 0) return fail(404, 'Publicación no encontrada', 'NOT_FOUND')
    return new Response(null, { status: 204 })
  },

  async adminDeleteModerationComment(commentId) {
    const result = await db.run('DELETE FROM feed_comments WHERE id = ?', commentId)
    if (result.changes === 0) return fail(404, 'Comentario no encontrado', 'NOT_FOUND')
    return new Response(null, { status: 204 })
  },

  async adminModerationMessages() {
    const rows = await db.all(
      `SELECT m.id, m.sender_id, s.name AS sender_name, m.receiver_id, r.name AS receiver_name,
        m.content, m.image_url, m.created_at
       FROM messages m
       JOIN users s ON s.id = m.sender_id
       JOIN users r ON r.id = m.receiver_id
       WHERE m.deleted_at IS NULL
       ORDER BY m.id DESC LIMIT 200`,
    )
    return json(paginate(rows.map((row) => ({
      id: row.id,
      senderId: row.sender_id,
      senderName: row.sender_name,
      receiverId: row.receiver_id,
      receiverName: row.receiver_name,
      content: row.content,
      imageUrl: row.image_url,
      createdAt: row.created_at,
    }))))
  },

  async adminDeleteModerationMessage(id) {
    const result = await db.run("UPDATE messages SET content = '', image_url = NULL, deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL", id)
    if (result.changes === 0) return fail(404, 'Mensaje no encontrado', 'NOT_FOUND')
    return new Response(null, { status: 204 })
  },

  async adminOrderItems(id) {
    const rows = await db.all('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', id)
    return json({ items: rows })
  },

  // PAYPAL: las claves solo viven en secrets del Worker.
  async paypalCreate(env, body) {
    if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) return fail(503, 'PayPal no está configurado; usa el modo demo', 'PAYPAL_NOT_CONFIGURED')
    const total = Number(body?.total)
    if (!Number.isFinite(total) || total <= 0) return fail(400, 'Monto inválido', 'INVALID_AMOUNT')
    try {
      const order = await paypalRequest(env, '/v2/checkout/orders', {
        method: 'POST',
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [{ amount: { currency_code: 'USD', value: total.toFixed(2) }, description: 'Compra Vertamart' }],
          application_context: { user_action: 'PAY_NOW', shipping_preference: 'NO_SHIPPING' },
        }),
      })
      return json({ id: order.id, status: order.status, links: order.links ?? [] }, 201)
    } catch (e) { return fail(502, e instanceof Error ? e.message : 'Error de PayPal', 'PAYPAL_ERROR') }
  },

  async paypalCapture(env, id) {
    if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) return fail(503, 'PayPal no está configurado', 'PAYPAL_NOT_CONFIGURED')
    if (!/^[A-Z0-9-]+$/i.test(id)) return fail(400, 'Orden PayPal inválida', 'INVALID_PAYPAL_ORDER')
    try {
      const capture = await paypalRequest(env, `/v2/checkout/orders/${encodeURIComponent(id)}/capture`, { method: 'POST', body: '{}' })
      return json({ id: capture.id, status: capture.status, payer: capture.payer ?? null })
    } catch (e) { return fail(502, e instanceof Error ? e.message : 'Error de PayPal', 'PAYPAL_ERROR') }
  },

  // CUPONES ADMIN
  async adminPromoCodes() {
    const rows = await db.all('SELECT * FROM promo_codes ORDER BY id DESC')
    return json({ items: rows.map(promoToApi), total: rows.length })
  },
  async adminCreatePromo(body) {
    const code = String(body?.code ?? '').trim().toUpperCase()
    const type = body?.type === 'fixed' ? 'fixed' : 'percent'
    const percent = Math.max(1, Math.min(90, Number(body?.percent ?? 10)))
    const value = Math.max(0, Number(body?.value ?? 0))
    const minAmount = Math.max(0, Number(body?.minAmount ?? 0))
    const startsAt = body?.startsAt ? String(body.startsAt) : null
    const expiresAt = body?.expiresAt ? String(body.expiresAt) : null
    const maxUses = body?.maxUses ? Math.max(1, Number(body.maxUses)) : null
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return fail(400, 'Código inválido', 'INVALID_CODE')
    if (type === 'fixed' && value <= 0) return fail(400, 'El descuento fijo debe ser mayor a 0', 'INVALID_VALUE')
    if (startsAt && !/^\d{4}-\d{2}-\d{2}$/.test(startsAt)) return fail(400, 'Fecha de inicio inválida', 'INVALID_START')
    if (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) return fail(400, 'Fecha de caducidad inválida', 'INVALID_EXPIRY')
    try {
      const info = await db.run('INSERT INTO promo_codes (code, type, percent, value, min_amount, starts_at, expires_at, max_uses) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', code, type, percent, value, minAmount, startsAt, expiresAt, maxUses)
      return json(promoToApi({ id: info.lastId, code, type, percent, value, min_amount: minAmount, starts_at: startsAt, expires_at: expiresAt, max_uses: maxUses, used_count: 0, active: 1, created_at: new Date().toISOString() }), 201)
    } catch { return fail(409, 'Ese código ya existe', 'CODE_TAKEN') }
  },
  async adminUpdatePromo(id, body) {
    const row = await db.get('SELECT * FROM promo_codes WHERE id = ?', id)
    if (!row) return fail(404, 'Código no encontrado', 'NOT_FOUND')
    const sets = []; const values = []
    if (body?.code !== undefined) { sets.push('code = ?'); values.push(String(body.code).trim().toUpperCase()) }
    if (body?.type !== undefined) { sets.push('type = ?'); values.push(body.type === 'fixed' ? 'fixed' : 'percent') }
    if (body?.percent !== undefined) { sets.push('percent = ?'); values.push(Math.max(0, Math.min(100, Number(body.percent)))) }
    if (body?.value !== undefined) { sets.push('value = ?'); values.push(Math.max(0, Number(body.value))) }
    if (body?.minAmount !== undefined) { sets.push('min_amount = ?'); values.push(Math.max(0, Number(body.minAmount))) }
    if (body?.startsAt !== undefined) { sets.push('starts_at = ?'); values.push(body.startsAt ? String(body.startsAt) : null) }
    if (body?.expiresAt !== undefined) { sets.push('expires_at = ?'); values.push(body.expiresAt ? String(body.expiresAt) : null) }
    if (body?.maxUses !== undefined) { sets.push('max_uses = ?'); values.push(body.maxUses ? Math.max(1, Number(body.maxUses)) : null) }
    if (body?.usedCount !== undefined) { sets.push('used_count = ?'); values.push(Math.max(0, Number(body.usedCount))) }
    if (body?.active !== undefined) { sets.push('active = ?'); values.push(body.active ? 1 : 0) }
    if (sets.length === 0) return fail(400, 'No hay campos para actualizar', 'EMPTY_UPDATE')
    values.push(id)
    try { await db.run(`UPDATE promo_codes SET ${sets.join(', ')} WHERE id = ?`, ...values) } catch { return fail(409, 'Ese código ya existe', 'CODE_TAKEN') }
    const updated = await db.get('SELECT * FROM promo_codes WHERE id = ?', id)
    return json(promoToApi(updated))
  },
  async adminDeletePromo(id) {
    const info = await db.run('DELETE FROM promo_codes WHERE id = ?', id)
    if (info.changes === 0) return fail(404, 'Código no encontrado', 'NOT_FOUND')
    return new Response(null, { status: 204 })
  },

  // CUPONES PÚBLICOS (validación en el carrito)
  async validateCoupon(body) {
    const code = String(body?.code ?? '').trim().toUpperCase()
    if (!code) return json({ valid: false, reason: 'EMPTY' })
    const row = await db.get('SELECT * FROM promo_codes WHERE code = ?', code)
    if (!row || !row.active) return json({ valid: false, reason: 'NOT_FOUND' })
    if (row.starts_at && new Date(`${row.starts_at}T00:00:00`) > new Date()) return json({ valid: false, reason: 'NOT_STARTED' })
    if (row.expires_at && new Date(`${row.expires_at}T23:59:59`) < new Date()) {
      return json({ valid: false, reason: 'EXPIRED' })
    }
    if (row.max_uses != null && (row.used_count ?? 0) >= row.max_uses) return json({ valid: false, reason: 'USED_UP' })
    const type = row.type === 'fixed' ? 'fixed' : 'percent'
    return json({ valid: true, code: row.code, type, percent: row.percent, value: row.value ?? 0, min: row.min_amount })
  },

  // RESEÑAS
  async getReviews(productId) {
    const rows = await db.all(
      `SELECT r.id, r.product_id, r.user_id, r.rating, r.content, r.image_url, r.verified, r.created_at, u.name AS user_name
       FROM reviews r LEFT JOIN users u ON u.id = r.user_id
       WHERE r.product_id = ?
       ORDER BY r.id DESC`,
      productId,
    )
    const vmap = await verifiedMapFor(rows.map((r) => r.user_id))
    const product = await db.get('SELECT id, rating, reviews FROM products WHERE CAST(id AS TEXT) = ?', productId)
    return json({
      ...paginate(rows.map((r) => ({
        id: r.id,
        productId: r.product_id,
        userId: r.user_id,
        userName: r.user_name ?? 'Usuario',
        userVerified: vmap.get(r.user_id) ?? false,
        verifiedPurchase: !!r.verified,
        rating: r.rating,
        content: r.content,
        imageUrl: r.image_url ?? null,
        createdAt: r.created_at,
      }))),
      productRating: product?.rating ?? 4.5,
      productReviewsCount: product?.reviews ?? rows.length,
    })
  },

  async addReview(user, productId, body) {
    const rating = Number(body?.rating)
    const content = String(body?.content ?? '').trim()
    const imageUrl = String(body?.imageUrl ?? '').trim()
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return fail(400, 'La valoración debe ser de 1 a 5', 'INVALID_RATING')
    }
    if (content.length < 3) return fail(400, 'Escribe un comentario (mínimo 3 caracteres)', 'INVALID_CONTENT')
    if (content.length > 1000) return fail(400, 'El comentario es demasiado largo', 'CONTENT_TOO_LONG')

    // Sello de compra verificada: el usuario tiene un pedido pago de este producto.
    const purchased = await db.get(
      `SELECT 1 FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN payments p ON p.order_id = o.id
       WHERE oi.product_id = ? AND o.user_id = ? AND p.status = 'approved'
       LIMIT 1`,
      productId, user.id,
    )

    await db.run('DELETE FROM reviews WHERE product_id = ? AND user_id = ?', productId, user.id)
    const info = await db.run(
      'INSERT INTO reviews (product_id, user_id, rating, content, image_url, verified) VALUES (?, ?, ?, ?, ?, ?)',
      productId, user.id, rating, content, imageUrl || null, purchased ? 1 : 0,
    )
    await db.run(
      `UPDATE products SET
         rating = ROUND((SELECT AVG(rating) FROM reviews WHERE product_id = ?), 1),
         reviews = (SELECT COUNT(*) FROM reviews WHERE product_id = ?)
       WHERE CAST(id AS TEXT) = ?`,
      productId, productId, productId,
    )
    const row = await db.get('SELECT * FROM reviews WHERE id = ?', info.lastId)
    return json({
      id: row.id,
      productId: row.product_id,
      userId: row.user_id,
      userName: user.name,
      rating: row.rating,
      content: row.content,
      imageUrl: row.image_url ?? null,
      verifiedPurchase: !!row.verified,
      createdAt: row.created_at,
    }, 201)
  },

  async deleteReview(user, productId) {
    const info = await db.run('DELETE FROM reviews WHERE product_id = ? AND user_id = ?', productId, user.id)
    if (info.changes === 0) return fail(404, 'No tienes reseña en este producto', 'NOT_FOUND')
    await db.run(
      `UPDATE products SET
         rating = COALESCE(ROUND((SELECT AVG(rating) FROM reviews WHERE product_id = ?), 1), 4.5),
         reviews = (SELECT COUNT(*) FROM reviews WHERE product_id = ?)
       WHERE CAST(id AS TEXT) = ?`,
      productId, productId, productId,
    )
    return new Response(null, { status: 204 })
  },

  /* ------------------------- PAGOS REALES (Stripe) ------------------------ */

  // Ajustes globales de la tienda (tabla key/value).
  async adminGetSettings(env) {
    const rows = await db.all('SELECT key, value FROM settings')
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
    return json({ demoPaymentsEnabled: map.demo_payments === '1', stripeConfigured: !!getStripe(env), stripeMode: stripeMode(env), invoiceEnabled: false })
  },

  async adminPatchSettings(body) {
    if (body?.demoPayments !== undefined) {
      await db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', 'demo_payments', body.demoPayments ? '1' : '0')
    }
    return this.adminGetSettings()
  },

  // Configuración pública: si Stripe está activo y si la demo está permitida.
  async getPublicSettings(env) {
    const row = await db.get("SELECT value FROM settings WHERE key = 'demo_payments'")
    return json({
      stripeConfigured: !!getStripe(env),
      demoPaymentsEnabled: row?.value === '1',
      stripeMode: stripeMode(env),
    })
  },

  // Cliente Stripe del usuario (se crea una sola vez y se guarda su id).
  async getOrCreateStripeCustomer(user, env) {
    const stripe = getStripe(env)
    if (!stripe) return null
    let cid = (await db.get('SELECT stripe_customer_id FROM users WHERE id = ?', user.id))?.stripe_customer_id
    if (cid) return cid
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name,
      metadata: { userId: String(user.id) },
    })
    await db.run('UPDATE users SET stripe_customer_id = ? WHERE id = ?', customer.id, user.id)
    return customer.id
  },

  // Crea el pedido pendiente + sesión de Checkout de Stripe.
  // El backend calcula el PRECIO REAL desde la BD (nunca confía en el frontend)
  // y aplica el cupón de forma segura.
  async stripeCheckout(user, body, env) {
    try {
      return await this._stripeCheckoutInner(user, body, env)
    } catch (err) {
      return fail(500, `Error al crear la sesión de pago: ${err.message}`, 'STRIPE_ERROR')
    }
  },

  async _stripeCheckoutInner(user, body, env) {
    const stripe = getStripe(env)
    if (!stripe) return fail(503, 'Stripe no está configurado aún', 'STRIPE_NOT_CONFIGURED')
    const rawItems = Array.isArray(body?.items) ? body.items : []
    if (rawItems.length === 0) return fail(400, 'El carrito está vacío', 'EMPTY_CART')
    const frontend = env.FRONTEND_URL || 'https://vertamart.pages.dev'

    // 1) Precios reales desde la BD + validación de stock.
    const items = []
    let subtotal = 0
    for (const it of rawItems) {
      const pid = String(it.productId ?? '')
      const product = await db.get('SELECT * FROM products WHERE id = ?', pid)
      if (!product || product.status !== 'active') return fail(404, `Producto no disponible: ${String(it.name ?? pid)}`, 'PRODUCT_UNAVAILABLE')
      const qty = Math.max(1, Math.min(Number(it.qty ?? 1), 99))
      if (Number(product.stock) < qty && Number(product.stock) >= 0) return fail(400, 'Stock insuficiente', 'OUT_OF_STOCK')
      const price = Number(product.price) || 0
      subtotal += price * qty
      items.push({ productId: pid, name: product.name, price, qty })
    }

    // 2) Cupón validado en el servidor (porcentaje o cantidad fija).
    let discount = 0
    let couponCode = null
    const code = String(body?.promoCode ?? '').trim().toUpperCase()
    if (code) {
      const pc = await db.get('SELECT * FROM promo_codes WHERE code = ?', code)
      const now = new Date().toISOString()
      if (pc && pc.active === 1 && (!pc.starts_at || pc.starts_at <= now) && (!pc.expires_at || pc.expires_at > now) && (pc.max_uses == null || (pc.used_count ?? 0) < pc.max_uses) && subtotal >= (pc.min_amount ?? 0)) {
        if (pc.type === 'fixed' && pc.value) discount = Math.min(pc.value, subtotal)
        else discount = Math.round((subtotal * (pc.percent ?? 0)) / 100)
        couponCode = code
      }
    }
    const total = Math.max(0, subtotal - discount)

    // 3) Pedido PENDIENTE con id único (idempotencia: el webhook solo lo libera una vez).
    const trackingToken = randomToken()
    const order = await db.run(
      `INSERT INTO orders (user_id, customer_name, customer_email, subtotal, discount, shipping, total, status, tracking_token)
       VALUES (?, ?, ?, ?, ?, 0, ?, 'pending', ?)`,
      user.id, user.name, user.email, subtotal, discount, total, trackingToken,
    )
    for (const it of items) {
      await db.run(
        'INSERT INTO order_items (order_id, product_id, name, price, qty) VALUES (?, ?, ?, ?, ?)',
        order.lastId, it.productId, it.name, it.price, it.qty,
      )
    }

    // 4) Sesión de Checkout alojada por Stripe (PCI: la tarjeta nunca pasa por nosotros).
    const currency = (env.STRIPE_CURRENCY || 'eur').toLowerCase()
    const customerId = await this.getOrCreateStripeCustomer(user, env)
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      client_reference_id: String(order.lastId),
      customer_email: customerId ? undefined : user.email,
      // La tienda fija sus precios sin IVA automático: desactiva Managed Payments.
      managed_payments: { enabled: false },
      line_items: [
        ...items.map((it) => ({ price_data: { currency, product_data: { name: it.name }, unit_amount: it.price }, quantity: it.qty })),
        ...(discount > 0 ? [{ price_data: { currency, product_data: { name: `Descuento ${couponCode}` }, unit_amount: -discount }, quantity: 1 }] : []),
      ],
      allow_promotion_codes: false,
      success_url: `${frontend}/pago/exito?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontend}/pago/cancelado`,
      metadata: { orderId: String(order.lastId) },
    })
    await db.run('UPDATE orders SET transaction_id = ? WHERE id = ?', session.id, order.lastId)

    return json({ url: session.url, sessionId: session.id, orderId: order.lastId }, 201)
  },

  // Métodos de pago guardados del usuario (solo info no sensible: marca, últimos 4).
  async mePaymentMethods(user, env) {
    const stripe = getStripe(env)
    if (!stripe) return json({ items: [], enabled: false })
    const customerId = await this.getOrCreateStripeCustomer(user, env)
    const customer = await stripe.customers.retrieve(customerId)
    const defaultPm = typeof customer === 'object' && !customer.deleted ? customer.invoice_settings?.default_payment_method : null
    const pms = await stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 20 })
    const items = pms.data.map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand ?? 'tarjeta',
      last4: pm.card?.last4 ?? '',
      expMonth: pm.card?.exp_month ?? null,
      expYear: pm.card?.exp_year ?? null,
      isDefault: pm.id === defaultPm,
    }))
    return json({ items, enabled: true })
  },

  // SetupIntent para añadir una tarjeta sin almacenarla en nuestra BD.
  async createPaymentSetup(user, env) {
    const stripe = getStripe(env)
    if (!stripe) return fail(503, 'Stripe no está configurado', 'STRIPE_NOT_CONFIGURED')
    const customerId = await this.getOrCreateStripeCustomer(user, env)
    const setup = await stripe.setupIntents.create({ customer: customerId, payment_method_types: ['card', 'paypal'] })
    return json({ clientSecret: setup.client_secret })
  },

  async setDefaultPaymentMethod(user, id, env) {
    const stripe = getStripe(env)
    if (!stripe) return fail(503, 'Stripe no está configurado', 'STRIPE_NOT_CONFIGURED')
    const customerId = await this.getOrCreateStripeCustomer(user, env)
    await stripe.paymentMethods.attach(id, { customer: customerId })
    await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: id } })
    return json({ ok: true })
  },

  async deletePaymentMethod(user, id, env) {
    const stripe = getStripe(env)
    if (!stripe) return fail(503, 'Stripe no está configurado', 'STRIPE_NOT_CONFIGURED')
    await stripe.paymentMethods.detach(id)
    return new Response(null, { status: 204 })
  },

  // Panel: saldo, liquidaciones, cobros y reembolsos REALES de Stripe.
  async adminStripeFinance(env) {
    const stripe = getStripe(env)
    if (!stripe) return fail(503, 'Stripe no está configurado', 'STRIPE_NOT_CONFIGURED')
    const [balance, payouts, charges] = await Promise.all([
      stripe.balance.retrieve(),
      stripe.payouts.list({ limit: 20 }),
      stripe.charges.list({ limit: 50 }),
    ])
    return json({
      mode: stripeMode(env),
      currency: env.STRIPE_CURRENCY || 'eur',
      available: balance.available.map((b) => ({ amount: b.amount, currency: b.currency })),
      pending: balance.pending.map((b) => ({ amount: b.amount, currency: b.currency })),
      payouts: payouts.data.map((p) => ({ id: p.id, amount: p.amount, status: p.status, arrivalDate: p.arrival_date, currency: p.currency })),
      charges: charges.data.map((c) => ({ id: c.id, amount: c.amount, status: c.status, paid: c.paid, refunded: c.refunded, currency: c.currency, created: c.created, email: c.billing_details?.email ?? null })),
    })
  },

  // Reembolso REAL vía Stripe + revocación de acceso al producto.
  async adminStripeRefund(env, body) {
    const stripe = getStripe(env)
    if (!stripe) return fail(503, 'Stripe no está configurado', 'STRIPE_NOT_CONFIGURED')
    const chargeId = String(body?.chargeId ?? '')
    const amount = body?.amount ? Math.round(Number(body.amount)) : undefined
    if (!chargeId) return fail(400, 'Falta el id del cobro', 'MISSING_CHARGE')
    const refund = await stripe.refunds.create({ charge: chargeId, ...(amount ? { amount } : {}) })
    return json({ id: refund.id, status: refund.status, amount: refund.amount })
  },

  // PEDIDOS
  async createOrder(req, body, env) {
    const items = Array.isArray(body?.items) ? body.items : []
    const customerName = String(body?.customerName ?? '').trim()
    const customerEmail = String(body?.customerEmail ?? '').trim().toLowerCase()
    const subtotal = Number(body?.subtotal ?? 0)
    const discount = Number(body?.discount ?? 0)
    // Tienda 100% digital: no hay gastos de envío.
    const shipping = 0
    const total = Number(body?.total ?? 0)
    const method = String(body?.method ?? 'card')
    const transactionId = body?.transactionId ? String(body.transactionId) : null
    const installments = body?.installments ? Number(body.installments) : null
    const paymentStatus = ['approved', 'pending', 'declined'].includes(body?.paymentStatus) ? body.paymentStatus : 'pending'
    const estimatedDelivery = body?.estimatedDelivery ? String(body.estimatedDelivery) : null
    let redeemPoints = Math.max(0, Number(body?.redeemPoints ?? 0) || 0)

    if (!customerName || !EMAIL_RE.test(customerEmail)) return fail(400, 'Faltan datos del cliente', 'INVALID_CUSTOMER')
    if (!Number.isFinite(total) || total <= 0 || items.length === 0) return fail(400, 'Pedido inválido', 'INVALID_ORDER')

    const user = await getUserFromToken(req)
    const userId = user?.id ?? null

    // Fidelidad: descuento por puntos canjeados (el frontend ya suma el descuento al total).
    if (user && redeemPoints > 0) {
      const earned = await db.get('SELECT SUM(delta) AS sum FROM points_history WHERE user_id = ?', user.id)
      const balance = (earned?.sum ?? 0)
      const use = Math.min(redeemPoints, balance, total)
      if (use > 0) {
        await db.run('UPDATE users SET points = points - ? WHERE id = ?', use, user.id)
        await db.run(
          'INSERT INTO points_history (user_id, delta, reason, ref_type, ref_id) VALUES (?, ?, ?, ?, NULL)',
          user.id, -use, 'Canje en pedido', 'redeem',
        )
        redeemPoints = use
      }
    }

    const trackingToken = randomToken()
    const orderStatus = paymentStatus === 'approved' ? 'paid' : 'pending'
    const order = await db.run(
      `INSERT INTO orders (user_id, customer_name, customer_email, subtotal, discount, shipping, total, status, estimated_delivery, tracking_token)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      userId, customerName, customerEmail, subtotal, discount, shipping, total, orderStatus, estimatedDelivery, trackingToken,
    )
    for (const it of items) {
      const prod = await db.get('SELECT version FROM products WHERE id = ?', String(it.productId ?? ''))
      const licenseKey = `VERTA-${rand4()}-${rand4()}-${rand4()}`
      await db.run(
        'INSERT INTO order_items (order_id, product_id, name, price, qty, license_key, version_at_purchase) VALUES (?, ?, ?, ?, ?, ?, ?)',
        order.lastId, String(it.productId ?? ''), String(it.name ?? ''), Number(it.price ?? 0), Number(it.qty ?? 1), licenseKey, prod?.version ?? '1.0.0',
      )
    }
    await db.run(
      'INSERT INTO payments (order_id, amount, method, transaction_id, installments, status) VALUES (?, ?, ?, ?, ?, ?)',
      order.lastId, total, method, transactionId, installments, paymentStatus,
    )

    // Contador de usos del cupón (solo si el cupón tiene límite de usos)
    if (body?.promoCode) {
      const pc = String(body.promoCode).trim().toUpperCase()
      if (pc) await db.run('UPDATE promo_codes SET used_count = used_count + 1 WHERE code = ? AND max_uses IS NOT NULL', pc)
    }

    // Stock realista: decrementar por cada unidad pedida + alerta de stock bajo.
    for (const it of items) {
      const pid = String(it.productId ?? '')
      if (!pid) continue
      const qty = Math.max(1, Math.floor(Number(it.qty ?? 1)))
      await db.run('UPDATE products SET stock = MAX(0, stock - ?) WHERE CAST(id AS TEXT) = ?', qty, pid)
      const prod = await db.get('SELECT name, stock FROM products WHERE CAST(id AS TEXT) = ?', pid)
      if (prod && prod.stock <= LOW_STOCK_THRESHOLD) {
        const adminEmail = env.GMAIL_USER || env.RESEND_API_KEY ? (env.GMAIL_USER || 'admin@vertamart.es') : null
        if (adminEmail) {
          await sendEmail(
            env,
            adminEmail,
            'Vertamart — alerta de stock bajo',
            `<p>El producto <strong>${prod.name}</strong> quedó con <strong>${prod.stock}</strong> unidad(es).</p><p>Considera reponer stock en el Panel → Productos.</p>`,
          )
        }
      }
    }

    // Fidelidad: 1 punto por cada 10 de compra al usuario logueado.
    if (user) {
      const earned = Math.floor(total / 10)
      if (earned > 0) {
        await db.run('UPDATE users SET points = points + ? WHERE id = ?', earned, user.id)
        await db.run(
          'INSERT INTO points_history (user_id, delta, reason, ref_type, ref_id) VALUES (?, ?, ?, ?, ?)',
          user.id, earned, 'Compra · puntos de fidelidad', 'order', order.lastId,
        )
        await db.run('UPDATE orders SET points_earned = ? WHERE id = ?', earned, order.lastId)
      }
    }

    // Correo de confirmación del pedido + enlace privado de seguimiento.
    const frontend = env.FRONTEND_URL || 'https://vertamart.pages.dev'
    const trackingUrl = `${frontend}/pedido/${trackingToken}`
    const itemsHtml = items.map((it) => `<li style="margin:2px 0">${String(it.name ?? '')} × ${Number(it.qty ?? 1)}</li>`).join('')
    const emailSent = await sendEmail(
      env,
      customerEmail,
      `Vertamart — confirmación de tu pedido #${order.lastId}`,
      `<p>Hola ${customerName},</p><p>¡Gracias por tu compra! Tu pedido digital <strong>#${order.lastId}</strong> quedó registrado.</p><ul>${itemsHtml}</ul><p>Total: <strong>${total.toLocaleString('es-CL')}</strong> · Descuento: ${discount.toLocaleString('es-CL')}</p><p>Tus productos digitales se liberarán automáticamente en tu biblioteca (<em>Mis descargas</em>) al confirmarse el pago.</p><p>Consulta el estado de tu pedido en este enlace privado: <a href="${trackingUrl}">${trackingUrl}</a></p>`,
    )
    // Si el correo no se pudo enviar (plan gratuito sin dominio verificado),
    // el frontend muestra el enlace de seguimiento en pantalla en vez de prometer un correo.
    const _tp = Math.floor(total / 10)
    if (user && user.id) {
      await pushToAllForUser(env, user.id, '🛒 Tu pedido fue registrado', `#${order.lastId} · Total ${total.toLocaleString('es-CL')}${_tp > 0 ? ` · +${_tp} puntos` : ''}`, `/pedido/${trackingToken}`).catch(() => 0)
    }
    return json({ id: order.lastId, trackingToken, trackingUrl, emailSent, pointsEarned: user ? Math.floor(total / 10) : 0, redeemPointsUsed: redeemPoints }, 201)
  },

  async trackOrder(token) {
    const row = await db.get('SELECT id, customer_name, customer_email, status, total, estimated_delivery, tracking_number, refund_status, refund_amount, refund_reason, created_at FROM orders WHERE tracking_token = ?', token)
    if (!row) return fail(404, 'Pedido no encontrado', 'NOT_FOUND')
    return json({ id: row.id, customerName: row.customer_name, customerEmail: row.customer_email, status: row.status, total: row.total, estimatedDelivery: row.estimated_delivery, trackingNumber: row.tracking_number ?? null, refund: { status: row.refund_status ?? 'none', amount: row.refund_amount ?? 0, reason: row.refund_reason ?? null }, createdAt: row.created_at })
  },

  // SUSCRIPCIÓN PREMIUM
  async subscribe(user) {
    await db.run('UPDATE users SET is_premium = 1 WHERE id = ?', user.id)
    const updated = await db.get('SELECT * FROM users WHERE id = ?', user.id)
    return json({ user: publicUser(updated) })
  },

  async unsubscribe(user) {
    await db.run('UPDATE users SET is_premium = 0 WHERE id = ?', user.id)
    const updated = await db.get('SELECT * FROM users WHERE id = ?', user.id)
    return json({ user: publicUser(updated) })
  },

  async getSubscription(user) {
    const row = await db.get('SELECT is_premium FROM users WHERE id = ?', user.id)
    const payout = await db.get('SELECT id, provider, label, account_ref FROM payout_accounts WHERE is_active = 1 ORDER BY id DESC LIMIT 1')
    const pending = await db.get("SELECT id, amount, currency, method, status, created_at FROM payout_transactions WHERE user_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1", user.id)
    return json({
      isPremium: !!row?.is_premium,
      plan: row?.is_premium ? 'premium' : 'free',
      price: 1.99,
      currency: 'USD',
      interval: 'month',
      payoutConfigured: !!payout,
      payout: payout ? { provider: payout.provider, label: payout.label, maskedRef: payout.account_ref?.slice(0, 5) + (payout.account_ref?.length > 5 ? '***' : '') } : null,
      pending,
    })
  },

  async paySubscription(user, body, env) {
    const method = String(body?.method ?? 'card')
    const card = body?.card ?? {}
    if (!['card', 'webpay', 'transfer'].includes(method)) return fail(400, 'Método de pago no válido', 'INVALID_METHOD')
    const payout = await db.get('SELECT * FROM payout_accounts WHERE is_active = 1 ORDER BY id DESC LIMIT 1')
    if (!payout) return fail(400, 'No hay una cuenta receptora configurada. El administrador debe configurarla en el Panel → Cuentas.', 'PAYOUT_NOT_CONFIGURED')

    let processedStatus = 'approved'
    if (method === 'card') {
      const digits = String(card.number ?? '').replace(/\s/g, '')
      let sum = 0, double = false
      for (let i = digits.length - 1; i >= 0; i--) { let d = Number(digits[i]); if (double) { d *= 2; if (d > 9) d -= 9 } sum += d; double = !double }
      if (!/^\d{16}$/.test(digits) || sum % 10 !== 0) return fail(400, 'Datos de tarjeta no válidos', 'INVALID_CARD')
      const [m, y] = String(card.expiry ?? '').split('/').map(Number)
      if (m < 1 || m > 12 || new Date(2000 + y, m, 0) < new Date()) return fail(400, 'Tarjeta vencida o fecha no válida', 'INVALID_CARD')
      if (!/^\d{3,4}$/.test(String(card.cvv ?? ''))) return fail(400, 'CVV no válido', 'INVALID_CARD')
    } else if (method === 'transfer') {
      processedStatus = 'pending' // se confirma manualmente en el panel
    }

    const moneyStatus = processedStatus === 'approved' ? 'received' : 'pending'
    const ref = `SUB-${user.id}-${Date.now().toString(36).toUpperCase()}`
    const transactionId = `VT${randomToken().slice(0, 8).toUpperCase()}`
    await db.run(
      'INSERT INTO payout_transactions (payout_account_id, user_id, type, amount, currency, method, reference, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      payout.id, user.id, 'subscription', 1.99, 'USD', method, ref, moneyStatus,
    )
    if (processedStatus === 'approved') {
      await db.run('UPDATE users SET is_premium = 1 WHERE id = ?', user.id)
    }

    // Correo de confirmación de la suscripción.
    await sendEmail(
      env,
      user.email,
      'Vertamart — suscripción Premium',
      `<p>Hola ${user.name},</p><p>${processedStatus === 'approved' ? 'Tu suscripción Premium de Vertamart está activa.' : 'Recibimos tu solicitud de suscripción. Se activará cuando el administrador confirme la transferencia.'}</p><p>Precio: <strong>US$1.99/mes</strong> · Referencia: <code>${ref}</code></p><p>Gracias por confiar en Vertamart.</p>`,
    )
    return json({
      status: processedStatus,
      transactionId,
      reference: ref,
      isPremium: processedStatus === 'approved',
      creditedTo: { provider: payout.provider, label: payout.label },
      message: processedStatus === 'approved' ? `Pago aprobado. Se acreditaron US$1.99 a ${payout.label}.` : 'Transferencia en revisión: se activará al confirmarla en el panel.',
    }, processedStatus === 'approved' ? 201 : 202)
  },

  // PANEL ADMIN
  async getPayoutAccount() {
    const row = await db.get('SELECT * FROM payout_accounts WHERE is_active = 1 ORDER BY id DESC LIMIT 1')
    if (!row) return json(null)
    const balance = await db.get("SELECT COALESCE(SUM(amount), 0) AS total FROM payout_transactions WHERE payout_account_id = ? AND status = 'received'", row.id)
    const transactions = await db.all(
      `SELECT t.id, t.user_id, u.name AS user_name, t.type, t.amount, t.currency, t.method, t.reference, t.status, t.created_at
       FROM payout_transactions t LEFT JOIN users u ON u.id = t.user_id
       WHERE t.payout_account_id = ? ORDER BY t.id DESC LIMIT 20`,
      row.id,
    )
    return json({
      id: row.id,
      provider: row.provider,
      label: row.label,
      accountRef: row.account_ref,
      paypalEmail: row.paypal_email ?? null,
      isActive: row.is_active,
      createdAt: row.created_at,
      balance: balance?.total ?? 0,
      transactions,
    })
  },

  async confirmPayoutTransaction(id, env) {
    const tx = await db.get('SELECT * FROM payout_transactions WHERE id = ?', id)
    if (!tx) return fail(404, 'Transacción no encontrada', 'NOT_FOUND')
    if (tx.status !== 'pending') return fail(400, 'Solo se confirman transacciones pendientes', 'NOT_PENDING')
    await db.run("UPDATE payout_transactions SET status = 'received' WHERE id = ?", id)
    let premiumActivated = false
    if (tx.type === 'subscription' && tx.user_id) {
      const u = await db.get('SELECT * FROM users WHERE id = ?', tx.user_id)
      await db.run('UPDATE users SET is_premium = 1 WHERE id = ?', tx.user_id)
      premiumActivated = true
      if (u?.email) {
        await sendEmail(
          env,
          u.email,
          'Vertamart — tu suscripción Premium está activa',
          `<p>Hola ${u.name},</p><p>Tu pago fue confirmado: la suscripción Premium está <strong>activa</strong> (US$1.99/mes).</p><p>Ya puedes usar todos los temas de color y ventajas premium.</p>`,
        )
      }
    }
    return json({ id, status: 'received', credited: tx.amount, currency: tx.currency, premiumActivated })
  },

  async refundPayoutTransaction(id) {
    const tx = await db.get('SELECT * FROM payout_transactions WHERE id = ?', id)
    if (!tx) return fail(404, 'Transacción no encontrada', 'NOT_FOUND')
    if (tx.status === 'refunded') return fail(400, 'Ya está reembolsada', 'ALREADY_REFUNDED')
    await db.run("UPDATE payout_transactions SET status = 'refunded' WHERE id = ?", id)
    return json({ id, status: 'refunded' })
  },

  async adminUpdateDelivery(id, body, env) {
    const estimatedDelivery = String(body?.estimatedDelivery ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(estimatedDelivery)) return fail(400, 'Fecha inválida (formato AAAA-MM-DD)', 'INVALID_DATE')
    const order = await db.get('SELECT * FROM orders WHERE id = ?', id)
    if (!order) return fail(404, 'Pedido no encontrado', 'NOT_FOUND')
    await db.run('UPDATE orders SET estimated_delivery = ? WHERE id = ?', estimatedDelivery, order.id)
    const frontend = env.FRONTEND_URL || 'https://vertamart.pages.dev'
    await sendEmail(
      env,
      order.customer_email,
      `Vertamart — entrega estimada de tu pedido #${order.id}`,
      `<p>Hola ${order.customer_name},</p><p>La entrega estimada de tu pedido <strong>#${order.id}</strong> es el <strong>${estimatedDelivery}</strong>.</p><p>Consulta el estado en: <a href="${frontend}/pedido/${order.tracking_token}">${frontend}/pedido/${order.tracking_token}</a></p>`,
    )
    return json({ id: order.id, estimatedDelivery })
  },

  async savePayoutAccount(body) {
    const provider = String(body?.provider ?? '').trim()
    const label = String(body?.label ?? '').trim()
    const accountRef = String(body?.accountRef ?? '').trim()
    const paypalEmail = String(body?.paypalEmail ?? '').trim() || null
    if (!['paypal', 'bank', 'stripe'].includes(provider) || !label || !accountRef) return fail(400, 'Datos de cuenta receptora no válidos', 'INVALID_PAYOUT_ACCOUNT')
    await db.run('UPDATE payout_accounts SET is_active = 0 WHERE is_active = 1')
    const info = await db.run('INSERT INTO payout_accounts (provider, label, account_ref, paypal_email, is_active) VALUES (?, ?, ?, ?, 1)', provider, label, accountRef, paypalEmail)
    return json({ id: info.lastId, provider, label, accountRef, paypalEmail, isActive: 1 }, 201)
  },

  // Datos públicos de la cuenta receptora (para mostrar al pagar por transferencia).
  async payoutInfo() {
    const row = await db.get('SELECT provider, label, account_ref, paypal_email FROM payout_accounts WHERE is_active = 1 ORDER BY id DESC LIMIT 1')
    return json(row ? { provider: row.provider, label: row.label, accountRef: row.account_ref, paypalEmail: row.paypal_email ?? null } : null)
  },

  // Aprueba un pedido pendiente (p. ej. transferencia recibida) y avisa al cliente.
  async adminApproveOrder(id, env) {
    const order = await db.get('SELECT * FROM orders WHERE id = ?', id)
    if (!order) return fail(404, 'Pedido no encontrado', 'NOT_FOUND')
    await db.run("UPDATE orders SET status = 'paid' WHERE id = ?", order.id)
    await db.run("UPDATE payments SET status = 'approved' WHERE order_id = ?", order.id)
    const frontend = env.FRONTEND_URL || 'https://vertamart.pages.dev'
    await sendEmail(
      env,
      order.customer_email,
      `Vertamart — pago confirmado de tu pedido #${order.id}`,
      `<p>Hola ${order.customer_name},</p><p>Hemos confirmado el pago de tu pedido <strong>#${order.id}</strong>. Ya estamos preparando tu envío.</p><p>Sigue el estado aquí: <a href="${frontend}/pedido/${order.tracking_token}">${frontend}/pedido/${order.tracking_token}</a></p>`,
    )
    return json({ id: order.id, status: 'paid', paymentStatus: 'approved' })
  },

  async adminProducts() {
    const rows = await db.all(
      `SELECT p.*, u.name AS owner_name FROM products p LEFT JOIN users u ON u.id = p.owner_id ORDER BY p.created_at DESC`,
    )
    const vmap = await verifiedMapFor(rows.map((r) => r.owner_id))
    return json(paginate(rows.map((r) => productToApi(r, vmap.get(r.owner_id)))))
  },

  async adminDeleteOrder(id) {
    const order = await db.get('SELECT id FROM orders WHERE id = ?', id)
    if (!order) return fail(404, 'Pedido no encontrado', 'NOT_FOUND')
    await db.run('DELETE FROM order_items WHERE order_id = ?', id)
    await db.run('DELETE FROM payments WHERE order_id = ?', id)
    await db.run('DELETE FROM orders WHERE id = ?', id)
    return new Response(null, { status: 204 })
  },

  async adminOrders() {
    const rows = await db.all(
      `SELECT o.*, (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS items_count,
        (SELECT method FROM payments p WHERE p.order_id = o.id ORDER BY p.id DESC LIMIT 1) AS payment_method,
        (SELECT status FROM payments p WHERE p.order_id = o.id ORDER BY p.id DESC LIMIT 1) AS payment_status
       FROM orders o ORDER BY o.created_at DESC`,
    )
    return json({ items: rows.map((r) => ({
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
      paymentMethod: r.payment_method,
      paymentStatus: r.payment_status,
      estimatedDelivery: r.estimated_delivery,
      trackingNumber: r.tracking_number ?? null,
      refundStatus: r.refund_status ?? 'none',
      refundAmount: r.refund_amount ?? 0,
      refundReason: r.refund_reason ?? null,
      pointsEarned: r.points_earned ?? 0,
      createdAt: r.created_at,
    })), total: rows.length })
  },

  async adminOrderStatus(id, body) {
    const status = String(body?.status ?? '')
    if (!ORDER_STATUSES.includes(status)) return fail(400, 'Estado no válido', 'INVALID_STATUS')
    const order = await db.get('SELECT * FROM orders WHERE id = ?', id)
    if (!order) return fail(404, 'Pedido no encontrado', 'NOT_FOUND')
    await db.run('UPDATE orders SET status = ? WHERE id = ?', status, order.id)
    return json({ id: order.id, status })
  },

  async adminPayments() {
    const rows = await db.all('SELECT * FROM payments ORDER BY created_at DESC')
    return json({ items: rows.map((r) => ({
      id: r.id,
      orderId: r.order_id,
      amount: r.amount,
      method: r.method,
      transactionId: r.transaction_id,
      installments: r.installments,
      status: r.status,
      createdAt: r.created_at,
    })), total: rows.length })
  },

  async adminDeletePayment(id) {
    const info = await db.run('DELETE FROM payments WHERE id = ?', id)
    if (info.changes === 0) return fail(404, 'Pago no encontrado', 'NOT_FOUND')
    return new Response(null, { status: 204 })
  },

  async adminUsers() {
    const rows = await db.all('SELECT id, name, email, role, country, created_at FROM users ORDER BY created_at DESC')
    return json({ items: rows, total: rows.length })
  },

  async adminUserRole(user, id, body) {
    const role = String(body?.role ?? '')
    if (!['admin', 'customer'].includes(role)) return fail(400, 'Rol no válido', 'INVALID_ROLE')
    if (id === user.id) return fail(400, 'No puedes cambiar tu propio rol', 'SELF_ROLE')
    const target = await db.get('SELECT * FROM users WHERE id = ?', id)
    if (!target) return fail(404, 'Usuario no encontrado', 'NOT_FOUND')
    await db.run('UPDATE users SET role = ? WHERE id = ?', role, id)
    return json({ id, role })
  },

  async adminDeleteUser(user, id) {
    if (id === user.id) return fail(400, 'No puedes eliminar tu propia cuenta', 'SELF_DELETE')
    const target = await db.get('SELECT * FROM users WHERE id = ?', id)
    if (!target) return fail(404, 'Usuario no encontrado', 'NOT_FOUND')
    await db.run('DELETE FROM users WHERE id = ?', id)
    return new Response(null, { status: 204 })
  },

  // PROGRAMA DE PUNTOS (usuario)
  async mePoints(user) {
    const row = await db.get('SELECT points FROM users WHERE id = ?', user.id)
    const history = await db.all(
      'SELECT id, delta, reason, ref_type, created_at FROM points_history WHERE user_id = ? ORDER BY id DESC LIMIT 100',
      user.id,
    )
    return json({ points: row?.points ?? 0, history: history.map((h) => ({ id: h.id, delta: h.delta, reason: h.reason, refType: h.ref_type, createdAt: h.created_at })) })
  },

  // BIBLIOTECA DIGITAL: productos comprados por el usuario (con acceso y descarga)
  // HISTORIAL DE COMPRAS del usuario (estado, método de pago oculto, total).
  async myOrders(user) {
    const orders = await db.all(
      `SELECT id, total, discount, status, payment_method, transaction_id, created_at, points_earned
       FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 100`,
      user.id,
    )
    const out = []
    for (const o of orders) {
      const items = await db.all('SELECT id, product_id, name, price, qty, license_key FROM order_items WHERE order_id = ?', o.id)
      out.push({
        id: o.id,
        total: o.total,
        discount: o.discount ?? 0,
        status: o.status,
        paymentMethod: o.payment_method ?? 'stripe',
        createdAt: o.created_at,
        pointsEarned: o.points_earned ?? 0,
        items: items.map((it) => ({ productId: String(it.product_id), name: it.name, price: it.price, qty: it.qty, licenseKey: it.license_key ?? null })),
      })
    }
    return json({ items: out })
  },

  // DESCARGAR PRODUCTO GRATUITO: lo añade a la biblioteca al instante con licencia.
  async freeProduct(user, body, env) {
    const productId = String(body?.productId ?? '')
    if (!productId) return fail(400, 'Falta el id del producto', 'BAD_REQUEST')
    const product = await db.get('SELECT * FROM products WHERE id = ?', productId)
    if (!product) return fail(404, 'Producto no encontrado', 'NOT_FOUND')
    if (Number(product.price) > 0) return fail(403, 'Este producto no es gratuito', 'FORBIDDEN')
    const owned = await db.get(
      `SELECT oi.id FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.user_id = ? AND o.status IN ('paid','delivered') AND oi.product_id = ? LIMIT 1`,
      user.id, productId,
    )
    if (owned) return fail(409, 'Ya tienes este producto en tu biblioteca', 'ALREADY_OWNED')
    const licenseKey = `VERTA-${rand4()}-${rand4()}-${rand4()}`
    const trackingToken = randomToken()
    const order = await db.run(
      `INSERT INTO orders (user_id, customer_name, customer_email, subtotal, discount, shipping, total, status, estimated_delivery, tracking_token)
       VALUES (?, ?, ?, 0, 0, 0, 0, 'paid', NULL, ?)`,
      user.id, user.name ?? '', user.email ?? '', trackingToken,
    )
    await db.run(
      'INSERT INTO order_items (order_id, product_id, name, price, qty, license_key, version_at_purchase) VALUES (?, ?, ?, 0, 1, ?, ?)',
      order.lastId, productId, product.name, licenseKey, product.version ?? '1.0.0',
    )
    return json({ id: order.lastId, licenseKey, status: 'paid' }, 201)
  },

  async myLibrary(user) {
    const rows = await db.all(
      `SELECT p.id, p.name, p.slug, p.category, p.image, p.file_type, p.file_size, p.compatibility, p.license,
              p.downloads, p.includes, p.requirements, p.updates, p.support, p.brand, p.price, p.version,
              o.id AS order_id, o.status AS order_status, o.created_at AS purchased_at,
              oi.license_key, oi.version_at_purchase
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN products p ON p.id = oi.product_id
       WHERE o.user_id = ? AND o.status IN ('paid', 'delivered')
       ORDER BY o.created_at DESC`,
      user.id,
    )
    return json({
      items: rows.map((r) => ({
        id: String(r.id),
        name: r.name,
        slug: r.slug,
        brand: r.brand,
        category: r.category,
        price: r.price,
        image: r.image,
        fileType: r.file_type ?? digitalDefaults(r.category).fileType,
        fileSize: r.file_size ?? digitalDefaults(r.category).fileSize,
        compatibility: r.compatibility ?? digitalDefaults(r.category).compatibility,
        license: r.license ?? 'Uso personal y comercial',
        downloads: r.downloads ?? 0,
        includes: safeJson(r.includes, []),
        requirements: safeJson(r.requirements, []),
        updates: r.updates ?? 'Actualizaciones de por vida',
        support: r.support ?? 'Soporte por correo',
        version: r.version ?? r.version_at_purchase ?? '1.0.0',
        versionAtPurchase: r.version_at_purchase ?? r.version ?? '1.0.0',
        hasUpdate: (r.version ?? r.version_at_purchase ?? '1.0.0') !== (r.version_at_purchase ?? r.version ?? '1.0.0'),
        licenseKey: r.license_key ?? null,
        orderId: r.order_id,
        purchasedAt: r.purchased_at,
      })),
    })
  },

  // Descarga REAL de un producto comprado: genera los archivos del producto
  // (plantilla, ZIP de recursos, fuente TTF, preset XMP, modelo OBJ, curso PDF,
  // plugin, etc.) + README + licencia única, todo empaquetado en un ZIP.
  async downloadProduct(user, id, env) {
    const row = await db.get(
      `SELECT DISTINCT p.*, oi.license_key, oi.version_at_purchase, o.id AS order_id
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN products p ON p.id = oi.product_id
       WHERE o.user_id = ? AND o.status IN ('paid', 'delivered') AND p.id = ?`,
      user.id, Number(id),
    )
    if (!row) return fail(403, 'No tienes acceso a este archivo', 'FORBIDDEN')
    // Solo comprobación de acceso: sin esto, cualquier usuario podría generar el archivo.
    const p = productToApi(row)
    // Entrega la versión que el usuario compró (o la actual si no se registró).
    p.version = row.version_at_purchase || row.version || '1.0.0'

    // Genera el archivo real del producto con la licencia de esta compra.
    const { filename, contentType, bytes } = buildProductFile(p, row.license_key ?? `VERTA-${rand4()}-${rand4()}-${rand4()}`)
    // Incrementa el contador de descargas del producto.
    await db.run('UPDATE products SET downloads = downloads + 1 WHERE id = ?', row.id)
    return new Response(bytes, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
        ...CORS,
      },
    })
  },

  // REEMBOLSO (parcial / total) desde el Panel + aviso por correo
  async adminRefundOrder(id, body, env) {
    const order = await db.get('SELECT * FROM orders WHERE id = ?', id)
    if (!order) return fail(404, 'Pedido no encontrado', 'NOT_FOUND')
    if (order.refund_status !== 'none') return fail(400, 'Este pedido ya tiene un reembolso', 'ALREADY_REFUNDED')
    const amount = Math.max(0, Math.min(Number(body?.amount ?? order.total), order.total) || 0)
    const reason = String(body?.reason ?? '').trim()
    const isFull = amount >= order.total
    await db.run(
      `UPDATE orders SET refund_status = ?, refund_amount = ?, refund_reason = ? WHERE id = ?`,
      isFull ? 'full' : 'partial', amount, reason || (isFull ? 'Reembolso total' : 'Reembolso parcial'), id,
    )
    // Si era un pago confirmado, reflejamos el reembolso en la cuenta receptora.
    const payment = await db.get('SELECT payout_account_id FROM payout_transactions WHERE ref_id = ? AND type = ? ORDER BY id DESC LIMIT 1', order.id, 'order')
    if (payment?.payout_account_id) {
      await db.run(
        "INSERT INTO payout_transactions (payout_account_id, user_id, type, amount, currency, method, reference, status) VALUES (?, ?, 'refund', ?, 'USD', 'card', ?, 'refunded')",
        payment.payout_account_id, order.user_id, -amount, `RMB-${order.id}`,
      )
    }
    await sendEmail(
      env,
      order.customer_email,
      `Vertamart — reembolso de tu pedido #${order.id}`,
      `<p>Hola ${order.customer_name},</p><p>Hemos procesado un <strong>reembolso ${isFull ? 'total' : 'parcial'}</strong> de <strong>${amount.toLocaleString('es-CL')}</strong>${reason ? ` (${reason})` : ''} para tu pedido <strong>#${order.id}</strong>.</p><p>El importe volverá a tu método de pago en unos días.</p>`,
    )
    return json({ id: order.id, refundStatus: isFull ? 'full' : 'partial', refundAmount: amount, refundReason: reason })
  },

  // NÚMERO DE SEGUIMIENTO REAL (Correos / SEUR / etc.)
  async adminSetTracking(id, body) {
    const trackingNumber = String(body?.trackingNumber ?? '').trim()
    if (!trackingNumber) return fail(400, 'Falta el número de seguimiento', 'INVALID_TRACKING')
    const order = await db.get('SELECT * FROM orders WHERE id = ?', id)
    if (!order) return fail(404, 'Pedido no encontrado', 'NOT_FOUND')
    await db.run('UPDATE orders SET tracking_number = ? WHERE id = ?', trackingNumber, id)
    return json({ id: order.id, trackingNumber })
  },

  // ANALÍTICAS DEL PANEL
  async adminAnalytics() {
    const totals = await db.get(
      `SELECT COALESCE(SUM(total), 0) AS revenue, COUNT(*) AS orders FROM orders WHERE status = 'paid'`,
    )
    const pending = await db.get("SELECT COUNT(*) AS count FROM orders WHERE status = 'pending'")
    const users = await db.get('SELECT COUNT(*) AS count FROM users')
    const products = await db.get("SELECT COUNT(*) AS count FROM products WHERE status = 'active'")
    const lowStock = await db.all(
      `SELECT CAST(id AS TEXT) AS id, name, stock FROM products WHERE stock > 0 AND stock <= ${LOW_STOCK_THRESHOLD} ORDER BY stock ASC LIMIT 25`,
    )
    const soldOut = await db.all(
      `SELECT CAST(id AS TEXT) AS id, name, stock FROM products WHERE stock <= 0 ORDER BY stock ASC LIMIT 25`,
    )
    const byDay = await db.all(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS orders, COALESCE(SUM(total), 0) AS revenue
       FROM orders WHERE status = 'paid' AND created_at >= date('now', '-30 days')
       GROUP BY day ORDER BY day`,
    )
    const topProducts = await db.all(
      `SELECT oi.name, SUM(oi.qty) AS qty, SUM(oi.qty * oi.price) AS revenue
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.status = 'paid'
       GROUP BY oi.name ORDER BY qty DESC LIMIT 10`,
    )
    return json({
      revenue: totals?.revenue ?? 0,
      orders: totals?.orders ?? 0,
      pendingOrders: pending?.count ?? 0,
      users: users?.count ?? 0,
      products: products?.count ?? 0,
      lowStock,
      soldOut,
      byDay,
      topProducts,
    })
  },

  // NOTIFICACIONES PUSH
  async pushSubscribe(user, body) {
    const endpoint = String(body?.endpoint ?? '').trim()
    if (!endpoint) return fail(400, 'Falta endpoint', 'INVALID_ENDPOINT')
    const keys = body?.keys ?? {}
    const ua = String(body?.userAgent ?? '').slice(0, 200)
    const category = String(body?.category ?? 'web')
    await db.run(
      'INSERT INTO push_subscriptions (user_id, endpoint, keys, user_agent, category) VALUES (?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, keys = excluded.keys, category = excluded.category',
      user.id, endpoint, JSON.stringify(keys), ua, category,
    )
    return json({ ok: true })
  },

  async pushUnsubscribe(user, body) {
    const endpoint = String(body?.endpoint ?? '')
    if (endpoint) {
      await db.run('DELETE FROM push_subscriptions WHERE endpoint = ?', endpoint)
    } else {
      await db.run('DELETE FROM push_subscriptions WHERE user_id = ?', user.id)
    }
    return json({ ok: true })
  },

  // Migración puntual vía Worker (el CLI D1 tarda en exceso en este equipo).
  async ensureNewSchema() {
    // Ya migrado: no repetimos las comprobaciones en cada petición.
    try {
      await db.run('SELECT transaction_id FROM orders LIMIT 0')
      return
    } catch { /* falta la columna: migramos */ }
    const cols = [
      ['reviews', 'image_url', 'TEXT'],
      ['reviews', 'verified', 'INTEGER NOT NULL DEFAULT 0'],
      ['orders', 'tracking_number', 'TEXT'],
      ['orders', 'refund_status', "TEXT NOT NULL DEFAULT 'none'"],
      ['orders', 'refund_amount', 'INTEGER NOT NULL DEFAULT 0'],
      ['orders', 'refund_reason', 'TEXT'],
      ['orders', 'points_earned', 'INTEGER NOT NULL DEFAULT 0'],
      ['orders', 'transaction_id', 'TEXT'],
      ['orders', 'payment_status', 'TEXT'],
      ['orders', 'payment_method', 'TEXT'],
      ['users', 'points', 'INTEGER NOT NULL DEFAULT 0'],
    ]
    const applied = []
    for (const [table, col, def] of cols) {
      let exists = false
      try { await db.run(`SELECT ${col} FROM ${table} LIMIT 0`); exists = true } catch { exists = false }
      if (!exists) {
        await db.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`)
        applied.push(`${table}.${col}`)
      }
    }
    await db.run(`CREATE TABLE IF NOT EXISTS points_history (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, delta INTEGER NOT NULL, reason TEXT NOT NULL, ref_type TEXT NOT NULL DEFAULT 'order', ref_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')))`)
    await db.run(`CREATE TABLE IF NOT EXISTS push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, endpoint TEXT NOT NULL UNIQUE, keys TEXT NOT NULL, user_agent TEXT, category TEXT NOT NULL DEFAULT 'web', created_at TEXT NOT NULL DEFAULT (datetime('now')))`)
    await db.run(`CREATE INDEX IF NOT EXISTS idx_points_user ON points_history (user_id, created_at)`)
    await db.run(`CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions (user_id)`)
    return json({ ok: true, applied })
  },

  async adminSendPush(body, env) {
    const title = String(body?.title ?? 'Vertamart').trim()
    const message = String(body?.message ?? '').trim()
    const url = String(body?.url ?? '/').trim()
    if (!message) return fail(400, 'Falta el mensaje', 'INVALID_MESSAGE')
    const sent = await pushToAll(env, title, message, url)
    return json({ ok: true, sent })
  },

  // CATEGORÍAS (panel admin)
  async adminCategories() {
    const rows = await db.all(`SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category = c.key) AS product_count FROM categories c ORDER BY c.sort_order ASC, c.name ASC`)
    return json({ items: rows.map((r) => ({ id: r.id, key: r.key, name: r.name, tagline: r.tagline, active: r.active, sortOrder: r.sort_order, productCount: r.product_count, createdAt: r.created_at })), total: rows.length })
  },
  async adminCreateCategory(body) {
    const key = String(body?.key ?? '').trim().toLowerCase().replace(/\s+/g, '-')
    const name = String(body?.name ?? '').trim()
    if (key.length < 2 || !name) return fail(400, 'La categoría necesita nombre y clave', 'INVALID_CATEGORY')
    const tagline = body?.tagline ? String(body.tagline).trim() : null
    const active = body?.active === false ? 0 : 1
    const sortOrder = Math.max(0, Number(body?.sortOrder ?? 0))
    try {
      const info = await db.run('INSERT INTO categories (key, name, tagline, active, sort_order) VALUES (?, ?, ?, ?, ?)', key, name, tagline, active, sortOrder)
      return json({ id: info.lastId, key, name, tagline, active, sortOrder, productCount: 0, createdAt: new Date().toISOString() }, 201)
    } catch { return fail(409, 'Esa categoría ya existe', 'CATEGORY_TAKEN') }
  },
  async adminUpdateCategory(id, body) {
    const row = await db.get('SELECT * FROM categories WHERE id = ?', id)
    if (!row) return fail(404, 'Categoría no encontrada', 'NOT_FOUND')
    const key = body?.key !== undefined ? String(body.key).trim().toLowerCase().replace(/\s+/g, '-') : row.key
    const name = body?.name !== undefined ? String(body.name).trim() : row.name
    const tagline = body?.tagline !== undefined ? (body.tagline ? String(body.tagline).trim() : null) : row.tagline
    const active = body?.active !== undefined ? (body.active ? 1 : 0) : row.active
    const sortOrder = body?.sortOrder !== undefined ? Math.max(0, Number(body.sortOrder)) : row.sort_order
    try {
      await db.run('UPDATE categories SET key = ?, name = ?, tagline = ?, active = ?, sort_order = ? WHERE id = ?', key, name, tagline, active, sortOrder, id)
    } catch { return fail(409, 'Esa categoría ya existe', 'CATEGORY_TAKEN') }
    return json({ id, key, name, tagline, active, sortOrder, productCount: 0, createdAt: row.created_at })
  },
  async adminDeleteCategory(id) {
    const row = await db.get('SELECT * FROM categories WHERE id = ?', id)
    if (!row) return fail(404, 'Categoría no encontrada', 'NOT_FOUND')
    await db.run(`UPDATE products SET category = 'general' WHERE category = ?`, row.key)
    await db.run(`INSERT OR IGNORE INTO categories (key, name, tagline) VALUES ('general', 'General', 'Productos generales')`)
    await db.run('DELETE FROM categories WHERE id = ?', id)
    return new Response(null, { status: 204 })
  },

}

/* ------------------------------- router -------------------------------- */

// Orden importante: rutas más específicas primero.
// Formato: [método, regex, handler, requiereSesion, requiereAdmin]
/* ------------------------------------------------------------------------
 * Webhook de Stripe: verificación criptográfica de la firma.
 * La confirmación definitiva del pedido depende EXCLUSIVAMENTE de este
 * evento verificado por el backend — nunca del navegador.
 * ---------------------------------------------------------------------- */
async function handleStripeWebhook(rawBody, signature, env) {
  const stripe = getStripe(env)
  if (!stripe) return fail(503, 'Stripe no está configurado', 'STRIPE_NOT_CONFIGURED')
  const secret = env.STRIPE_WEBHOOK_SECRET
  if (!secret) return fail(500, 'Webhook sin secreto configurado', 'WEBHOOK_MISCONFIGURED')

  let event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret)
  } catch (err) {
    return fail(400, `Firma de webhook inválida: ${err.message}`, 'SIGNATURE_INVALID')
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const orderId = Number(session.client_reference_id || session.metadata?.orderId)
        if (!orderId) return fail(400, 'Sesión sin pedido asociado', 'NO_ORDER')
        // Idempotencia: si el pedido ya está pagado/entregado, no hacemos nada.
        const order = await db.get('SELECT * FROM orders WHERE id = ?', orderId)
        if (!order) return fail(404, 'Pedido no encontrado', 'NOT_FOUND')
        if (order.status === 'paid' || order.status === 'delivered' || order.status === 'refunded') {
          return json({ received: true, duplicate: true })
        }
        // Confirmado por el proveedor → pedido PAGADO + licencias + biblioteca.
        await db.run(
          "UPDATE orders SET status = 'paid', transaction_id = COALESCE(transaction_id, ?), payment_status = 'approved', payment_method = 'stripe' WHERE id = ?",
          session.payment_intent ? String(session.payment_intent) : null, orderId,
        )
        const items = await db.all('SELECT * FROM order_items WHERE order_id = ?', orderId)
        for (const it of items) {
          const prod = await db.get('SELECT version FROM products WHERE id = ?', String(it.product_id))
          const licenseKey = `VERTA-${rand4()}-${rand4()}-${rand4()}`
          await db.run('UPDATE order_items SET license_key = ?, version_at_purchase = ? WHERE id = ?', licenseKey, prod?.version ?? '1.0.0', it.id)
          await db.run('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?', Number(it.qty ?? 1), String(it.product_id))
        }
        // Puntos de fidelidad.
        const earned = Math.floor(order.total / 10)
        if (order.user_id && earned > 0) {
          await db.run('UPDATE users SET points = points + ? WHERE id = ?', earned, order.user_id)
          await db.run('INSERT INTO points_history (user_id, delta, reason, ref_type, ref_id) VALUES (?, ?, ?, ?, ?)', order.user_id, earned, 'Compra · puntos de fidelidad', 'order', orderId)
          await db.run('UPDATE orders SET points_earned = ? WHERE id = ?', earned, orderId)
        }
        // Correo de confirmación con enlace privado de seguimiento.
        const frontend = env.FRONTEND_URL || 'https://vertamart.pages.dev'
        const trackingUrl = `${frontend}/pedido/${order.tracking_token}`
        const itemsHtml = items.map((it) => `<li style="margin:2px 0">${String(it.name ?? '')} × ${Number(it.qty ?? 1)}</li>`).join('')
        await sendEmail(
          env,
          order.customer_email,
          `Vertamart — pago confirmado del pedido #${orderId}`,
          `<p>Hola ${order.customer_name},</p><p>¡Pago confirmado! Tu pedido digital <strong>#${orderId}</strong> ya está disponible en tu biblioteca (<em>Mis descargas</em>).</p><ul>${itemsHtml}</ul><p>Total: <strong>${Number(order.total).toLocaleString('es-ES')} €</strong></p><p>Sigue tu pedido: <a href="${trackingUrl}">${trackingUrl}</a></p>`,
        ).catch(() => 0)
        if (order.user_id) {
          await pushToAllForUser(env, order.user_id, '✅ Pago confirmado', `Pedido #${orderId} disponible en tu biblioteca`, '/cuenta?tab=descargas').catch(() => 0)
        }
        return json({ received: true, orderId })
      }
      case 'checkout.session.expired':
      case 'payment_intent.payment_failed': {
        const session = event.data.object
        const orderId = Number(session.client_reference_id || session.metadata?.orderId)
        if (orderId) {
          await db.run("UPDATE orders SET status = 'failed' WHERE id = ? AND status = 'pending'", orderId)
        }
        return json({ received: true })
      }
      case 'charge.refunded': {
        // Reembolso: se revoca el acceso (el producto sale de la biblioteca).
        const charge = event.data.object
        const pi = charge.payment_intent
        const order = pi ? await db.get('SELECT * FROM orders WHERE transaction_id = ?', String(pi)) : null
        if (order) {
          await db.run("UPDATE orders SET status = 'refunded', refund_status = 'full', refund_amount = ?, refund_reason = 'Reembolso vía Stripe' WHERE id = ?", Math.round(charge.amount_refunded), order.id)
          await db.run('DELETE FROM order_items WHERE order_id = ?', order.id)
        }
        return json({ received: true })
      }
      default:
        return json({ received: true })
    }
  } catch (err) {
    return fail(500, `Error procesando webhook: ${err.message}`, 'WEBHOOK_ERROR')
  }
}

const ROUTES = [
  ['GET', /^\/api\/admin\/payout-account$/, (u) => handlers.getPayoutAccount(), true, true],
  ['PUT', /^\/api\/admin\/payout-account$/, (u, b) => handlers.savePayoutAccount(b), true, true],
  // Compatibilidad con bundles antiguos que enviaban payout/-account.
  ['GET', /^\/api\/admin\/payout\/-account$/, (u) => handlers.getPayoutAccount(), true, true],
  ['PUT', /^\/api\/admin\/payout\/-account$/, (u, b) => handlers.savePayoutAccount(b), true, true],
  ['POST', /^\/api\/auth\/register$/, (u, b) => handlers.register(b), false, false],
  ['GET', /^\/api\/auth\/email-availability$/, (u, b, req) => handlers.emailAvailability(req), false, false],
  ['POST', /^\/api\/auth\/support-login$/, (u, b) => handlers.supportLogin(b), false, false],
  ['POST', /^\/api\/auth\/support\/login$/, (u, b) => handlers.supportLogin(b), false, false],
  ['POST', /^\/api\/auth\/support-login$/, (u, b) => handlers.supportLogin(b), false, false],
  ['POST', /^\/api\/auth\/login$/, (u, b) => handlers.login(b), false, false],
  ['POST', /^\/api\/auth\/forgot-password$/, (u, b, req, m, env) => handlers.forgotPassword(b, req, m, env), false, false],
  ['GET', /^\/api\/auth\/reset-password\/verify$/, (u, b, req) => handlers.verifyResetToken(req), false, false],
  ['POST', /^\/api\/auth\/reset-password$/, (u, b) => handlers.resetPassword(b), false, false],
  ['GET', /^\/api\/auth\/google$/, (u, b, req, m, env) => handlers.oauthStart('google', req, env), false, false],
  ['GET', /^\/api\/auth\/google\/callback$/, (u, b, req, m, env) => handlers.googleCallback(req, env), false, false],
  ['GET', /^\/api\/auth\/apple$/, (u, b, req, m, env) => handlers.oauthStart('apple', req, env), false, false],
  ['POST', /^\/api\/auth\/apple\/callback$/, (u, b, req, m, env) => handlers.appleCallback(req, env), false, false],
  ['POST', /^\/api\/auth\/logout$/, (u, b, req) => handlers.logout(req), false, false],
  ['POST', /^\/api\/auth\/subscribe$/, (u) => handlers.subscribe(u), true, false],
  ['POST', /^\/api\/auth\/unsubscribe$/, (u) => handlers.unsubscribe(u), true, false],
  ['GET', /^\/api\/auth\/subscription$/, (u) => handlers.getSubscription(u), true, false],
  ['POST', /^\/api\/subscription\/pay$/, (u, b, req, m, env) => handlers.paySubscription(u, b, env), true, false],
  ['GET', /^\/api\/auth\/me$/, (u) => handlers.meGet(u), true, false],
  ['GET', /^\/api\/auth\/verification$/, (u) => handlers.verification(u), true, false],
  ['PATCH', /^\/api\/auth\/me$/, (u, b) => handlers.mePatch(u, b), true, false],
  ['GET', /^\/api\/products\/mine$/, (u) => handlers.myProducts(u), true, false],
  ['POST', /^\/api\/coupons\/validate$/, (u, b) => handlers.validateCoupon(b), false, false],
  ['GET', /^\/api\/categories$/, () => handlers.listCategories(), false, false],
  ['GET', /^\/api\/payout-info$/, () => handlers.payoutInfo(), false, false],
  ['GET', /^\/api\/feed$/, (u) => handlers.listFeed(u), false, false],
  ['GET', /^\/api\/feed\/mine$/, (u) => handlers.myFeedPosts(u), true, false],
  ['POST', /^\/api\/feed$/, (u, b) => handlers.createFeed(u, b), true, false],
  ['PATCH', /^\/api\/feed\/(\d+)$/, (u, b, req, m) => handlers.patchFeed(u, Number(m[1]), b), true, false],
  ['DELETE', /^\/api\/feed\/(\d+)$/, (u, b, req, m) => handlers.deleteFeed(u, Number(m[1])), true, false],
  ['POST', /^\/api\/feed\/(\d+)\/like$/, (u, b, req, m) => handlers.feedLike(u, Number(m[1])), true, false],
  ['GET', /^\/api\/feed\/(\d+)\/comments$/, (u, b, req, m) => handlers.feedComments(Number(m[1])), false, false],
  ['POST', /^\/api\/feed\/(\d+)\/comments$/, (u, b, req, m) => handlers.addFeedComment(u, Number(m[1]), b), true, false],
  ['DELETE', /^\/api\/feed\/comments\/([A-Za-z0-9-]+)$/, (u, b, req, m) => handlers.deleteFeedComment(u, m[1]), true, false],
  ['POST', /^\/api\/feed\/(\d+)\/share$/, (u, b, req, m) => handlers.shareFeed(u, Number(m[1]), b), true, false],
  ['GET', /^\/api\/products$/, () => handlers.listProducts(), false, false],
  ['POST', /^\/api\/products$/, (u, b) => handlers.createProduct(u, b), true, false],
  ['PATCH', /^\/api\/products\/(\d+)$/, (u, b, req, m) => handlers.patchProduct(u, Number(m[1]), b), true, false],
  ['DELETE', /^\/api\/products\/(\d+)$/, (u, b, req, m) => handlers.deleteProduct(u, Number(m[1])), true, false],
  ['GET', /^\/api\/users\/(\d+)\/products$/, (u, b, req, m) => handlers.getUserProducts(Number(m[1])), false, false],
  ['POST', /^\/api\/users\/(\d+)\/follow$/, (u, b, req, m) => handlers.follow(u, Number(m[1])), true, false],
  ['DELETE', /^\/api\/users\/(\d+)\/follow$/, (u, b, req, m) => handlers.unfollow(u, Number(m[1])), true, false],
  ['POST', /^\/api\/users\/(\d+)\/block$/, (u, b, req, m) => handlers.blockUser(u, Number(m[1])), true, false],
  ['DELETE', /^\/api\/users\/(\d+)\/block$/, (u, b, req, m) => handlers.unblockUser(u, Number(m[1])), true, false],
  ['DELETE', /^\/api\/contacts\/(\d+)$/, (u, b, req, m) => handlers.deleteContact(u, Number(m[1])), true, false],
  ['GET', /^\/api\/users\/(\d+)$/, (u, b, req, m) => handlers.getUser(u, Number(m[1])), false, false],
  ['GET', /^\/api\/me\/points$/, (u) => handlers.mePoints(u), true, false],
  ['GET', /^\/api\/me\/library$/, (u) => handlers.myLibrary(u), true, false],
  ['GET', /^\/api\/me\/orders$/, (u) => handlers.myOrders(u), true, false],
  ['POST', /^\/api\/me\/library\/free$/, (u, b, req, m, env) => handlers.freeProduct(u, b, env), true, false],
  ['GET', /^\/api\/me\/library\/(\d+)\/download$/, (u, b, req, m, env) => handlers.downloadProduct(u, m[1], env), true, false],
  ['POST', /^\/api\/push\/subscribe$/, (u, b) => handlers.pushSubscribe(u, b), true, false],
  ['POST', /^\/api\/push\/unsubscribe$/, (u, b) => handlers.pushUnsubscribe(u, b), true, false],
  ['POST', /^\/api\/admin\/push\/send$/, (u, b, req, m, env) => handlers.adminSendPush(b, env), true, true],
  ['POST', /^\/api\/admin\/orders\/(\d+)\/refund$/, (u, b, req, m, env) => handlers.adminRefundOrder(Number(m[1]), b, env), true, true],
  ['POST', /^\/api\/admin\/orders\/(\d+)\/tracking$/, (u, b, req, m) => handlers.adminSetTracking(Number(m[1]), b), true, true],
  ['GET', /^\/api\/admin\/analytics$/, (u) => handlers.adminAnalytics(), true, true],
  ['GET', /^\/api\/me\/following$/, (u) => handlers.following(u), true, false],
  ['GET', /^\/api\/conversations$/, (u) => handlers.conversations(u), true, false],
  ['GET', /^\/api\/conversations\/(\d+)\/messages$/, (u, b, req, m) => handlers.getMessages(u, Number(m[1])), true, false],
  ['POST', /^\/api\/conversations\/(\d+)\/messages$/, (u, b, req, m) => handlers.sendMessage(u, Number(m[1]), b), true, false],
  ['PATCH', /^\/api\/messages\/(\d+)$/, (u, b, req, m) => handlers.editMessage(u, Number(m[1]), b), true, false],
  ['DELETE', /^\/api\/messages\/(\d+)$/, (u, b, req, m) => handlers.deleteMessage(u, Number(m[1])), true, false],
  ['POST', /^\/api\/orders$/, (u, b, req, m, env) => handlers.createOrder(req, b, env), false, false],
  ['POST', /^\/api\/checkout\/stripe$/, (u, b, req, m, env) => handlers.stripeCheckout(u, b, env), true, false],
  ['GET', /^\/api\/me\/payment-methods$/, (u, b, req, m, env) => handlers.mePaymentMethods(u, env), true, false],
  ['POST', /^\/api\/me\/payment-methods\/setup$/, (u, b, req, m, env) => handlers.createPaymentSetup(u, env), true, false],
  ['POST', /^\/api\/me\/payment-methods\/([A-Za-z0-9_]+)\/default$/, (u, b, req, m, env) => handlers.setDefaultPaymentMethod(u, m[1], env), true, false],
  ['DELETE', /^\/api\/me\/payment-methods\/([A-Za-z0-9_]+)$/, (u, b, req, m, env) => handlers.deletePaymentMethod(u, m[1], env), true, false],
  ['GET', /^\/api\/settings$/, (u, b, req, m, env) => handlers.getPublicSettings(env), false, false],
  ['GET', /^\/api\/admin\/settings$/, (u, b, req, m, env) => handlers.adminGetSettings(env), true, true],
  ['PATCH', /^\/api\/admin\/settings$/, (u, b, req, m, env) => handlers.adminPatchSettings(b), true, true],
  ['GET', /^\/api\/admin\/stripe\/finance$/, (u, b, req, m, env) => handlers.adminStripeFinance(env), true, true],
  ['POST', /^\/api\/admin\/stripe\/refund$/, (u, b, req, m, env) => handlers.adminStripeRefund(env, b), true, true],
  ['GET', /^\/api\/orders\/track\/([A-Za-z0-9]+)$/, (u, b, req, m) => handlers.trackOrder(m[1]), false, false],
  ['POST', /^\/api\/admin\/orders\/(\d+)\/approve$/, (u, b, req, m, env) => handlers.adminApproveOrder(Number(m[1]), env), true, true],
  ['GET', /^\/api\/admin\/promo-codes$/, (u) => handlers.adminPromoCodes(), true, true],
  ['POST', /^\/api\/admin\/promo-codes$/, (u, b) => handlers.adminCreatePromo(b), true, true],
  ['PATCH', /^\/api\/admin\/promo-codes\/(\d+)$/, (u, b, req, m) => handlers.adminUpdatePromo(Number(m[1]), b), true, true],
  ['DELETE', /^\/api\/admin\/promo-codes\/(\d+)$/, (u, b, req, m) => handlers.adminDeletePromo(Number(m[1])), true, true],
  ['GET', /^\/api\/admin\/categories$/, (u) => handlers.adminCategories(), true, true],
  ['POST', /^\/api\/admin\/categories$/, (u, b) => handlers.adminCreateCategory(b), true, true],
  ['PATCH', /^\/api\/admin\/categories\/(\d+)$/, (u, b, req, m) => handlers.adminUpdateCategory(Number(m[1]), b), true, true],
  ['DELETE', /^\/api\/admin\/categories\/(\d+)$/, (u, b, req, m) => handlers.adminDeleteCategory(Number(m[1])), true, true],
  ['POST', /^\/api\/payments\/paypal\/orders$/, (u, b, req, m, env) => handlers.paypalCreate(env, b), false, false],
  ['POST', /^\/api\/payments\/paypal\/orders\/([A-Z0-9-]+)\/capture$/, (u, b, req, m, env) => handlers.paypalCapture(env, m[1]), false, false],
  ['GET', /^\/api\/products\/(\w+)\/versions$/, (u, b, req, m, env) => handlers.productVersions(u, m[1], env), false, false],
  ['GET', /^\/api\/products\/(\w+)\/reviews$/, (u, b, req, m) => handlers.getReviews(m[1]), false, false],
  ['POST', /^\/api\/products\/(\w+)\/reviews$/, (u, b, req, m) => handlers.addReview(u, m[1], b), true, false],
  ['DELETE', /^\/api\/products\/(\w+)\/reviews$/, (u, b, req, m) => handlers.deleteReview(u, m[1]), true, false],
  ['GET', /^\/api\/admin\/moderation\/feed$/, (u) => handlers.adminModerationFeed(), true, true],
  ['DELETE', /^\/api\/admin\/moderation\/feed\/(\d+)$/, (u, b, req, m) => handlers.adminDeleteModerationFeed(Number(m[1])), true, true],
  ['DELETE', /^\/api\/admin\/moderation\/comments\/([A-Za-z0-9-]+)$/, (u, b, req, m) => handlers.adminDeleteModerationComment(m[1]), true, true],
  ['GET', /^\/api\/admin\/moderation\/messages$/, (u) => handlers.adminModerationMessages(), true, true],
  ['DELETE', /^\/api\/admin\/moderation\/messages\/(\d+)$/, (u, b, req, m) => handlers.adminDeleteModerationMessage(Number(m[1])), true, true],
  ['GET', /^\/api\/admin\/orders\/(\d+)\/items$/, (u, b, req, m) => handlers.adminOrderItems(Number(m[1])), true, true],
  ['GET', /^\/api\/admin\/products$/, (u) => handlers.adminProducts(), true, true],
  ['GET', /^\/api\/admin\/orders$/, (u) => handlers.adminOrders(), true, true],
  ['PATCH', /^\/api\/admin\/orders\/(\d+)\/status$/, (u, b, req, m) => handlers.adminOrderStatus(Number(m[1]), b), true, true],
  ['DELETE', /^\/api\/admin\/orders\/(\d+)$/, (u, b, req, m) => handlers.adminDeleteOrder(Number(m[1])), true, true],
  ['PATCH', /^\/api\/admin\/orders\/(\d+)\/delivery$/, (u, b, req, m, env) => handlers.adminUpdateDelivery(Number(m[1]), b, env), true, true],
  ['POST', /^\/api\/admin\/payout-transactions\/(\d+)\/confirm$/, (u, b, req, m, env) => handlers.confirmPayoutTransaction(Number(m[1]), env), true, true],
  ['POST', /^\/api\/admin\/payout-transactions\/(\d+)\/refund$/, (u, b, req, m) => handlers.refundPayoutTransaction(Number(m[1])), true, true],
  ['GET', /^\/api\/admin\/payments$/, (u) => handlers.adminPayments(), true, true],
  ['DELETE', /^\/api\/admin\/payments\/(\d+)$/, (u, b, req, m) => handlers.adminDeletePayment(Number(m[1])), true, true],
  ['GET', /^\/api\/admin\/users$/, (u) => handlers.adminUsers(), true, true],
  ['PATCH', /^\/api\/admin\/users\/(\d+)\/role$/, (u, b, req, m) => handlers.adminUserRole(u, Number(m[1]), b), true, true],
  ['DELETE', /^\/api\/admin\/users\/(\d+)$/, (u, b, req, m) => handlers.adminDeleteUser(u, Number(m[1])), true, true],
]

export default {
  async fetch(request, env) {
    DB = env.DB
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS })
    }

    const path = url.pathname
    if (!path.startsWith('/api/')) {
      return fail(404, 'Ruta no encontrada', 'NOT_FOUND')
    }

    await seedAdmin()
    await ensureAdminSchema()
    await handlers.ensureNewSchema()

    // Webhook de Stripe: necesita el cuerpo RAW para verificar la firma.
    if (path === '/api/webhooks/stripe' && request.method === 'POST') {
      const raw = await request.text()
      return withCors(await handleStripeWebhook(raw, request.headers.get('stripe-signature') || '', env))
    }

    const body = request.method === 'GET' || request.method === 'DELETE' ? undefined : await request.json().catch(() => undefined)

    for (const [method, pattern, handler, needsAuth, needsAdmin] of ROUTES) {
      if (request.method !== method) continue
      const m = path.match(pattern)
      if (!m) continue
      const user = await getUserFromToken(request)

      if (needsAuth && !user) return fail(401, 'Debes iniciar sesión', 'UNAUTHORIZED')
      if (needsAdmin && user?.role !== 'admin') {
        return fail(403, 'Requiere permisos de administrador', 'FORBIDDEN')
      }

      return withCors(await handler(user, body, request, m, env))
    }

    return fail(404, `Ruta no encontrada: ${request.method} ${path}`, 'NOT_FOUND')
  },
}

