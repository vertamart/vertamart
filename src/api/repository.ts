import {
  PRODUCTS,
  CATEGORIES,
  getProductBySlug as getMockProductBySlug,
  type Category,
  type Product,
} from '../data/products'
import { getCoupon as getMockCoupon, type Coupon } from '../data/coupons'
import { ApiRequestError } from './client'
import { categoriesService } from './services/categories'
import { couponsService } from './services/coupons'
import { productsService } from './services/products'
import type { DataSource } from './types'

/**
 * Puerto de acceso al catálogo.
 *
 * La aplicación solo depende de esta interfaz. Hoy la implementa un
 * repositorio mock (datos locales) y, cuando se defina `VITE_API_URL`
 * (o `VITE_DATA_SOURCE=api`), se conmuta automáticamente a la
 * implementación que habla con la API real.
 */
export interface CatalogRepository {
  listProducts(): Promise<Product[]>
  listCategories(): Promise<Category[]>
  getProductBySlug(slug: string): Promise<Product | null>
  getCoupon(code: string): Promise<Coupon | null>
  /** Datos disponibles de forma síncrona (seed/caché) para arrancar sin parpadeos en modo demo. */
  getInitialData?(): { products: Product[]; categories: Category[] } | null
}

/** Implementación demo: devuelve los datos locales tal cual. */
class MockCatalogRepository implements CatalogRepository {
  getInitialData() {
    return { products: PRODUCTS, categories: CATEGORIES }
  }

  async listProducts(): Promise<Product[]> {
    return PRODUCTS
  }

  async listCategories(): Promise<Category[]> {
    return CATEGORIES
  }

  async getProductBySlug(slug: string): Promise<Product | null> {
    return getMockProductBySlug(slug) ?? null
  }

  async getCoupon(code: string): Promise<Coupon | null> {
    return getMockCoupon(code)
  }
}

/** Implementación real: consume los endpoints documentados en docs/API.md. */
class ApiCatalogRepository implements CatalogRepository {
  async listProducts(): Promise<Product[]> {
    const page = await productsService.list({ pageSize: 500 })
    return page.items
  }

  async listCategories(): Promise<Category[]> {
    return categoriesService.list()
  }

  async getProductBySlug(slug: string): Promise<Product | null> {
    try {
      return await productsService.bySlug(slug)
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 404) return null
      throw e
    }
  }

  async getCoupon(code: string): Promise<Coupon | null> {
    const res = await couponsService.validate(code)
    if (!res.valid) return null
    return { code: res.code ?? '', percent: res.percent ?? 0, min: res.min }
  }
}

function resolveDataSource(): DataSource {
  const source = import.meta.env.VITE_DATA_SOURCE
  if (source === 'api' || source === 'mock') return source
  return import.meta.env.VITE_API_URL ? 'api' : 'mock'
}

/** Fuente de datos activa, derivada del entorno. */
export const dataSource: DataSource = resolveDataSource()

/** Repositorio activo. Único punto por donde la app obtiene el catálogo. */
export const catalogRepository: CatalogRepository =
  dataSource === 'api' ? new ApiCatalogRepository() : new MockCatalogRepository()
