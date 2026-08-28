import { apiFetch } from '../client'
import type { Category } from '../../data/products'

/** Endpoints de categorías (contrato documentado en docs/API.md). */
export const categoriesService = {
  list() {
    return apiFetch<Category[]>('/categories')
  },
}
