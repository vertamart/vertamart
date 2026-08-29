import { createContext, useContext } from 'react'
import type { Region } from '../../lib/currency'
import type { AdminCategory, AdminUser, Order, Payment, PayoutAccount, PromoCode, StoredProduct } from '../../api/services/store'

export interface PanelAnalytics {
  revenue: number
  orders: number
  pendingOrders: number
  users: number
  products: number
  lowStock: { id: string; name: string; stock: number }[]
  soldOut: { id: string; name: string; stock: number }[]
  byDay: { day: string; orders: number; revenue: number }[]
  topProducts: { name: string; qty: number; revenue: number }[]
}

export interface AdminCtx {
  region: Region
  t: (key: string) => string
  notify: (msg: string, type?: 'success' | 'info') => void
  refresh: () => void
  load: () => Promise<void>
  loading: boolean
  user: { id: number; name: string; email: string; role: string } | null
  products: StoredProduct[]
  setProducts: (v: StoredProduct[]) => void
  orders: Order[]
  setOrders: (v: Order[]) => void
  payments: Payment[]
  setPayments: (v: Payment[]) => void
  users: AdminUser[]
  setUsers: (v: AdminUser[]) => void
  promos: PromoCode[]
  setPromos: (v: PromoCode[]) => void
  payout: PayoutAccount | null
  setPayout: (v: PayoutAccount | null) => void
  analytics: PanelAnalytics | null
  categories: AdminCategory[]
  setCategories: (v: AdminCategory[]) => void
}

export const AdminContext = createContext<AdminCtx | null>(null)

export function useAdmin() {
  const ctx = useContext(AdminContext)
  if (!ctx) throw new Error('useAdmin debe usarse dentro de AdminPanel')
  return ctx
}
