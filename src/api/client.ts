import type { ApiErrorPayload, ApiResponse } from './types'

const RAW_API_URL = (import.meta.env.VITE_API_URL ?? (window.location.protocol === 'file:' ? 'http://127.0.0.1:4000/api' : '/api')).replace(/\/+$/, '')
/** Garantiza que la base termine en /api aunque VITE_API_URL se configure sin el sufijo. */
const BASE_URL = RAW_API_URL.endsWith('/api') ? RAW_API_URL : `${RAW_API_URL}/api`
/** Origen de la API, para construir enlaces externos (OAuth de Google/Apple). */
export const API_BASE_URL = BASE_URL
const TOKEN = import.meta.env.VITE_API_TOKEN
const TIMEOUT_MS = 10_000

/** Error normalizado lanzado por el cliente ante cualquier falla de red o de la API. */
export class ApiRequestError extends Error {
  status: number
  code?: string
  details?: unknown

  constructor(payload: ApiErrorPayload) {
    super(payload.message)
    this.name = 'ApiRequestError'
    this.status = payload.status
    this.code = payload.code
    this.details = payload.details
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
  signal?: AbortSignal
}

/**
 * Realiza una petición a la API y devuelve el payload ya desenvuelto de `{ data }`.
 * Lanza `ApiRequestError` ante errores de red, timeout o respuestas no-2xx.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, headers: extraHeaders, signal } = options

  const url = new URL(BASE_URL + path, window.location.origin)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value))
    }
  }

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort)

  try {
    const res = await fetch(url.toString(), {
      method,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
        ...extraHeaders,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })

    const payload = (await res.json().catch(() => null)) as ApiResponse<T> | ApiErrorPayload | null

    if (!res.ok) {
      const err: ApiErrorPayload = payload && 'message' in payload ? payload : { status: res.status, message: `Error ${res.status}` }
      throw new ApiRequestError(err)
    }

    return (payload as ApiResponse<T>).data
  } catch (e) {
    if (e instanceof ApiRequestError) throw e
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new ApiRequestError({ status: 0, message: 'La solicitud tardó demasiado o fue cancelada', code: 'TIMEOUT' })
    }
    throw new ApiRequestError({ status: 0, message: 'No se pudo conectar con el servidor', code: 'NETWORK' })
  } finally {
    window.clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}
