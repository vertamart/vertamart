import { apiFetch } from '../client'
import type { Paginated, ProductQuery } from '../types'
import type { Product } from '../../data/products'

/** Endpoints de productos (contrato documentado en docs/API.md). */
export const productsService = {
  /** Lista paginada con filtros y ordenación (server-side). */
  list(query: ProductQuery = {}) {
    return apiFetch<Paginated<Product>>('/products', {
      query: {
        q: query.q,
        category: query.category,
        maxPrice: query.maxPrice,
        minRating: query.minRating,
        inStock: query.inStock,
        sort: query.sort,
        page: query.page,
        pageSize: query.pageSize,
      },
    })
  },

  /** Producto por slug. Lanza ApiRequestError 404 si no existe. */
  bySlug(slug: string) {
    return apiFetch<Product>(`/products/${encodeURIComponent(slug)}`)
  },
}
