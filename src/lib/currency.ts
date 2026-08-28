/**
 * Precios regionales.
 *
 * El precio base de cada producto se guarda en CLP. Según el país/región
 * seleccionado se convierte a la moneda local con una tasa indicativa
 * (`rate` = cuántas unidades de esa moneda vale 1 CLP).
 * Ajusta las tasas aquí según el tipo de cambio vigente.
 */
export interface Region {
  code: string
  name: string
  flag: string
  currency: string
  symbol: string
  locale: string
  /** 1 CLP = rate unidades de esta moneda (indicativo). */
  rate: number
  /** Decimales mostrados por Intl. */
  decimals: number
}

export const REGIONS: Region[] = [
  { code: 'CL', name: 'Chile', flag: '🇨🇱', currency: 'CLP', symbol: '$', locale: 'es-CL', rate: 1, decimals: 0 },
  { code: 'AR', name: 'Argentina', flag: '🇦🇷', currency: 'ARS', symbol: '$', locale: 'es-AR', rate: 1.25, decimals: 0 },
  { code: 'MX', name: 'México', flag: '🇲🇽', currency: 'MXN', symbol: '$', locale: 'es-MX', rate: 0.019, decimals: 2 },
  { code: 'CO', name: 'Colombia', flag: '🇨🇴', currency: 'COP', symbol: '$', locale: 'es-CO', rate: 4.35, decimals: 0 },
  { code: 'PE', name: 'Perú', flag: '🇵🇪', currency: 'PEN', symbol: 'S/', locale: 'es-PE', rate: 0.0041, decimals: 2 },
  { code: 'US', name: 'Estados Unidos', flag: '🇺🇸', currency: 'USD', symbol: 'US$', locale: 'en-US', rate: 0.0011, decimals: 2 },
  { code: 'ES', name: 'España', flag: '🇪🇸', currency: 'EUR', symbol: '€', locale: 'es-ES', rate: 0.00095, decimals: 2 },
]

const REGION_MAP: Record<string, Region> = Object.fromEntries(REGIONS.map((r) => [r.code, r]))

export const DEFAULT_REGION: Region = REGION_MAP.ES

export function getRegion(code?: string | null): Region {
  return (code && REGION_MAP[code.toUpperCase()]) || DEFAULT_REGION
}

/** Convierte un precio base en CLP a la moneda de la región. */
export function convertPrice(clp: number, region: Region = DEFAULT_REGION): number {
  return Math.round(clp * region.rate * 100) / 100
}

/** Formatea un precio (base CLP) en la moneda y formato local de la región. */
export function formatPrice(clp: number, region: Region = DEFAULT_REGION): string {
  return new Intl.NumberFormat(region.locale, {
    style: 'currency',
    currency: region.currency,
    maximumFractionDigits: region.decimals,
    minimumFractionDigits: region.decimals === 0 ? 0 : region.decimals,
  }).format(convertPrice(clp, region))
}
