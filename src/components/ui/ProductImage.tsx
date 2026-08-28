import { useState } from 'react'
import { cn } from '../../lib/cn'

const icons: Record<string, string> = {
  audio: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm-3-8h6m-3-4v5M9 13a3 3 0 0 0 6 0',
  wearables: 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm0 6h10M12 17h.01',
  teclado: 'M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8zm5 2v.01M12 10v.01M16 10v.01M8 14h8',
  mouse: 'M9 4h6a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3zm3 0v5M12 12v5',
  carga: 'M12 3v6m0 0l-2-2m2 2l2-2M5 12a7 7 0 1 1 14 0v2h-14v-2zm-2 6h18-2V18a1 1 0 0 1 1-1',
  monitor: 'M4 5h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm6 12h4v3h-4zM6 10v4',
  cage: 'M8 9V6a4 4 0 0 1 8 0v3',
}

const PALETTE: Record<string, { from: string; to: string }> = {
  audio: { from: '#14532d', to: '#22c55e' },
  wearables: { from: '#052e16', to: '#16a34a' },
  teclado: { from: '#166534', to: '#4ade80' },
  mouse: { from: '#14532d', to: '#34d399' },
  carga: { from: '#14532d', to: '#86efac' },
  monitor: { from: '#052e16', to: '#22c55e' },
}

interface ProductImageProps {
  /** URL real de la imagen del producto. */
  src?: string
  /** Clave de categoría usada para el placeholder SVG si no hay imagen o falla la carga. */
  fallback?: string
  name?: string
  className?: string
  /** Carga inmediata (imagen principal de detalle) en vez de lazy. */
  eager?: boolean
}

export function ProductImage({ src, fallback, name, className, eager }: ProductImageProps) {
  const [failed, setFailed] = useState(false)
  const kind = fallback ?? 'default'

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name ?? 'Imagen del producto'}
        loading={eager ? 'eager' : 'lazy'}
        onError={() => setFailed(true)}
        className={cn('h-full w-full object-cover', className)}
      />
    )
  }

  const p = PALETTE[kind] ?? PALETTE.audio
  return (
    <svg
      viewBox="0 0 200 200"
      role="img"
      aria-label={`Imagen ilustrativa de ${name ?? 'producto'}`}
      className={cn('h-full w-full', className)}
    >
      <defs>
        <linearGradient id={`g-${kind}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={p.from} />
          <stop offset="100%" stopColor={p.to} />
        </linearGradient>
      </defs>
      <rect width="200" height="200" rx="28" fill={`url(#g-${kind})`} />
      <circle cx="100" cy="100" r="56" fill="rgba(255,255,255,0.08)" />
      <circle cx="100" cy="100" r="38" fill="rgba(255,255,255,0.10)" />
      <g
        stroke="rgba(255,255,255,0.92)"
        strokeWidth="7"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(28 28) scale(2.2)"
      >
        <path d={icons[kind] ?? icons.cage} />
      </g>
      {name && (
        <text
          x="100"
          y="182"
          textAnchor="middle"
          fontSize="13"
          fill="rgba(255,255,255,0.85)"
          fontFamily="Inter, sans-serif"
        >
          Verta
        </text>
      )}
    </svg>
  )
}
