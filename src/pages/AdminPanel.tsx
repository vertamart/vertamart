import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CreditCard, FileArchive, FolderTree, LayoutDashboard, Menu, Package, RefreshCw,
  Settings, ShieldAlert, ShoppingBag, Tag, Users, X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useRegion } from '../context/RegionContext'
import { useCatalog } from '../context/CatalogContext'
import { storeService, type AdminCategory, type AdminUser, type Order, type Payment, type PayoutAccount, type PromoCode, type StoredProduct } from '../api/services/store'
import { useStore } from '../context/StoreContext'
import { useI18n } from '../context/I18nContext'
import { cn } from '../lib/cn'
import { AdminContext, type PanelAnalytics } from './admin/context'
import { DashboardTab } from './admin/tabs/DashboardTab'
import { ProductsTab } from './admin/tabs/ProductsTab'
import { OrdersTab } from './admin/tabs/OrdersTab'
import { PaymentsTab } from './admin/tabs/PaymentsTab'
import { AccountsTab } from './admin/tabs/AccountsTab'
import { CategoriesTab } from './admin/tabs/CategoriesTab'
import { CouponsTab } from './admin/tabs/CouponsTab'
import { FilesTab } from './admin/tabs/FilesTab'
import { ModerationTab } from './admin/tabs/ModerationTab'
import { SettingsTab } from './admin/tabs/SettingsTab'

type TabId = 'resumen' | 'productos' | 'pedidos' | 'pagos' | 'clientes' | 'categorias' | 'cupones' | 'archivos' | 'moderacion' | 'ajustes'

const TABS: { id: TabId; label: string; icon: typeof Package }[] = [
  { id: 'resumen', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'productos', label: 'Productos', icon: Package },
  { id: 'pedidos', label: 'Pedidos', icon: ShoppingBag },
  { id: 'pagos', label: 'Pagos', icon: CreditCard },
  { id: 'clientes', label: 'Clientes', icon: Users },
  { id: 'categorias', label: 'Categorías', icon: FolderTree },
  { id: 'cupones', label: 'Cupones', icon: Tag },
  { id: 'archivos', label: 'Archivos', icon: FileArchive },
  { id: 'moderacion', label: 'Moderación', icon: ShieldAlert },
  { id: 'ajustes', label: 'Ajustes', icon: Settings },
]

export function AdminPanel() {
  const { user, status: authStatus } = useAuth()
  const { region } = useRegion()
  const { refresh } = useCatalog()
  const { notify } = useStore()
  const { t } = useI18n()

  const [tab, setTab] = useState<TabId>('resumen')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [stockTarget, setStockTarget] = useState<{ id: string; ts: number } | null>(null)

  const [products, setProducts] = useState<StoredProduct[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [promos, setPromos] = useState<PromoCode[]>([])
  const [payout, setPayout] = useState<PayoutAccount | null>(null)
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [analytics, setAnalytics] = useState<PanelAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [productsRes, ordersRes, paymentsRes, usersRes, payoutRes, promosRes, analyticsRes, categoriesRes] = await Promise.all([
        storeService.adminListProducts(),
        storeService.adminListOrders(),
        storeService.adminListPayments(),
        storeService.adminListUsers(),
        storeService.getPayoutAccount(),
        storeService.adminListPromoCodes(),
        storeService.adminAnalytics().catch(() => null),
        storeService.adminListCategories().catch(() => ({ items: [] as AdminCategory[], total: 0 })),
      ])
      setProducts(productsRes.items)
      setOrders(ordersRes.items)
      setPayments(paymentsRes.items)
      setUsers(usersRes.items)
      setPayout(payoutRes)
      setPromos(promosRes.items)
      setAnalytics(analyticsRes)
      setCategories(categoriesRes.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar el panel')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user?.role === 'admin') void load()
  }, [user?.role, load])

  const ctx = useMemo(() => ({
    region, t, notify, refresh, load, loading, user,
    products, setProducts, orders, setOrders, payments, setPayments,
    users, setUsers, promos, setPromos, payout, setPayout, analytics, categories, setCategories,
  }), [region, t, notify, refresh, load, loading, user, products, orders, payments, users, promos, payout, analytics, categories])

  if (authStatus === 'loading') {
    return <div className="mx-auto max-w-6xl px-4 py-24 text-center text-slate-400">Cargando…</div>
  }
  if (!user || user.role !== 'admin') {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50"><ShieldAlert className="h-8 w-8 text-red-500" /></div>
        <h1 className="mt-4 text-2xl font-extrabold text-slate-900">{t('panel.restricted')}</h1>
        <p className="mt-2 text-slate-500">{t('panel.restrictedSub')}</p>
        <Link to="/" className="mt-6 rounded-xl bg-brand-600 px-6 py-3 font-bold text-white hover:bg-brand-700">{t('panel.backHome')}</Link>
      </div>
    )
  }

  const goTo = (id: TabId) => {
    setTab(id)
    setSidebarOpen(false)
  }

  const renderTab = () => {
    switch (tab) {
      case 'resumen': return <DashboardTab onReponer={(id) => { setStockTarget({ id, ts: Date.now() }); setTab('productos') }} />
      case 'productos': return <ProductsTab stockTarget={stockTarget} onStockTargetHandled={() => setStockTarget(null)} />
      case 'pedidos': return <OrdersTab />
      case 'pagos': return <PaymentsTab />
      case 'clientes': return <AccountsTab />
      case 'categorias': return <CategoriesTab />
      case 'cupones': return <CouponsTab />
      case 'archivos': return <FilesTab />
      case 'moderacion': return <ModerationTab />
      case 'ajustes': return <SettingsTab />
    }
  }

  const current = TABS.find((x) => x.id === tab)

  return (
    <AdminContext.Provider value={ctx}>
      <div className="min-h-[calc(100vh-4rem)] bg-slate-50/70">
        <div className="mx-auto flex max-w-[1600px]">
          {/* Sidebar escritorio */}
          <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-5 lg:flex">
            <div className="px-2 text-xs font-bold uppercase tracking-widest text-slate-400">Menú</div>
            <nav className="mt-3 flex-1 space-y-0.5 overflow-y-auto">
              {TABS.map((item) => {
                const active = tab === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => goTo(item.id)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
                      active ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-brand-50 hover:text-brand-700',
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </button>
                )
              })}
            </nav>
            <Link to="/" className="mt-4 rounded-xl border border-slate-200 px-3 py-2.5 text-center text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-50">
              ← Volver a la tienda
            </Link>
          </aside>

          {/* Contenido */}
          <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
            {/* Barra superior */}
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={() => setSidebarOpen(true)} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 lg:hidden" aria-label="Abrir menú">
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{t('panel.subtitle')}</p>
                <h1 className="mt-0.5 flex items-center gap-2 text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
                  {current && <current.icon className="h-5 w-5 text-brand-600" />}
                  {current?.label}
                </h1>
              </div>
              <button onClick={() => void load()} disabled={loading} className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50">
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> {t('panel.refresh')}
              </button>
            </div>

            {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

            <div className="mt-6">{renderTab()}</div>
          </main>
        </div>

        {/* Drawer móvil */}
        {sidebarOpen && (
          <div className="fixed inset-0 top-16 z-40 bg-slate-950/50 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)}>
            <div className="h-full w-72 max-w-[85vw] overflow-y-auto bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-1">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Menú</p>
                <button onClick={() => setSidebarOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Cerrar"><X className="h-5 w-5" /></button>
              </div>
              <nav className="mt-3 space-y-0.5">
                {TABS.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => goTo(item.id)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-xl px-3 py-3 text-sm font-semibold transition-colors',
                      tab === item.id ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-brand-50 hover:text-brand-700',
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </button>
                ))}
              </nav>
              <Link to="/" className="mt-4 flex items-center justify-center rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-500 hover:bg-slate-50">← Volver a la tienda</Link>
            </div>
          </div>
        )}
      </div>
    </AdminContext.Provider>
  )
}
