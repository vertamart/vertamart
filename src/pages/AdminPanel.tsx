import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, Check, CreditCard, LayoutDashboard, MessageSquare, Package, Pencil, Plus, RefreshCw, RotateCcw, Save, Send, ShieldAlert, ShoppingBag, Trash2, Truck, Users, Video, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useRegion } from '../context/RegionContext'
import { useCatalog } from '../context/CatalogContext'
import { formatPrice } from '../lib/currency'
import { storeService, type AdminUser, type ModerationMessage, type ModerationPost, type Order, type Payment, type PayoutAccount, type PromoCode, type StoredProduct } from '../api/services/store'
import { CATEGORIES } from '../data/products'
import { useStore } from '../context/StoreContext'
import { useI18n } from '../context/I18nContext'
import { Button } from '../components/ui/Button'
import { ProductImage } from '../components/ui/ProductImage'
import { ImageUpload } from '../components/ui/ImageUpload'
import { cn } from '../lib/cn'

type Tab = 'resumen' | 'productos' | 'pedidos' | 'pagos' | 'cuentas' | 'moderacion'
const TABS: { id: Tab; label: string; icon: typeof Package }[] = [
  { id: 'resumen', label: 'Resumen', icon: LayoutDashboard },
  { id: 'productos', label: 'Productos', icon: Package },
  { id: 'pedidos', label: 'Pedidos', icon: ShoppingBag },
  { id: 'pagos', label: 'Pagos', icon: CreditCard },
  { id: 'cuentas', label: 'Cuentas', icon: Users },
  { id: 'moderacion', label: 'Moderación', icon: ShieldAlert },
]
const ORDER_STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled']
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente', paid: 'Pagado', shipped: 'Enviado', delivered: 'Entregado', cancelled: 'Cancelado',
  approved: 'Aprobado', declined: 'Rechazado',
}

interface EditState {
  id: string
  name: string
  category: string
  description: string
  price: string
  oldPrice: string
  stock: string
  image: string
  badge: string
}

function Table({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="w-full min-w-[760px] text-left text-sm">{children}</table></div>
}

export function AdminPanel() {
  const { user, status: authStatus } = useAuth()
  const { region } = useRegion()
  const { refresh } = useCatalog()
  const { notify } = useStore()
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>('resumen')
  const [products, setProducts] = useState<StoredProduct[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [promos, setPromos] = useState<PromoCode[]>([])
  const [payout, setPayout] = useState<PayoutAccount | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showProductForm, setShowProductForm] = useState(false)
  const [savingProduct, setSavingProduct] = useState(false)
  const [productImage, setProductImage] = useState('')
  const [edit, setEdit] = useState<EditState | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [orderItems, setOrderItems] = useState<{ id: number; product_id: string; name: string; price: number; qty: number }[]>([])
  const [payoutForm, setPayoutForm] = useState({ provider: 'paypal' as PayoutAccount['provider'], label: '', accountRef: '', paypalEmail: '' })
  const [payoutSaving, setPayoutSaving] = useState(false)
  const [promoForm, setPromoForm] = useState({ code: '', percent: '10', minAmount: '0', expiresAt: '' })
  const [promoSaving, setPromoSaving] = useState(false)
  const [editStock, setEditStock] = useState<{ id: string; value: string } | null>(null)
  const [savingStock, setSavingStock] = useState(false)
  const [moderationPosts, setModerationPosts] = useState<ModerationPost[]>([])
  const [moderationMessages, setModerationMessages] = useState<ModerationMessage[]>([])
  const [moderationLoading, setModerationLoading] = useState(false)
  const [analytics, setAnalytics] = useState<{ revenue: number; orders: number; pendingOrders: number; users: number; products: number; lowStock: { id: string; name: string; stock: number }[]; soldOut: { id: string; name: string; stock: number }[]; byDay: { day: string; orders: number; revenue: number }[]; topProducts: { name: string; qty: number; revenue: number }[] } | null>(null)
  const [refundData, setRefundData] = useState<{ order: Order; show: boolean; amount: string; reason: string } | null>(null)
  const [refunding, setRefunding] = useState(false)
  const [pushForm, setPushForm] = useState({ title: 'Vertamart', message: '', url: '/' })
  const [pushSending, setPushSending] = useState(false)

  const saveStock = async () => {
    if (!editStock) return
    const value = Number(editStock.value)
    if (!Number.isInteger(value) || value < 0) {
      notify('Cantidad no válida', 'info')
      return
    }
    setSavingStock(true)
    try {
      const updated = await storeService.updateProduct(editStock.id, { stock: value })
      setProducts((cur) => cur.map((i) => i.id === updated.id ? updated : i))
      refresh()
      notify(`Stock actualizado a ${value}`)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo actualizar el stock', 'info')
    } finally {
      setSavingStock(false)
      setEditStock(null)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [productsRes, ordersRes, paymentsRes, usersRes, payoutRes, promosRes, analyticsRes] = await Promise.all([
        storeService.adminListProducts(),
        storeService.adminListOrders(),
        storeService.adminListPayments(),
        storeService.adminListUsers(),
        storeService.getPayoutAccount(),
        storeService.adminListPromoCodes(),
        storeService.adminAnalytics().catch(() => null),
      ])
      setProducts(productsRes.items)
      setOrders(ordersRes.items)
      setPayments(paymentsRes.items)
      setUsers(usersRes.items)
      setPayout(payoutRes)
      setPromos(promosRes.items)
      setAnalytics(analyticsRes)
      if (payoutRes) setPayoutForm({ provider: payoutRes.provider, label: payoutRes.label, accountRef: payoutRes.accountRef, paypalEmail: payoutRes.paypalEmail ?? '' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar el panel')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user?.role === 'admin') void load()
  }, [user?.role, load])

  if (authStatus === 'loading') return <div className="mx-auto max-w-6xl px-4 py-24 text-center text-slate-400">Cargando…</div>
  if (!user || user.role !== 'admin') return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50"><ShieldAlert className="h-8 w-8 text-red-500" /></div>
      <h1 className="mt-4 text-2xl font-extrabold text-slate-900">Acceso restringido</h1>
      <p className="mt-2 text-slate-500">Este panel es solo para administradores de la tienda.</p>
      <Link to="/" className="mt-6 rounded-xl bg-brand-600 px-6 py-3 font-bold text-white hover:bg-brand-700">Volver al inicio</Link>
    </div>
  )

  const totalApproved = payments.filter((payment) => payment.status === 'approved').reduce((total, payment) => total + payment.amount, 0)
  const pendingOrders = orders.filter((order) => order.paymentStatus === 'pending' || order.status === 'pending')

  const updateProductStatus = async (product: StoredProduct) => {
    try {
      const status = product.status === 'hidden' ? 'active' : 'hidden'
      await storeService.updateProduct(product.id, { status })
      setProducts((current) => current.map((item) => item.id === product.id ? { ...item, status } : item))
      refresh()
      notify(status === 'hidden' ? 'Producto oculto' : 'Producto activado', 'info')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo actualizar', 'info')
    }
  }

  const deleteProduct = async (product: StoredProduct) => {
    try {
      await storeService.deleteProduct(product.id)
      setProducts((current) => current.filter((item) => item.id !== product.id))
      refresh()
      notify('Producto eliminado', 'info')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo eliminar', 'info')
    }
  }

  const startEdit = (product: StoredProduct) => {
    setEditError('')
    setEdit({
      id: product.id,
      name: product.name,
      category: product.category,
      description: product.description,
      price: String(Math.round(product.price * region.rate)),
      oldPrice: product.oldPrice ? String(Math.round(product.oldPrice * region.rate)) : '',
      stock: String(product.stock),
      image: product.image,
      badge: product.badge ?? '',
    })
  }

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault()
    if (!edit) return
    if (edit.name.trim().length < 3 || edit.description.trim().length < 3 || Number(edit.price) <= 0 || Number(edit.stock) < 0) {
      setEditError('Revisa nombre, descripción, precio y stock')
      return
    }
    setEditSaving(true)
    setEditError('')
    try {
      const updated = await storeService.updateProduct(edit.id, {
        name: edit.name.trim(),
        category: edit.category,
        description: edit.description.trim(),
        price: Math.round(Number(edit.price) / region.rate),
        oldPrice: edit.oldPrice ? Math.round(Number(edit.oldPrice) / region.rate) : undefined,
        stock: Number(edit.stock),
        image: edit.image.trim(),
        badge: edit.badge || undefined,
      })
      setProducts((current) => current.map((item) => item.id === updated.id ? updated : item))
      setEdit(null)
      refresh()
      notify('Publicación actualizada')
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setEditSaving(false)
    }
  }

  const createProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    const price = Number(form.get('price'))
    if (name.length < 3 || !Number.isFinite(price) || price <= 0) {
      notify('Revisa los campos del producto', 'info')
      return
    }
    setSavingProduct(true)
    try {
      const product = await storeService.createProduct({
        name,
        description: String(form.get('description') ?? '').trim(),
        category: String(form.get('category') ?? 'audio'),
        price,
        oldPrice: form.get('oldPrice') ? Number(form.get('oldPrice')) : undefined,
        stock: Number(form.get('stock') ?? 0),
        image: productImage.trim() || String(form.get('image') ?? '').trim(),
        features: String(form.get('features') ?? '').split('\n').map((item) => item.trim()).filter(Boolean),
      })
      setProducts((current) => [product, ...current])
      setShowProductForm(false)
      event.currentTarget.reset()
      refresh()
      notify('Producto creado')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo crear', 'info')
    } finally {
      setSavingProduct(false)
    }
  }

  const openOrder = async (order: Order) => {
    setSelectedOrder(order)
    try {
      setOrderItems((await storeService.adminOrderItems(order.id)).items)
    } catch {
      setOrderItems([])
    }
  }

  const setTracking = async (order: Order) => {
    const trackingNumber = window.prompt('Número de seguimiento real (Correos / SEUR / etc.):', order.trackingNumber ?? '')
    if (trackingNumber === null) return
    if (!trackingNumber.trim()) {
      notify('El número de seguimiento no puede estar vacío', 'info')
      return
    }
    try {
      await storeService.setTrackingNumber(order.id, trackingNumber.trim())
      setOrders((current) => current.map((item) => item.id === order.id ? { ...item, trackingNumber: trackingNumber.trim() } : item))
      setSelectedOrder((current) => current?.id === order.id ? { ...current, trackingNumber: trackingNumber.trim() } : current)
      notify('Número de seguimiento guardado')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo guardar el seguimiento', 'info')
    }
  }

  const confirmRefund = async () => {
    if (!refundData) return
    if (refundData.amount && (Number(refundData.amount) < 0 || Number(refundData.amount) > refundData.order.total)) {
      notify('El importe no es válido', 'info')
      return
    }
    setRefunding(true)
    try {
      const amount = refundData.amount ? Number(refundData.amount) : refundData.order.total
      const res = await storeService.refundOrder(refundData.order.id, amount, refundData.reason.trim())
      setOrders((current) => current.map((item) => item.id === refundData.order.id ? { ...item, refundStatus: res.refundStatus, refundAmount: res.refundAmount, refundReason: res.refundReason } : item))
      setSelectedOrder((current) => current?.id === refundData.order.id ? { ...current, refundStatus: res.refundStatus, refundAmount: res.refundAmount, refundReason: res.refundReason } : current)
      setRefundData(null)
      notify(res.refundStatus === 'full' ? 'Reembolso total procesado' : 'Reembolso parcial procesado')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo reembolsar', 'info')
    } finally {
      setRefunding(false)
    }
  }

  const updateOrderStatus = async (id: number, status: string) => {
    try {
      await storeService.adminUpdateOrderStatus(id, status)
      setOrders((current) => current.map((order) => order.id === id ? { ...order, status } : order))
      notify(`Pedido #${id}: ${STATUS_LABEL[status] ?? status}`)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo actualizar el pedido', 'info')
    }
  }

  const approveOrder = async (order: Order) => {
    try {
      await storeService.adminApproveOrder(order.id)
      setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status: 'paid', paymentStatus: 'approved' } : item))
      setPayments((current) => current.map((payment) => payment.orderId === order.id ? { ...payment, status: 'approved' } : payment))
      notify(`Pedido #${order.id} aprobado`)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo aprobar', 'info')
    }
  }

  const updateDelivery = async (order: Order, date: string) => {
    if (!date) return
    try {
      await storeService.adminUpdateDelivery(order.id, date)
      setOrders((current) => current.map((item) => item.id === order.id ? { ...item, estimatedDelivery: date } : item))
      setSelectedOrder((current) => current?.id === order.id ? { ...current, estimatedDelivery: date } : current)
      notify('Fecha de entrega actualizada')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo actualizar la entrega', 'info')
    }
  }

  const deletePayment = async (id: number) => {
    try {
      await storeService.adminDeletePayment(id)
      setPayments((current) => current.filter((payment) => payment.id !== id))
      notify('Registro de pago eliminado', 'info')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo eliminar', 'info')
    }
  }

  const savePayout = async (event: FormEvent) => {
    event.preventDefault()
    if (payoutForm.label.trim().length < 2 || payoutForm.accountRef.trim().length < 3) {
      notify('La cuenta receptora necesita nombre y datos (cuenta o PayPal)')
      return
    }
    if (payoutForm.provider === 'paypal' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payoutForm.accountRef.trim())) {
      notify('Si el proveedor es PayPal, el campo cuenta debe ser un correo válido', 'info')
      return
    }
    setPayoutSaving(true)
    try {
      await storeService.savePayoutAccount(payoutForm)
      const full = await storeService.getPayoutAccount()
      setPayout(full)
      notify(t('panel.payoutSaved'))
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo guardar', 'info')
    } finally {
      setPayoutSaving(false)
    }
  }

  const confirmTx = async (tx: { id: number }) => {
    if (!payout) return
    try {
      await storeService.confirmPayoutTransaction(tx.id)
      const full = await storeService.getPayoutAccount()
      setPayout(full)
      notify('Dinero acreditado a la cuenta receptora')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo confirmar', 'info')
    }
  }

  const refundTx = async (tx: { id: number }) => {
    if (!payout) return
    try {
      await storeService.refundPayoutTransaction(tx.id)
      const full = await storeService.getPayoutAccount()
      setPayout(full)
      notify('Transacción revertida', 'info')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo revertir', 'info')
    }
  }

  const createPromo = async (event: FormEvent) => {
    event.preventDefault()
    setPromoSaving(true)
    try {
      const promo = await storeService.adminCreatePromoCode({
        code: promoForm.code,
        percent: Number(promoForm.percent),
        minAmount: Number(promoForm.minAmount),
        expiresAt: promoForm.expiresAt || undefined,
      })
      setPromos((current) => [promo, ...current])
      setPromoForm({ code: '', percent: '10', minAmount: '0', expiresAt: '' })
      notify('Código promocional creado')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo crear el código', 'info')
    } finally {
      setPromoSaving(false)
    }
  }

  const deletePromo = async (id: number) => {
    try {
      await storeService.adminDeletePromoCode(id)
      setPromos((current) => current.filter((promo) => promo.id !== id))
      notify('Código promocional eliminado', 'info')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo eliminar', 'info')
    }
  }

  const toggleUserRole = async (account: AdminUser) => {
    const role = account.role === 'admin' ? 'customer' : 'admin'
    try {
      await storeService.adminUpdateUserRole(account.id, role)
      setUsers((current) => current.map((item) => item.id === account.id ? { ...item, role } : item))
      notify('Rol actualizado')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo actualizar', 'info')
    }
  }

  const deleteUser = async (account: AdminUser) => {
    try {
      await storeService.adminDeleteUser(account.id)
      setUsers((current) => current.filter((item) => item.id !== account.id))
      notify('Usuario eliminado', 'info')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo eliminar', 'info')
    }
  }

  const toggleSuspension = async (account: AdminUser) => {
    try {
      const updated = account.isSuspended ? await storeService.adminRestoreUser(account.id) : await storeService.adminSuspendUser(account.id)
      setUsers((current) => current.map((item) => item.id === account.id ? { ...item, isSuspended: updated.isSuspended } : item))
      notify(updated.isSuspended ? 'Cuenta suspendida' : 'Cuenta reactivada', 'info')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo cambiar el estado de la cuenta', 'info')
    }
  }

  const renderProducts = () => (
    <div className="mt-6 space-y-4">
      <div className="flex justify-end"><Button onClick={() => { setShowProductForm((value) => !value); if (showProductForm) setProductImage('') }}><Plus className="h-4 w-4" /> {t('panel.newProduct')}</Button></div>
      {showProductForm && (
        <form onSubmit={createProduct} className="grid gap-4 rounded-2xl border border-brand-200 bg-brand-50/40 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <input name="name" placeholder="Nombre" required className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" />
          <select name="category" className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm">{CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
          <input name="price" type="number" min="1" placeholder="Precio CLP" required className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" />
          <input name="oldPrice" type="number" min="1" placeholder="Precio anterior" className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" />
          <input name="stock" type="number" min="0" defaultValue="10" placeholder="Stock" className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" />
          <ImageUpload value={productImage} onChange={(v) => setProductImage(v)} placeholder="URL o sube una imagen" className="sm:col-span-2" />
          <input name="description" placeholder="Descripción" className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm" />
          <textarea name="features" rows={2} placeholder="Características, una por línea" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
          <div className="flex gap-2 sm:col-span-2 lg:col-span-4"><Button type="submit" loading={savingProduct}>{t('panel.createProduct')}</Button><Button type="button" variant="ghost" onClick={() => setShowProductForm(false)}>Cancelar</Button></div>
        </form>
      )}
      <Table>
        <thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400"><th className="px-4 py-3">Producto</th><th className="px-4 py-3">{t('panel.publishedAt')}</th><th className="px-4 py-3">{t('panel.location')}</th><th className="px-4 py-3">Precio</th><th className="px-4 py-3">{t('panel.seller')}</th><th className="px-4 py-3">{t('panel.status')}</th><th className="px-4 py-3">Stock</th><th className="px-4 py-3 text-right">{t('panel.actions')}</th></tr></thead>
        <tbody>{products.map((product) => <tr key={product.id} className="border-b border-slate-50 last:border-0">
          <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-50"><ProductImage src={product.image} fallback={product.category} name={product.name} /></div><div><p className="font-semibold text-slate-800">{product.name}</p><p className="text-xs text-slate-400">Código: {product.productCode ?? '—'}</p></div></div></td>
          <td className="whitespace-nowrap px-4 py-3 text-slate-500">{new Date(product.createdAt).toLocaleDateString('es-CL')}</td>
          <td className="px-4 py-3">{product.ownerId ? <Link to={`/vendedor/${product.ownerId}`} className="text-brand-700 hover:underline">{product.ownerName ?? '—'}</Link> : 'Tienda'}</td>
          <td className="px-4 py-3 font-semibold">{formatPrice(product.price, region)}</td><td className="px-4 py-3">{product.ownerName ?? 'Vertamart'}</td>
          <td className="px-4 py-3"><span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', product.status === 'hidden' ? 'bg-slate-100 text-slate-500' : 'bg-green-50 text-green-700')}>{product.status === 'hidden' ? 'Oculto' : 'Activo'}</span></td>
          <td className="whitespace-nowrap px-4 py-3">
            {editStock?.id === product.id ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  type="number"
                  min="0"
                  value={editStock.value}
                  onChange={(e) => setEditStock({ id: product.id, value: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') void saveStock(); if (e.key === 'Escape') setEditStock(null) }}
                  onBlur={() => void saveStock()}
                  className="h-9 w-20 rounded-xl border border-brand-400 px-2 text-sm"
                />
                <button onClick={() => void saveStock()} disabled={savingStock} className="rounded-lg bg-brand-600 p-1.5 text-white disabled:opacity-50"><Save className="h-3.5 w-3.5" /></button>
              </div>
            ) : product.stock === 0 ? (
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-600">0 · agotado</span>
                <button onClick={() => setEditStock({ id: product.id, value: '' })} className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-brand-700">
                  <RotateCcw className="h-3.5 w-3.5" /> Reponer
                </button>
              </div>
            ) : (
              <button
                title="Doble clic para editar stock"
                onDoubleClick={() => setEditStock({ id: product.id, value: String(product.stock) })}
                className="inline-flex cursor-default items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-slate-700 hover:bg-brand-50"
              >
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', product.stock <= 5 ? 'bg-orange-50 text-orange-600' : 'bg-green-50 text-green-700')}>{product.stock}</span>
                <span className="text-[10px] text-slate-400">doble clic ✎</span>
              </button>
            )}
          </td>
          <td className="px-4 py-3"><div className="flex justify-end gap-1"><button onClick={() => startEdit(product)} aria-label={`Editar ${product.name}`} className="rounded-lg p-2 text-brand-600 hover:bg-brand-50"><Pencil className="h-4 w-4" /></button><button onClick={() => void updateProductStatus(product)} className="rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50">{product.status === 'hidden' ? t('panel.activate') : t('panel.hide')}</button><button onClick={() => void deleteProduct(product)} aria-label={`Eliminar ${product.name}`} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button></div></td>
        </tr>)}</tbody>
      </Table>
    </div>
  )

  const renderOrders = () => (
    <div className="mt-6 space-y-4">
      {pendingOrders.length > 0 && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-center justify-between"><div><h2 className="font-bold text-amber-900">{t('panel.awaiting')}</h2><p className="text-sm text-amber-700">{pendingOrders.length} pedido(s) pendientes de aceptar.</p></div><span className="rounded-full bg-amber-200 px-3 py-1 text-sm font-bold text-amber-900">{pendingOrders.length}</span></div><div className="mt-3 flex flex-wrap gap-2">{pendingOrders.map((order) => <button key={order.id} onClick={() => void approveOrder(order)} className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-sm font-bold text-white hover:bg-brand-700"><Check className="h-4 w-4" /> {t('panel.approve')} #{order.id}</button>)}</div></section>}
      <Table>
        <thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400"><th className="px-4 py-3">Pedido</th><th className="px-4 py-3">Comprador</th><th className="px-4 py-3">Pago</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Entrega</th><th className="px-4 py-3">Seguimiento</th><th className="px-4 py-3 text-right">Acción</th></tr></thead>
        <tbody>{orders.map((order) => <tr key={order.id} className="border-b border-slate-50 last:border-0"><td className="px-4 py-3 font-semibold">#{order.id}<button onClick={() => void openOrder(order)} className="ml-2 text-xs font-semibold text-brand-700 hover:underline">Ver detalles</button></td><td className="px-4 py-3"><p className="font-medium text-slate-800">{order.customerName}</p><p className="text-xs text-slate-400">{order.customerEmail}</p></td><td className="px-4 py-3 capitalize">{order.paymentMethod ?? '—'}<p className="text-xs text-slate-400">{STATUS_LABEL[order.paymentStatus ?? ''] ?? order.paymentStatus}</p></td><td className="px-4 py-3 font-semibold">{formatPrice(order.total, region)}</td><td className="px-4 py-3"><div className="flex items-center gap-1"><select value={order.status} onChange={(event) => void updateOrderStatus(order.id, event.target.value)} className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-sm">{ORDER_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}</select>{order.refundStatus !== 'none' && <span className={cn('rounded-full px-2 py-1 text-xs font-bold', order.refundStatus === 'full' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-700')}>RMB {order.refundStatus}</span>}</div></td><td className="px-4 py-3"><input type="date" value={order.estimatedDelivery ?? ''} onChange={(event) => void updateDelivery(order, event.target.value)} className="h-9 rounded-xl border border-slate-200 px-2 text-xs" /></td><td className="px-4 py-3"><div className="flex items-center gap-1">{order.trackingNumber ? <span className="max-w-[120px] truncate font-mono text-xs text-slate-600" title={order.trackingNumber}>{order.trackingNumber}</span> : <span className="text-xs text-slate-400">—</span>}<button onClick={() => void setTracking(order)} title="Añadir número de seguimiento" className="rounded-lg p-1.5 text-brand-600 hover:bg-brand-50"><Truck className="h-3.5 w-3.5" /></button></div></td><td className="px-4 py-3"><div className="flex justify-end gap-1"><button onClick={() => { setRefundData({ order, show: true, amount: '', reason: '' }) }} disabled={order.refundStatus !== 'none'} className="rounded-lg text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-30">Reembolsar</button><button onClick={() => void openOrder(order)} className="rounded-lg px-3 py-1.5 text-xs font-bold text-brand-700 hover:bg-brand-50">{t('panel.orderDetails')}</button></div></td></tr>)}</tbody>
      </Table>
    </div>
  )

  const renderPayments = () => (
    <div className="mt-6"><Table><thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400"><th className="px-4 py-3">ID</th><th className="px-4 py-3">Pedido</th><th className="px-4 py-3">Método</th><th className="px-4 py-3">Monto</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Transacción</th><th className="px-4 py-3 text-right">Acción</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id} className="border-b border-slate-50 last:border-0"><td className="px-4 py-3 text-slate-400">{payment.id}</td><td className="px-4 py-3 font-semibold">#{payment.orderId}</td><td className="px-4 py-3 capitalize">{payment.method}</td><td className="px-4 py-3 font-semibold">{formatPrice(payment.amount, region)}</td><td className="px-4 py-3"><span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', payment.status === 'approved' ? 'bg-green-50 text-green-700' : payment.status === 'declined' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600')}>{STATUS_LABEL[payment.status] ?? payment.status}</span></td><td className="px-4 py-3 font-mono text-xs text-slate-500">{payment.transactionId ?? '—'}</td><td className="px-4 py-3 text-right"><button onClick={() => void deletePayment(payment.id)} aria-label="Eliminar registro de pago" className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody></Table></div>
  )

  const sendPush = async (event: FormEvent) => {
    event.preventDefault()
    if (!pushForm.message.trim()) { notify('Escribe el mensaje de la notificación', 'info'); return }
    setPushSending(true)
    try {
      const res = await storeService.adminSendPush(pushForm.message.trim(), { title: pushForm.title.trim() || 'Vertamart', url: pushForm.url.trim() || '/' })
      notify(res.sent > 0 ? `Notificación enviada a ${res.sent} dispositivo(s)` : 'No hay suscripciones push registradas aún', 'info')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo enviar la notificación', 'info')
    } finally {
      setPushSending(false)
    }
  }

  const renderAccounts = () => (
    <div className="mt-6 space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-bold text-slate-900">Enviar notificación push</h2><p className="mt-1 text-sm text-slate-500">Avisa a los clientes con la web instalada (escritorio, móvil o Android).</p><form onSubmit={sendPush} className="mt-4 grid gap-3 sm:grid-cols-4"><input value={pushForm.title} onChange={(e) => setPushForm({ ...pushForm, title: e.target.value })} placeholder="Título" className="h-10 rounded-xl border border-slate-200 px-3 text-sm" /><input value={pushForm.message} onChange={(e) => setPushForm({ ...pushForm, message: e.target.value })} required placeholder="Mensaje" className="h-10 rounded-xl border border-slate-200 px-3 text-sm" /><input value={pushForm.url} onChange={(e) => setPushForm({ ...pushForm, url: e.target.value })} placeholder="Enlace (ej. /ofertas)" className="h-10 rounded-xl border border-slate-200 px-3 text-sm" /><Button type="submit" loading={pushSending}><Send className="h-4 w-4" /> Enviar</Button></form></section>
      <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-bold text-slate-900">{t('panel.payout')}</h2><p className="mt-1 text-sm text-slate-500">{t('panel.payoutSub')}</p><form onSubmit={savePayout} className="mt-4 grid gap-4 sm:grid-cols-3"><select value={payoutForm.provider} onChange={(event) => setPayoutForm({ ...payoutForm, provider: event.target.value as PayoutAccount['provider'] })} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="paypal">PayPal</option><option value="bank">Banco</option><option value="stripe">Stripe</option></select><input value={payoutForm.label} onChange={(event) => setPayoutForm({ ...payoutForm, label: event.target.value })} placeholder="Nombre de la cuenta" className="h-11 rounded-xl border border-slate-200 px-3 text-sm" /><input value={payoutForm.accountRef} onChange={(event) => setPayoutForm({ ...payoutForm, accountRef: event.target.value })} placeholder={t('panel.accountRef')} className="h-11 rounded-xl border border-slate-200 px-3 text-sm" /><input value={payoutForm.paypalEmail} onChange={(event) => setPayoutForm({ ...payoutForm, paypalEmail: event.target.value })} placeholder="Email de PayPal (opcional)" className="h-11 rounded-xl border border-slate-200 px-3 text-sm" /><div className="sm:col-span-3"><Button type="submit" loading={payoutSaving}><Save className="h-4 w-4" /> {t('panel.savePayout')}</Button></div></form><p className="mt-3 text-xs text-slate-400">{t('panel.paypalNote')}</p>{payout && <>
<p className="mt-2 text-sm text-brand-700">Cuenta activa: <strong>{payout.label}</strong> ({payout.provider})</p>
<div className="mt-4 grid gap-3 sm:grid-cols-3">
  <div className="rounded-xl bg-green-50 p-4">
    <p className="text-xs font-semibold uppercase tracking-wide text-green-700">Dinero recibido</p>
    <p className="mt-1 text-2xl font-extrabold text-green-900">${(payout.balance ?? 0).toFixed(2)}</p>
  </div>
  <div className="rounded-xl bg-slate-50 p-4 sm:col-span-2">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cuenta receptora (ingresos de ventas y suscripciones)</p>
    <p className="mt-1 text-sm text-slate-700">{payout.accountRef} · Pagos vía <strong>{payout.provider}</strong></p>
  </div>
</div>
<div className="mt-4">
  <h3 className="font-bold text-slate-900">Transacciones de dinero</h3>
  <div className="mt-2 overflow-x-auto rounded-xl border border-slate-100">
    <table className="w-full min-w-[600px] text-left text-sm">
      <thead><tr className="border-b border-slate-100 text-xs uppercase text-slate-400"><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Pagador</th><th className="px-3 py-2">Monto</th><th className="px-3 py-2">Método</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Ref</th><th className="px-3 py-2">Fecha</th><th className="px-3 py-2 text-right">Acción</th></tr></thead>
      <tbody>
        {(payout.transactions ?? []).length === 0 ? (
          <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400">Sin movimientos todavía.</td></tr>
        ) : payout.transactions?.map((tx) => (
          <tr key={tx.id} className="border-b border-slate-50 last:border-0">
            <td className="px-3 py-2 capitalize">{tx.type}</td>
            <td className="px-3 py-2">{tx.userName}</td>
            <td className="px-3 py-2 font-semibold">${tx.amount.toFixed(2)} {tx.currency}</td>
            <td className="px-3 py-2 capitalize">{tx.method}</td>
            <td className="px-3 py-2"><span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', tx.status === 'received' ? 'bg-green-50 text-green-700' : tx.status === 'refunded' ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-700')}>{tx.status}</span></td>
            <td className="px-3 py-2 font-mono text-xs text-slate-400">{tx.reference ?? '—'}</td>
            <td className="px-3 py-2 text-xs text-slate-400">{new Date(tx.createdAt).toLocaleDateString('es-CL')}</td>
            <td className="px-3 py-2 text-right">
              {tx.status === 'pending' && <button onClick={() => void confirmTx(tx)} className="text-xs font-bold text-brand-700 hover:underline">Confirmar</button>}
              {tx.status === 'received' && <button onClick={() => void refundTx(tx)} className="text-xs font-bold text-red-500 hover:underline">Revertir</button>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
</div>
</>}</section>
      <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-bold text-slate-900">Códigos promocionales</h2><form onSubmit={createPromo} className="mt-4 grid gap-3 sm:grid-cols-4"><input value={promoForm.code} onChange={(event) => setPromoForm({ ...promoForm, code: event.target.value.toUpperCase() })} required placeholder="Código" className="h-10 rounded-xl border border-slate-200 px-3 text-sm" /><input value={promoForm.percent} onChange={(event) => setPromoForm({ ...promoForm, percent: event.target.value })} required type="number" min="1" max="100" placeholder="Descuento %" className="h-10 rounded-xl border border-slate-200 px-3 text-sm" /><input value={promoForm.minAmount} onChange={(event) => setPromoForm({ ...promoForm, minAmount: event.target.value })} type="number" min="0" placeholder="Mínimo" className="h-10 rounded-xl border border-slate-200 px-3 text-sm" /><input value={promoForm.expiresAt} onChange={(event) => setPromoForm({ ...promoForm, expiresAt: event.target.value })} type="date" className="h-10 rounded-xl border border-slate-200 px-3 text-sm" /><Button type="submit" loading={promoSaving}>Crear código</Button></form><div className="mt-4 space-y-2">{promos.map((promo) => <div key={promo.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm"><div><strong className="text-brand-700">{promo.code}</strong><span className="ml-3 text-slate-600">{promo.percent}% · mínimo {formatPrice(promo.minAmount, region)}</span><span className="ml-3 text-slate-400">{promo.expiresAt ? `Caduca ${new Date(`${promo.expiresAt}T12:00:00`).toLocaleDateString('es-CL')}` : 'Sin caducidad'}</span></div><button onClick={() => void deletePromo(promo.id)} aria-label={`Eliminar código ${promo.code}`} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button></div>)}</div></section>
      <Table><thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400"><th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Correo</th><th className="px-4 py-3">Rol</th><th className="px-4 py-3">País</th><th className="px-4 py-3">Fecha de creación</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3 text-right">Acciones</th></tr></thead><tbody>{users.map((account) => { const internal = account.role === 'admin' || account.role === 'support'; return <tr key={account.id} className="border-b border-slate-50 last:border-0"><td className="px-4 py-3 font-semibold text-slate-800">{account.name}</td><td className="px-4 py-3 text-slate-500">{account.email}</td><td className="px-4 py-3">{account.role === 'admin' ? 'Admin' : account.role === 'support' ? 'Soporte' : 'Cliente'}</td><td className="px-4 py-3">{account.country}</td><td className="px-4 py-3 text-slate-500">{new Date(account.createdAt).toLocaleDateString('es-ES')}</td><td className="px-4 py-3"><span className={cn('rounded-full px-2 py-1 text-xs font-bold', account.isSuspended ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700')}>{account.isSuspended ? 'Suspendida' : 'Activa'}</span></td><td className="px-4 py-3 text-right">{account.id !== user.id && !internal && <div className="flex justify-end gap-2"><button onClick={() => void toggleSuspension(account)} className="rounded-lg px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50">{account.isSuspended ? 'Reactivar' : 'Suspender'}</button><button onClick={() => void toggleUserRole(account)} className="rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50">{account.role === 'admin' ? 'Quitar admin' : 'Hacer admin'}</button><button onClick={() => void deleteUser(account)} aria-label={`Eliminar ${account.name}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button></div>}</td></tr>})}</tbody></Table>
    </div>
  )

  const loadModeration = async () => {
    setModerationLoading(true)
    try {
      const [feed, messages] = await Promise.all([storeService.adminListFeedPosts(), storeService.adminListMessages()])
      setModerationPosts(feed.items)
      setModerationMessages(messages.items)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo cargar la moderación', 'info')
    } finally {
      setModerationLoading(false)
    }
  }

  const deleteModerationPost = async (id: number) => {
    try {
      await storeService.adminDeleteFeedPost(id)
      setModerationPosts((current) => current.filter((post) => post.id !== id))
      notify('Publicación del feed eliminada', 'info')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo eliminar la publicación', 'info')
    }
  }

  const deleteModerationMessage = async (id: number) => {
    try {
      await storeService.adminDeleteMessage(id)
      setModerationMessages((current) => current.filter((message) => message.id !== id))
      notify('Mensaje moderado', 'info')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo moderar el mensaje', 'info')
    }
  }

  const renderModeration = () => (
    <div className="mt-6 space-y-6">
      {moderationLoading ? <p className="text-center text-slate-400">Cargando moderación…</p> : <>
        <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5">
          <div className="flex items-center gap-3">
            <Video className="h-5 w-5 text-amber-700" />
            <div><h2 className="font-bold text-amber-900">Publicaciones del feed</h2><p className="text-sm text-amber-700">Elimina contenido que incumpla las normas de la comunidad.</p></div>
          </div>
          <div className="mt-4 space-y-2">
            {moderationPosts.length === 0 ? <p className="rounded-xl bg-white/70 p-4 text-sm text-slate-500">No hay publicaciones de usuarios para revisar.</p> : moderationPosts.map((post) => (
              <div key={post.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-3">
                <div className="min-w-0 flex-1"><p className="truncate font-semibold text-slate-800">{post.title}</p><p className="text-xs text-slate-500">{post.userName} · {post.commentsCount} comentarios · {new Date(post.createdAt).toLocaleString('es-ES')}</p></div>
                <button onClick={() => void deleteModerationPost(post.id)} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Eliminar</button>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-3"><MessageSquare className="h-5 w-5 text-brand-600" /><div><h2 className="font-bold text-slate-900">Mensajes recientes</h2><p className="text-sm text-slate-500">El borrado es lógico y conserva la trazabilidad.</p></div></div>
          <div className="mt-4 space-y-2">
            {moderationMessages.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No hay mensajes para revisar.</p> : moderationMessages.map((message) => (
              <div key={message.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3"><div className="min-w-0 flex-1"><p className="text-xs font-bold text-slate-700">{message.senderName} → {message.receiverName}</p><p className="truncate text-sm text-slate-600">{message.content || 'Imagen adjunta'}</p><p className="text-[11px] text-slate-400">{new Date(message.createdAt).toLocaleString('es-ES')}</p></div><button onClick={() => void deleteModerationMessage(message.id)} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Borrar</button></div>
            ))}
          </div>
        </section>
      </>}
    </div>
  )

  const renderTab = () => {
    if (loading && !error) return <p className="mt-10 text-center text-slate-400">{t('panel.loading')}</p>
    if (tab === 'resumen') {
      const maxRevenue = Math.max(1, ...(analytics?.byDay ?? []).map((d) => d.revenue))
      return (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[
            { label: 'Productos', value: products.length, icon: Package, color: 'text-brand-600 bg-brand-50' },
            { label: 'Pedidos', value: orders.length, icon: ShoppingBag, color: 'text-blue-600 bg-blue-50' },
            { label: 'Pagos aprobados', value: formatPrice(totalApproved, region), icon: CreditCard, color: 'text-green-600 bg-green-50' },
            { label: 'Cuentas', value: users.length, icon: Users, color: 'text-purple-600 bg-purple-50' },
          ].map((stat) => <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className={cn('mb-3 flex h-11 w-11 items-center justify-center rounded-xl', stat.color)}><stat.icon className="h-5 w-5" /></div><p className="text-2xl font-extrabold text-slate-900">{stat.value}</p><p className="text-sm text-slate-500">{stat.label}</p></div>)} </div>
          {analytics && (
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-brand-600" /><h3 className="font-bold text-slate-900">Analíticas de ventas</h3></div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-green-50 p-3"><p className="text-xs text-green-700">Ingresos</p><p className="text-lg font-extrabold text-green-900">{formatPrice(analytics.revenue, region)}</p></div>
                  <div className="rounded-xl bg-blue-50 p-3"><p className="text-xs text-blue-700">Pedidos pagados</p><p className="text-lg font-extrabold text-blue-900">{analytics.orders}</p></div>
                  <div className="rounded-xl bg-amber-50 p-3"><p className="text-xs text-amber-700">Pendientes</p><p className="text-lg font-extrabold text-amber-900">{analytics.pendingOrders}</p></div>
                  <div className="rounded-xl bg-purple-50 p-3"><p className="text-xs text-purple-700">Usuarios</p><p className="text-lg font-extrabold text-purple-900">{analytics.users}</p></div>
                </div>
                {analytics.byDay.length > 0 && (
                  <div className="mt-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ventas (30 días)</p><div className="mt-2 flex h-24 items-end gap-1">{analytics.byDay.map((d) => <div key={d.day} title={`${d.day}: ${formatPrice(d.revenue, region)}`} className="flex-1 rounded-t bg-brand-200" style={{ height: `${Math.max(6, (d.revenue / maxRevenue) * 100)}%` }} />)}</div></div>
                )}
                {analytics.topProducts.length > 0 && (
                  <div className="mt-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Productos más vendidos</p><ul className="mt-2 space-y-1 text-sm">{analytics.topProducts.map((p) => <li key={p.name} className="flex justify-between"><span className="text-slate-700">{p.name} × {p.qty}</span><strong>{formatPrice(p.revenue, region)}</strong></li>)}</ul></div>
                )}
              </section>
              <section className="rounded-2xl border border-orange-200 bg-orange-50/50 p-5">
                <h3 className="font-bold text-orange-900">⚠️ Alerta de stock bajo</h3>
                <p className="mt-1 text-sm text-orange-700">Repon antes de quedarte sin producto.</p>
                <div className="mt-3 space-y-2">{analytics.lowStock.length === 0 ? <p className="text-sm text-slate-500">Todo el stock está bien.</p> : analytics.lowStock.map((p) => <div key={p.id} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm"><span className="font-medium">{p.name}</span><span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', p.stock <= 0 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700')}>{p.stock} uds</span></div>)}</div>
                <div className="mt-4"><p className="text-xs font-semibold uppercase tracking-wide text-red-500">Agotados ({analytics.soldOut.length})</p><ul className="mt-2 space-y-1">{analytics.soldOut.map((p) => <li key={p.id} className="flex justify-between text-sm"><span className="text-slate-700">{p.name}</span><button onClick={() => setEditStock({ id: p.id, value: '' })} className="font-bold text-brand-700 hover:underline">Reponer</button></li>)}</ul></div>
              </section>
              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="font-bold text-slate-900">Últimos pedidos</h3>
                <ul className="mt-3 space-y-2">{orders.slice(0, 6).map((o) => <li key={o.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm"><div className="flex justify-between"><strong>#{o.id} · {o.customerName}</strong><span className="font-bold">{formatPrice(o.total, region)}</span></div><span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', o.status === 'delivered' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700')}>{STATUS_LABEL[o.status] ?? o.status}</span></li>)}</ul>
              </section>
            </div>
          )}
        </>
      )
    }
    if (tab === 'productos') return renderProducts()
    if (tab === 'pedidos') return renderOrders()
    if (tab === 'pagos') return renderPayments()
    if (tab === 'moderacion') return renderModeration()
    return renderAccounts()
  }

  return <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold uppercase tracking-wide text-brand-600">{t('panel.subtitle')}</p><h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{t('panel.title')}</h1></div><Button variant="outline" onClick={() => void load()} loading={loading}><RefreshCw className="h-4 w-4" /> {t('panel.refresh')}</Button></div>
    <div className="mt-6 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">{TABS.map((item) => <button key={item.id} onClick={() => { setTab(item.id); if (item.id === 'moderacion') void loadModeration() }} className={cn('inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold', tab === item.id ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700')}><item.icon className="h-4 w-4" /> {item.label}</button>)}</div>
    <Link to="/soporte" className="mt-4 flex items-center justify-between rounded-2xl border border-brand-200 bg-brand-50/60 p-4 transition-colors hover:border-brand-400 hover:bg-brand-50"><span className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-brand-300"><MessageSquare className="h-5 w-5" /></span><span><strong className="block text-sm text-slate-900">Acceso a soporte</strong><span className="text-xs text-slate-500">Abrir el chat con la cuenta de soporte oficial</span></span></span><span className="text-sm font-bold text-brand-700">Entrar →</span></Link>
    {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
    {renderTab()}
    {edit && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onClick={() => setEdit(null)}><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true"><div className="flex items-center justify-between"><h2 className="text-xl font-extrabold text-slate-900">Editar publicación</h2><button onClick={() => setEdit(null)} aria-label="Cerrar"><X className="h-5 w-5 text-slate-400" /></button></div><form onSubmit={saveEdit} className="mt-5 space-y-4"><div className="grid gap-4 sm:grid-cols-2"><input value={edit.name} onChange={(event) => setEdit({ ...edit, name: event.target.value })} placeholder="Nombre" className="h-11 rounded-xl border border-slate-200 px-3 text-sm" /><select value={edit.category} onChange={(event) => setEdit({ ...edit, category: event.target.value })} className="h-11 rounded-xl border border-slate-200 px-3 text-sm">{CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div><textarea value={edit.description} onChange={(event) => setEdit({ ...edit, description: event.target.value })} rows={4} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /><div className="grid gap-4 sm:grid-cols-3"><input type="number" value={edit.price} onChange={(event) => setEdit({ ...edit, price: event.target.value })} placeholder="Precio" className="h-11 rounded-xl border border-slate-200 px-3 text-sm" /><input type="number" value={edit.oldPrice} onChange={(event) => setEdit({ ...edit, oldPrice: event.target.value })} placeholder="Precio anterior" className="h-11 rounded-xl border border-slate-200 px-3 text-sm" /><input type="number" value={edit.stock} onChange={(event) => setEdit({ ...edit, stock: event.target.value })} placeholder="Stock" className="h-11 rounded-xl border border-slate-200 px-3 text-sm" /></div><div className="grid gap-4 sm:grid-cols-2"><input value={edit.image} onChange={(event) => setEdit({ ...edit, image: event.target.value })} placeholder="URL imagen" className="h-11 rounded-xl border border-slate-200 px-3 text-sm" /><select value={edit.badge} onChange={(event) => setEdit({ ...edit, badge: event.target.value })} className="h-11 rounded-xl border border-slate-200 px-3 text-sm"><option value="">Sin etiqueta</option><option value="nuevo">Nuevo</option><option value="popular">Popular</option><option value="top">Top ventas</option></select></div>{editError && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{editError}</p>}<div className="flex gap-3"><Button type="submit" loading={editSaving}><Save className="h-4 w-4" /> Guardar cambios</Button><Button type="button" variant="outline" onClick={() => setEdit(null)}>Cancelar</Button></div></form></div></div>}
    {selectedOrder && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onClick={() => setSelectedOrder(null)}><div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true"><div className="flex items-center justify-between"><h2 className="text-xl font-extrabold text-slate-900">{t('panel.orderDetails')} #{selectedOrder.id}</h2><button onClick={() => setSelectedOrder(null)} aria-label="Cerrar"><X className="h-5 w-5 text-slate-400" /></button></div><div className="mt-5 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2"><p><strong>Nombre:</strong> {selectedOrder.customerName}</p><p><strong>Correo:</strong> {selectedOrder.customerEmail}</p><p><strong>{t('panel.phone')}:</strong> {selectedOrder.customerPhone || '—'}</p><p><strong>{t('panel.city')}:</strong> {selectedOrder.city || '—'}</p><p className="sm:col-span-2"><strong>{t('panel.address')}:</strong> {selectedOrder.address || '—'}</p><p><strong>{t('panel.region')}:</strong> {selectedOrder.region || '—'}</p><p><strong>{t('panel.postalCode')}:</strong> {selectedOrder.postalCode || '—'}</p><p><strong>Método:</strong> {selectedOrder.paymentMethod || '—'}</p><p><strong>Entrega:</strong> {selectedOrder.estimatedDelivery || 'Sin definir'}</p><p><strong>Seguimiento:</strong> {selectedOrder.trackingNumber ? <span className="font-mono text-slate-800">{selectedOrder.trackingNumber}</span> : '—'} <button onClick={() => void setTracking(selectedOrder)} className="ml-2 text-xs font-bold text-brand-700 hover:underline">{selectedOrder.trackingNumber ? 'Cambiar' : 'Añadir'}</button></p>{selectedOrder.refundStatus !== 'none' && <p className="sm:col-span-2"><strong>Reembolso:</strong> <span className={cn('font-bold', selectedOrder.refundStatus === 'full' ? 'text-red-600' : 'text-orange-600')}>{selectedOrder.refundStatus === 'full' ? 'Total' : 'Parcial'} · {formatPrice(selectedOrder.refundAmount ?? 0, region)}{selectedOrder.refundReason ? ` · ${selectedOrder.refundReason}` : ''}</span></p>}{selectedOrder.pointsEarned ? <p><strong>Puntos:</strong> +{selectedOrder.pointsEarned}</p> : null}</div><h3 className="mt-5 font-bold text-slate-900">Productos</h3><ul className="mt-2 space-y-2">{orderItems.map((item) => <li key={item.id} className="flex justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm"><span>{item.name} × {item.qty}</span><strong>{formatPrice(item.price * item.qty, region)}</strong></li>)}</ul></div></div>}
    {refundData?.show && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onClick={() => setRefundData(null)}><div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true"><h2 className="text-xl font-extrabold text-slate-900">Reembolsar pedido #{refundData.order.id}</h2><p className="mt-1 text-sm text-slate-500">Total del pedido: <strong>{formatPrice(refundData.order.total, region)}</strong> · {refundData.order.customerName}</p><div className="mt-4 space-y-3"><label className="block text-sm font-semibold text-slate-700">Importe a devolver <span className="font-normal text-slate-400">(vacío = reembolso total)</span><input autoFocus type="number" min="0" max={refundData.order.total} value={refundData.amount} onChange={(event) => setRefundData({ ...refundData, amount: event.target.value })} placeholder="Importe en moneda local" className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" /></label><label className="block text-sm font-semibold text-slate-700">Motivo <textarea rows={2} value={refundData.reason} onChange={(event) => setRefundData({ ...refundData, reason: event.target.value })} placeholder="Defectos, cambio…" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label></div><div className="mt-5 flex gap-3"><Button onClick={() => void confirmRefund()} loading={refunding} variant="outline" className="bg-red-600 text-white hover:bg-red-700">Confirmar reembolso</Button><Button type="button" variant="ghost" onClick={() => setRefundData(null)}>Cancelar</Button></div></div></div>}
  </div>
}
