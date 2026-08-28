import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { catalogRepository, dataSource } from '../api/repository'
import { storeService } from '../api/services/store'
import type { Category, Product } from '../data/products'

export type CatalogStatus = 'loading' | 'ready' | 'error'

interface CatalogContextValue {
  products: Product[]
  categories: Category[]
  status: CatalogStatus
  error: string | null
  /** Vuelve a cargar el catálogo desde la fuente activa (mock o API). */
  refresh: () => void
}

const CatalogContext = createContext<CatalogContextValue | null>(null)

/** Seed síncrono: en modo mock los datos están disponibles desde el primer render. */
const initial = catalogRepository.getInitialData?.() ?? { products: [], categories: [] }

/** Respaldo local de las publicaciones de usuarios (sobrevive recargas y caídas de la API). */
const STORE_CACHE_KEY = 'verta.storedProducts'

function readStoreCache(): { items: import('../api/services/store').StoredProduct[] } {
  try {
    const items = JSON.parse(localStorage.getItem(STORE_CACHE_KEY) ?? '[]')
    return Array.isArray(items) ? { items } : { items: [] }
  } catch {
    return { items: [] }
  }
}

function mergeCatalog(base: Product[], stored: Product[]) {
  // Evita duplicados de slug entre el catálogo base y las publicaciones de usuarios
  const knownSlugs = new Set(base.map((p) => p.slug))
  const extra = stored.filter((p) => !knownSlugs.has(p.slug))
  // Enriquece los productos de la tienda con código, vendedor y stock REAL (en vivo),
  // de modo que al agotarse o venderse se vea la cantidad restante y no la estática.
  const withCodes = base.map((p) => {
    const match = stored.find((s) => s.slug === p.slug)
    return match
      ? {
          ...p,
          productCode: match.productCode ?? p.productCode,
          owner: match.owner ?? p.owner,
          stock: typeof match.stock === 'number' ? match.stock : p.stock,
          rating: typeof match.rating === 'number' ? match.rating : p.rating,
          reviews: typeof match.reviews === 'number' ? match.reviews : p.reviews,
          status: match.status ?? p.status,
        }
      : p
  })
  return [...withCodes, ...extra]
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>(initial?.products ?? [])
  const [categories, setCategories] = useState<Category[]>(initial?.categories ?? [])
  const [status, setStatus] = useState<CatalogStatus>(initial ? 'ready' : 'loading')
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [loadedProducts, loadedCategories, stored] = await Promise.all([
          catalogRepository.listProducts(),
          catalogRepository.listCategories(),
          storeService.listProducts(),
        ])
        if (cancelled) return
        // Cache para que las publicaciones sigan visibles aunque la API falle después
        try {
          localStorage.setItem(STORE_CACHE_KEY, JSON.stringify(stored.items))
        } catch {
          /* sin almacenamiento */
        }
        setProducts(mergeCatalog(loadedProducts.length > 0 ? loadedProducts : initial.products, stored.items))
        setCategories(loadedCategories)
        setError(null)
        setStatus('ready')
      } catch (e) {
        if (cancelled) return
        // La API no respondió: mantenemos el catálogo base y las publicaciones del caché
        const cached = readStoreCache()
        try {
          const loadedProducts = await catalogRepository.listProducts()
          if (cancelled) return
          setProducts(mergeCatalog(loadedProducts.length > 0 ? loadedProducts : initial.products, cached.items))
          setError(null)
          setStatus('ready')
          return
        } catch {
          if (cancelled) return
          setProducts((prev) => (prev.length > 0 ? mergeCatalog(prev, cached.items) : mergeCatalog(initial?.products ?? [], cached.items)))
        }
        setError(e instanceof Error ? e.message : 'Error al cargar el catálogo')
        setStatus('ready')
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [nonce])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  const value = useMemo<CatalogContextValue>(
    () => ({ products, categories, status, error, refresh }),
    [products, categories, status, error, refresh],
  )

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
}

export function useCatalog() {
  const ctx = useContext(CatalogContext)
  if (!ctx) throw new Error('useCatalog debe usarse dentro de CatalogProvider')
  return ctx
}

/** Fuente de datos activa (mock o api), para mostrarla en la UI si se desea. */
export { dataSource }
