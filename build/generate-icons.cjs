/* Genera icono de app Vertamart: cuadrado redondeado verde + marca "V" blanca.
 * Salida: build/icon.png (512) y build/icon.ico (Windows, PNG 256 incrustado).
 * Uso: node build/generate-icons.cjs
 */
const zlib = require('zlib')
const fs = require('fs')
const path = require('path')
const { mkdirSync } = fs

const GREEN = [22, 163, 74] // #16a34a

function raster(size, foregroundOnly = false) {
  const buf = Buffer.alloc(size * size * 4)
  const radius = size * 0.22
  const apex = { x: size * 0.5, y: size * 0.76 }
  const lTop = { x: size * 0.26, y: size * 0.26 }
  const rTop = { x: size * 0.74, y: size * 0.26 }
  const stroke = size * 0.065

  const inRounded = (x, y) => {
    const ox = Math.max(radius - x, x - (size - radius), 0)
    const oy = Math.max(radius - y, y - (size - radius), 0)
    return Math.hypot(ox, oy) <= radius
  }
  const segDist = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      if (foregroundOnly) {
        // Fondo de la marca Verificado: el adaptive-icon usa @color como fondo verde;
        // aquí solo pintamos la marca blanca con margen de seguridad (canvas central).
      } else {
        if (!inRounded(x + 0.5, y + 0.5)) continue
        buf[i] = GREEN[0]; buf[i + 1] = GREEN[1]; buf[i + 2] = GREEN[2]; buf[i + 3] = 255
      }
      const dL = segDist(x, y, apex.x, apex.y, lTop.x, lTop.y)
      const dR = segDist(x, y, apex.x, apex.y, rTop.x, rTop.y)
      if (Math.min(dL, dR) <= stroke) { buf[i] = 255; buf[i + 1] = 255; buf[i + 2] = 255 }
    }
  }
  return buf
}

/** Versión para el foreground adaptativo de Android: marca blanca centrada en transparencia. */
function rasterAdaptiveForeground(size) {
  const buf = raster(size, true)
  // Sin más capas: reutilizamos la marca del raster base (centrada).
  return buf
}

function crc32(buf) {
  let c = ~0
  for (let n = 0; n < buf.length; n++) {
    c ^= buf[n]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1))
  }
  return ~c >>> 0
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function makePng(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 6 // 8-bit RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filtro None
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const idat = zlib.deflateSync(raw)
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function makeIco(png256, png32) {
  // Entradas: 256 (PNG) y opcional 32 (PNG). ICO permite PNG incrustado en cualquier tamaño.
  const entries = []
  if (png32) entries.push({ w: 32, h: 32, png: png32 })
  entries.push({ w: 0, h: 0, png: png256 }) // 0 = 256px
  const dir = Buffer.alloc(6 + 16 * entries.length)
  dir.writeUInt16LE(0, 0); dir.writeUInt16LE(1, 2); dir.writeUInt16LE(entries.length, 4)
  let offset = 6 + 16 * entries.length
  entries.forEach((e, i) => {
    const off = 6 + 16 * i
    dir.writeUInt8(e.w, off); dir.writeUInt8(e.h, off + 1)
    dir.writeUInt8(0, off + 2); dir.writeUInt8(0, off + 3)
    dir.writeUInt16LE(1, off + 4); dir.writeUInt16LE(32, off + 6)
    dir.writeUInt32LE(e.png.length, off + 8); dir.writeUInt32LE(offset, off + 12)
    offset += e.png.length
  })
  const blobs = entries.map((e) => e.png)
  return Buffer.concat([dir, ...blobs])
}

const outDir = path.join(__dirname)
const png512 = makePng(512, raster(512))
const png256 = makePng(256, raster(256))
const png32 = makePng(32, raster(32))
fs.writeFileSync(path.join(outDir, 'icon.png'), png512)
fs.writeFileSync(path.join(outDir, 'icon.ico'), makeIco(png256, png32))
fs.writeFileSync(path.join(outDir, 'icon-256.png'), png256)

// Recursos Android (launcher + adaptive foreground).
const densities = [
  ['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192],
]
const fgDensities = [
  ['mdpi', 108], ['hdpi', 162], ['xhdpi', 216], ['xxhdpi', 324], ['xxxhdpi', 432],
]
mkdirSync(path.join(outDir, '..', 'android', 'app', 'src', 'main', 'res'), { recursive: true })
for (const [d, px] of densities) {
  const dir = path.join(outDir, '..', 'android', 'app', 'src', 'main', 'res', 'mipmap-' + d)
  mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'ic_launcher.png'), makePng(px, raster(px)))
  fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), makePng(px, raster(px)))
}
for (const [d, px] of fgDensities) {
  const dir = path.join(outDir, '..', 'android', 'app', 'src', 'main', 'res', 'mipmap-' + d)
  mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), makePng(px, rasterAdaptiveForeground(px)))
}
console.log('✓ Iconos generados: build/icon.png, build/icon.ico + mipmaps de Android')