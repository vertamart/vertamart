/**
 * Vertamart API — Cloudflare Worker + D1.
 *
 * Port de server/index.js (Express + node:sqlite) al runtime de Workers.
 * Mismo contrato de endpoints (/api/*), misma base SQL (SQLite/D1).
 * Diferencias: handler asíncrono (D1 es async) y sesiones con Web Crypto.
 */

import bcrypt from 'bcryptjs'
import { WorkerMailer } from 'worker-mailer'

/** Binding D1 inyectado por wrangler (env.DB). */
let DB = null

const SALT_ROUNDS = 10
const SESSION_TTL_DAYS = 30
const LOW_STOCK_THRESHOLD = 3
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ORDER_STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled']
const PRODUCT_STATUSES = ['active', 'hidden']

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
        port: 587,
        secure: false,
        startTls: true,
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
    shipDays: row.ship_days,
    colors: safeJson(row.colors, ['#16a34a']),
    image: row.image,
    images: safeJson(row.images, row.image ? [row.image] : []),
    productCode: row.product_code ?? null,
    createdAt: row.created_at,
    status: row.status,
    ownerId: row.owner_id ?? null,
    ownerName: row.owner_name ?? null,
    owner: row.owner_id ? { id: row.owner_id, name: row.owner_name ?? 'Vendedor', verified: ownerVerified } : null,
  }
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
      SELECT f.*, u.name AS user_name, p.name AS product_name, p.product_code,
        (SELECT COUNT(*) FROM feed_comments c WHERE c.post_id = f.id) AS comments_count
      FROM feed_posts f JOIN users u ON u.id = f.user_id
      LEFT JOIN products p ON CAST(p.id AS TEXT) = f.product_id
      ORDER BY f.id DESC
    `)
    const items = await Promise.all(rows.map(async (row) => ({
      id: row.id, userId: row.user_id, userName: row.user_name, userVerified: (await verificationFor(row.user_id)).verified,
      productId: row.product_id, productCode: row.product_code ?? null, productName: row.product_name ?? null,
      title: row.title, description: row.description, videoUrl: row.video_url,
      likesCount: row.likes_count ?? 0, liked: false, commentsCount: row.comments_count ?? 0, createdAt: row.created_at,
    })))
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
    const productCode = `VT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`

    if (name.length < 3) return fail(400, 'El nombre debe tener al menos 3 caracteres', 'INVALID_NAME')
    if (!Number.isFinite(price) || price <= 0) return fail(400, 'El precio debe ser mayor a 0', 'INVALID_PRICE')
    if (!Number.isInteger(stock) || stock < 0) return fail(400, 'El stock no es válido', 'INVALID_STOCK')
    if (image && !/^https?:\/\//.test(image)) return fail(400, 'La imagen debe ser una URL http(s)', 'INVALID_IMAGE')

    const base = slugify(name) || 'producto'
    let slug = base
    let n = 1
    while (await db.get('SELECT id FROM products WHERE slug = ?', slug)) {
      slug = `${base}-${Date.now().toString(36).slice(-4)}${n++}`
    }
    const info = await db.run(
      `INSERT INTO products (owner_id, name, slug, category, price, old_price, stock, badge, description, features, image, product_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      user.id, name, slug, category, price, oldPrice, stock, badge, description, JSON.stringify(features), image, productCode,
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
    if (body?.status !== undefined) {
      if (!PRODUCT_STATUSES.includes(body.status)) return fail(400, 'Estado no válido', 'INVALID_STATUS')
      sets.push('status = ?')
      values.push(body.status)
    }
    if (sets.length === 0) return fail(400, 'No hay campos para actualizar', 'EMPTY_UPDATE')
    values.push(row.id)
    await db.run(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`, ...values)
    const updated = await db.get('SELECT * FROM products WHERE id = ?', row.id)
    return json(productToApi(updated))
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
    const rows = await db.all('SELECT id, code, percent, min_amount, expires_at, active, created_at FROM promo_codes ORDER BY id DESC')
    return json({ items: rows.map((r) => ({ id: r.id, code: r.code, percent: r.percent, minAmount: r.min_amount, expiresAt: r.expires_at, active: r.active, createdAt: r.created_at })), total: rows.length })
  },
  async adminCreatePromo(body) {
    const code = String(body?.code ?? '').trim().toUpperCase()
    const percent = Number(body?.percent); const minAmount = Number(body?.minAmount ?? 0); const expiresAt = body?.expiresAt ? String(body.expiresAt) : null
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return fail(400, 'Código inválido', 'INVALID_CODE')
    if (!Number.isInteger(percent) || percent < 1 || percent > 90) return fail(400, 'Descuento entre 1 y 90%', 'INVALID_PERCENT')
    if (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) return fail(400, 'Fecha de caducidad inválida', 'INVALID_EXPIRY')
    try { const info = await db.run('INSERT INTO promo_codes (code, percent, min_amount, expires_at) VALUES (?, ?, ?, ?)', code, percent, minAmount, expiresAt); return json({ id: info.lastId, code, percent, minAmount, expiresAt, active: 1 }, 201) } catch { return fail(409, 'Ese código ya existe', 'CODE_TAKEN') }
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
    if (row.expires_at && new Date(`${row.expires_at}T23:59:59`) < new Date()) {
      return json({ valid: false, reason: 'EXPIRED' })
    }
    return json({ valid: true, code: row.code, percent: row.percent, min: row.min_amount })
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

  // PEDIDOS
  async createOrder(req, body, env) {
    const items = Array.isArray(body?.items) ? body.items : []
    const customerName = String(body?.customerName ?? '').trim()
    const customerEmail = String(body?.customerEmail ?? '').trim().toLowerCase()
    const subtotal = Number(body?.subtotal ?? 0)
    const discount = Number(body?.discount ?? 0)
    const shipping = Number(body?.shipping ?? 0)
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
      await db.run(
        'INSERT INTO order_items (order_id, product_id, name, price, qty) VALUES (?, ?, ?, ?, ?)',
        order.lastId, String(it.productId ?? ''), String(it.name ?? ''), Number(it.price ?? 0), Number(it.qty ?? 1),
      )
    }
    await db.run(
      'INSERT INTO payments (order_id, amount, method, transaction_id, installments, status) VALUES (?, ?, ?, ?, ?, ?)',
      order.lastId, total, method, transactionId, installments, paymentStatus,
    )

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
      `<p>Hola ${customerName},</p><p>¡Gracias por tu compra! Tu pedido <strong>#${order.lastId}</strong> quedó registrado.</p><ul>${itemsHtml}</ul><p>Total: <strong>${total.toLocaleString('es-CL')}</strong> · Envío: ${shipping.toLocaleString('es-CL')} · Descuento: ${discount.toLocaleString('es-CL')}</p><p>Consulta el estado de tu pedido en este enlace privado: <a href="${trackingUrl}">${trackingUrl}</a></p>`,
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
    const cols = [
      ['reviews', 'image_url', 'TEXT'],
      ['reviews', 'verified', 'INTEGER NOT NULL DEFAULT 0'],
      ['orders', 'tracking_number', 'TEXT'],
      ['orders', 'refund_status', "TEXT NOT NULL DEFAULT 'none'"],
      ['orders', 'refund_amount', 'INTEGER NOT NULL DEFAULT 0'],
      ['orders', 'refund_reason', 'TEXT'],
      ['orders', 'points_earned', 'INTEGER NOT NULL DEFAULT 0'],
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
}

/* ------------------------------- router -------------------------------- */

// Orden importante: rutas más específicas primero.
// Formato: [método, regex, handler, requiereSesion, requiereAdmin]
const ROUTES = [
  ['GET', /^\/api\/admin\/payout-account$/, (u) => handlers.getPayoutAccount(), true, true],
  ['PUT', /^\/api\/admin\/payout-account$/, (u, b) => handlers.savePayoutAccount(b), true, true],
  // Compatibilidad con bundles antiguos que enviaban payout/-account.
  ['GET', /^\/api\/admin\/payout\/-account$/, (u) => handlers.getPayoutAccount(), true, true],
  ['PUT', /^\/api\/admin\/payout\/-account$/, (u, b) => handlers.savePayoutAccount(b), true, true],
  ['POST', /^\/api\/auth\/register$/, (u, b) => handlers.register(b), false, false],
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
  ['GET', /^\/api\/products$/, () => handlers.listProducts(), false, false],
  ['POST', /^\/api\/products$/, (u, b) => handlers.createProduct(u, b), true, false],
  ['PATCH', /^\/api\/products\/(\d+)$/, (u, b, req, m) => handlers.patchProduct(u, Number(m[1]), b), true, false],
  ['DELETE', /^\/api\/products\/(\d+)$/, (u, b, req, m) => handlers.deleteProduct(u, Number(m[1])), true, false],
  ['GET', /^\/api\/users\/(\d+)\/products$/, (u, b, req, m) => handlers.getUserProducts(Number(m[1])), false, false],
  ['POST', /^\/api\/users\/(\d+)\/follow$/, (u, b, req, m) => handlers.follow(u, Number(m[1])), true, false],
  ['DELETE', /^\/api\/users\/(\d+)\/follow$/, (u, b, req, m) => handlers.unfollow(u, Number(m[1])), true, false],
  ['GET', /^\/api\/users\/(\d+)$/, (u, b, req, m) => handlers.getUser(u, Number(m[1])), false, false],
  ['GET', /^\/api\/me\/points$/, (u) => handlers.mePoints(u), true, false],
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
  ['POST', /^\/api\/orders$/, (u, b, req, m, env) => handlers.createOrder(req, b, env), false, false],
  ['GET', /^\/api\/orders\/track\/([A-Za-z0-9]+)$/, (u, b, req, m) => handlers.trackOrder(m[1]), false, false],
  ['POST', /^\/api\/admin\/orders\/(\d+)\/approve$/, (u, b, req, m, env) => handlers.adminApproveOrder(Number(m[1]), env), true, true],
  ['GET', /^\/api\/admin\/promo-codes$/, (u) => handlers.adminPromoCodes(), true, true],
  ['POST', /^\/api\/admin\/promo-codes$/, (u, b) => handlers.adminCreatePromo(b), true, true],
  ['DELETE', /^\/api\/admin\/promo-codes\/(\d+)$/, (u, b, req, m) => handlers.adminDeletePromo(Number(m[1])), true, true],
  ['POST', /^\/api\/payments\/paypal\/orders$/, (u, b, req, m, env) => handlers.paypalCreate(env, b), false, false],
  ['POST', /^\/api\/payments\/paypal\/orders\/([A-Z0-9-]+)\/capture$/, (u, b, req, m, env) => handlers.paypalCapture(env, m[1]), false, false],
  ['GET', /^\/api\/products\/(\w+)\/reviews$/, (u, b, req, m) => handlers.getReviews(m[1]), false, false],
  ['POST', /^\/api\/products\/(\w+)\/reviews$/, (u, b, req, m) => handlers.addReview(u, m[1], b), true, false],
  ['DELETE', /^\/api\/products\/(\w+)\/reviews$/, (u, b, req, m) => handlers.deleteReview(u, m[1]), true, false],
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

