import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Minus, Plus, ShoppingBag, Tag, Trash2, X } from 'lucide-react'
import { useStore } from '../context/StoreContext'
import { useCatalog } from '../context/CatalogContext'
import { catalogRepository } from '../api/repository'
import type { Product } from '../data/products'
import { ProductImage } from '../components/ui/ProductImage'
import { Price } from '../components/ui/Price'
import { Button } from '../components/ui/Button'
import { formatPrice } from '../lib/currency'
import { useRegion } from '../context/RegionContext'
import { usePersistentState } from '../hooks/usePersistentState'

const FREE_SHIPPING_THRESHOLD = 49990
const SHIPPING_COST = 4990

export function Cart() {
  const { cart, updateQty, removeFromCart, clearCart, cartSubtotal, notify } = useStore()
  const { products, status } = useCatalog()
  const { region } = useRegion()
  const [couponInput, setCouponInput] = useState('')
  const [applying, setApplying] = useState(false)
  const [coupon, setCoupon] = usePersistentState<{ code: string; percent: number } | null>('verta.coupon', null)
  const [couponError, setCouponError] = useState('')
  const navigate = useNavigate()

  const items: { id: string; qty: number; product: Product }[] = cart.flatMap((i) => {
    const product = products.find((p) => p.id === i.id)
    return product ? [{ ...i, product }] : []
  })

  const discount = coupon ? Math.round(cartSubtotal * (coupon.percent / 100)) : 0
  const shipping = cartSubtotal === 0 || cartSubtotal - discount >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST
  const total = Math.max(0, cartSubtotal - discount + shipping)

  const applyCoupon = async (e: FormEvent) => {
    e.preventDefault()
    setApplying(true)
    setCouponError('')
    try {
      const found = await catalogRepository.getCoupon(couponInput)
      if (!found) {
        setCouponError('El cupón no es válido')
        return
      }
      if (found.min && cartSubtotal < found.min) {
        setCouponError(`Este cupón requiere una compra mínima de ${formatPrice(found.min, region)}`)
        return
      }
      setCoupon({ code: found.code, percent: found.percent })
      setCouponInput('')
      notify(`Cupón ${found.code} aplicado: -${found.percent}%`)
    } finally {
      setApplying(false)
    }
  }

  const removeCoupon = () => {
    setCoupon(null)
    notify('Cupón eliminado', 'info')
  }

  if (status === 'loading' && items.length === 0) {
    return <div className="mx-auto max-w-7xl px-4 py-24 text-center text-slate-400">Cargando tu carrito…</div>
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col items-center px-4 py-24 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-50">
          <ShoppingBag className="h-10 w-10 text-brand-600" />
        </div>
        <h1 className="mt-6 text-2xl font-extrabold text-slate-900">Tu carrito está vacío</h1>
        <p className="mt-2 text-slate-500">Explora nuestro catálogo y encuentra algo increíble.</p>
        <Link to="/productos" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-7 py-3.5 font-bold text-white transition-colors hover:bg-brand-700">
          Ir a comprar <ArrowRight className="h-5 w-5" />
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Tu carrito</h1>
      <p className="mt-1 text-slate-500">{items.length} producto{items.length !== 1 && 's'}</p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
        {/* Lista de items */}
        <div className="space-y-4">
          {items.map(({ product, qty }) => (
            <div key={product.id} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-4">
              <Link to={`/producto/${product.slug}`} className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-slate-50">
                <ProductImage src={product.image} fallback={product.category} name={product.name} />
              </Link>
              <div className="flex flex-1 flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link to={`/producto/${product.slug}`} className="font-semibold text-slate-800 hover:text-brand-700">
                      {product.name}
                    </Link>
                    <p className="text-sm text-slate-400">{product.brand}</p>
                  </div>
                  <button onClick={() => removeFromCart(product.id)} aria-label={`Eliminar ${product.name}`} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="flex items-center rounded-xl border border-slate-200">
                    <button onClick={() => updateQty(product.id, qty - 1)} aria-label="Disminuir" className="p-2 text-slate-600 hover:text-brand-700">
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-8 text-center text-sm font-bold">{qty}</span>
                    <button onClick={() => updateQty(product.id, Math.min(product.stock, qty + 1))} aria-label="Aumentar" disabled={qty >= product.stock} className="p-2 text-slate-600 hover:text-brand-700 disabled:opacity-40">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <Price price={product.price * qty} oldPrice={product.oldPrice ? product.oldPrice * qty : undefined} />
                </div>
              </div>
            </div>
          ))}

          <div className="flex flex-wrap gap-3">
            <Link to="/productos" className="text-sm font-semibold text-brand-700 hover:underline">← Seguir comprando</Link>
            <button onClick={clearCart} className="ml-auto text-sm text-slate-400 hover:text-red-500">Vaciar carrito</button>
          </div>
        </div>

        {/* Resumen */}
        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-6 lg:sticky lg:top-24">
          <h2 className="text-lg font-bold text-slate-900">Resumen del pedido</h2>

          {/* Cupón */}
          <form onSubmit={applyCoupon} className="mt-4">
            <label htmlFor="coupon" className="text-sm font-medium text-slate-600">Código promocional</label>
            <div className="mt-1 flex gap-2">
              <div className="relative flex-1">
                <Tag className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="coupon"
                  value={couponInput}
                  onChange={(e) => { setCouponInput(e.target.value); setCouponError('') }}
                  placeholder="VERTA10"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm uppercase outline-none focus:border-brand-400 focus:bg-white"
                />
              </div>
              <button type="submit" disabled={applying} className="rounded-xl bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
                {applying ? 'Validando…' : 'Aplicar'}
              </button>
            </div>
            {couponError && <p className="mt-1.5 text-xs text-red-500">{couponError}</p>}
          </form>

          {coupon && (
            <div className="mt-3 flex items-center justify-between rounded-xl bg-brand-50 px-3 py-2 text-sm">
              <span className="font-semibold text-brand-700">{coupon.code} (-{coupon.percent}%)</span>
              <button onClick={removeCoupon} aria-label="Quitar cupón" className="text-brand-600 hover:text-brand-800"><X className="h-4 w-4" /></button>
            </div>
          )}

          <dl className="mt-6 space-y-3 border-t border-slate-100 pt-5 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd className="font-semibold">{formatPrice(cartSubtotal, region)}</dd></div>
            {discount > 0 && (
              <div className="flex justify-between text-brand-700"><dt>Descuento</dt><dd className="font-semibold">-{formatPrice(discount, region)}</dd></div>
            )}
            <div className="flex justify-between">
              <dt className="text-slate-500">Envío</dt>
              <dd className="font-semibold">{shipping === 0 ? <span className="text-brand-600">Gratis</span> : formatPrice(shipping, region)}</dd>
            </div>
            {shipping > 0 && (
              <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
                Te faltan {formatPrice(FREE_SHIPPING_THRESHOLD - (cartSubtotal - discount), region)} para envío gratis
              </p>
            )}
            <div className="flex justify-between border-t border-slate-100 pt-3 text-lg">
              <dt className="font-bold">Total</dt>
              <dd className="font-extrabold text-slate-900">{formatPrice(total, region)}</dd>
            </div>
          </dl>

          <Button size="lg" className="mt-6 w-full" onClick={() => navigate('/checkout')}>
            Proceder al pago <ArrowRight className="h-5 w-5" />
          </Button>
          <p className="mt-3 text-center text-xs text-slate-400">Compra protegida · Demo sin pagos reales</p>
        </aside>
      </div>
    </div>
  )
}