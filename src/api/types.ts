import type { CategoryId } from '../data/products'

/**
 * Tipos de contrato de la API.
 *
 * Convención de respuestas: el servidor responde siempre
 * `{ "data": <payload>, "meta": { ... } }` y el cliente desenvuelve
 * `data` automáticamente (ver `src/api/client.ts`).
 */

export type DataSource = 'mock' | 'api'

/** Envoltura estándar de una respuesta exitosa. */
export interface ApiResponse<T> {
  data: T
  meta?: Record<string, unknown>
}

/** Respuesta paginada para colecciones. */
export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** Cuerpo de error normalizado que devuelve el cliente ante una falla. */
export interface ApiErrorPayload {
  status: number
  message: string
  code?: string
  details?: unknown
}

export type SortKey = 'price-asc' | 'price-desc' | 'rating' | 'newest'

/** Parámetros de consulta de productos (filtrado/ordenación server-side). */
export interface ProductQuery {
  q?: string
  category?: CategoryId
  maxPrice?: number
  minRating?: number
  inStock?: boolean
  sort?: SortKey
  page?: number
  pageSize?: number
}

/** Respuesta del endpoint de validación de cupones. */
export interface CouponValidationResponse {
  valid: boolean
  code?: string
  percent?: number
  type?: 'percent' | 'fixed'
  value?: number
  min?: number
  reason?: string
}
