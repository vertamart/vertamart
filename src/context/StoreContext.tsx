import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePersistentState } from '../hooks/usePersistentState'
import { useCatalog } from './CatalogContext'

export interface CartItem {
  id: string
  qty: number
  /** Si es un bundle (pack de productos), almacena la referencia y el precio del pack. */
  bundle?: {
    slug: string
    name: string
    image: string
    /** Precio del bundle ya calculado (CLP). */
    price: number
    /** Slugs de los productos incluidos (para expandir en el pedido). */
    productSlugs: string[]
  }
}

export interface Toast {
  id: number
  message: string
  type: 'success' | 'info'
}

interface StoreContextValue {
  cart: CartItem[]
  favorites: string[]
  toast: Toast | null
  addToCart: (id: string, qty?: number) => void
  addBundleToCart: (bundle: NonNullable<CartItem['bundle']>) => void
  updateQty: (id: string, qty: number) => void
  removeFromCart: (id: string) => void
  clearCart: () => void
  cartSubtotal: number
  cartCount: number
  toggleFavorite: (id: string) => void
  isFavorite: (id: string) => boolean
  notify: (message: string, type?: Toast['type']) => void
}

const StoreContext = createContext<StoreContextValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = usePersistentState<CartItem[]>('verta.cart', [])
  const [favorites, setFavorites] = usePersistentState<string[]>('verta.favorites', [])
  const [toast, setToast] = useState<Toast | null>(null)
  const toastTimer = useRef<number>(0)
  const { products } = useCatalog()

  const notify = useCallback((message: string, type: Toast['type'] = 'success') => {
    const id = Date.now()
    setToast({ id, message, type })
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }, [])

  const addToCart = useCallback(
    (id: string, qty = 1) => {
      const p = products.find((x) => x.id === id)
      const stock = p?.stock ?? 0
      if (stock <= 0) {
        notify(p ? `${p.name} está agotado` : 'Este producto está agotado', 'info')
        return
      }
      setCart((prev) => {
        const existing = prev.find((i) => i.id === id)
        if (existing) {
          if (existing.qty >= stock) return prev
          const next = Math.min(existing.qty + qty, stock)
          return prev.map((i) => (i.id === id ? { ...i, qty: next } : i))
        }
        return [...prev, { id, qty: Math.min(qty, stock) }]
      })
      const existing = cart.find((i) => i.id === id)
      if (existing && existing.qty >= stock) {
        notify(`Solo hay ${stock} disponible${stock === 1 ? '' : 's'}`, 'info')
      } else {
        notify(p ? `${p.name} añadido al carrito` : 'Producto añadido al carrito')
      }
    },
    [setCart, notify, products, cart],
  )

  /** Añade un pack (bundle) al carrito como un único item con su precio de pack. */
  const addBundleToCart = useCallback(
    (bundle: NonNullable<CartItem['bundle']>) => {
      setCart((prev) => {
        const existing = prev.find((i) => i.id === `bundle:${bundle.slug}`)
        if (existing) return prev.map((i) => (i.id === existing.id ? { ...i, qty: i.qty + 1 } : i))
        return [...prev, { id: `bundle:${bundle.slug}`, qty: 1, bundle }]
      })
      notify(`${bundle.name} añadido al carrito`)
    },
    [setCart, notify],
  )

  const updateQty = useCallback(
    (id: string, qty: number) => {
      setCart((prev) => (qty <= 0 ? prev.filter((i) => i.id !== id) : prev.map((i) => (i.id === id ? { ...i, qty } : i))))
    },
    [setCart],
  )

  const removeFromCart = useCallback((id: string) => setCart((prev) => prev.filter((i) => i.id !== id)), [setCart])

  const clearCart = useCallback(() => setCart([]), [setCart])

  const toggleFavorite = useCallback(
    (id: string) => {
      setFavorites((prev) => {
        const has = prev.includes(id)
        notify(has ? 'Eliminado de tus favoritos' : 'Añadido a tus favoritos', 'info')
        return has ? prev.filter((f) => f !== id) : [...prev, id]
      })
    },
    [setFavorites, notify],
  )

  const isFavorite = useCallback((id: string) => favorites.includes(id), [favorites])

  const cartCount = useMemo(() => cart.reduce((s, i) => s + i.qty, 0), [cart])

  const cartSubtotal = useMemo(
    () => cart.reduce((sum, i) => {
      if (i.bundle) return sum + i.bundle.price * i.qty
      const p = products.find((x) => x.id === i.id)
      return sum + (p ? p.price * i.qty : 0)
    }, 0),
    [cart, products],
  )

  const value = useMemo<StoreContextValue>(
    () => ({
      cart,
      favorites,
      toast,
      addToCart,
      addBundleToCart,
      updateQty,
      removeFromCart,
      clearCart,
      cartSubtotal,
      cartCount,
      toggleFavorite,
      isFavorite,
      notify,
    }),
    [cart, favorites, toast, addToCart, addBundleToCart, updateQty, removeFromCart, clearCart, cartSubtotal, cartCount, toggleFavorite, isFavorite, notify],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore debe usarse dentro de StoreProvider')
  return ctx
}