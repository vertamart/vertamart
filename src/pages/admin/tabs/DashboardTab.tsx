import { BarChart3, CreditCard, Package, RefreshCw, ShoppingBag, TrendingUp, Users } from 'lucide-react'
import { formatPrice } from '../../../lib/currency'
import { useAdmin } from '../context'
import { StatCard, StatusBadge, EmptyState } from '../ui'

export function DashboardTab({ onReponer }: { onReponer: (productId: string) => void }) {
  const { region, products, orders, payments, users, analytics } = useAdmin()

  const totalApproved = payments.filter((p) => p.status === 'approved').reduce((s, p) => s + p.amount, 0)
  const pendingOrders = orders.filter((o) => o.paymentStatus === 'pending' || o.status === 'pending')
  const maxRevenue = Math.max(1, ...(analytics?.byDay ?? []).map((d) => d.revenue))

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Ingresos aprobados" value={formatPrice(totalApproved, region)} icon={<CreditCard className="h-5 w-5" />} tone="green" hint={`${payments.filter((p) => p.status === 'approved').length} pagos`} />
        <StatCard label="Pedidos" value={orders.length} icon={<ShoppingBag className="h-5 w-5" />} tone="blue" hint={`${pendingOrders.length} pendientes`} />
        <StatCard label="Productos" value={products.length} icon={<Package className="h-5 w-5" />} tone="brand" hint={`${products.filter((p) => p.status === 'hidden').length} ocultos`} />
        <StatCard label="Clientes" value={users.length} icon={<Users className="h-5 w-5" />} tone="purple" hint={`${users.filter((u) => u.isSuspended).length} suspendidos`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Analíticas */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-brand-600" />
            <h3 className="font-bold text-slate-900">Analíticas de ventas</h3>
          </div>

          {analytics ? (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-green-50 p-3"><p className="text-xs font-semibold text-green-700">Ingresos</p><p className="text-lg font-extrabold text-green-900">{formatPrice(analytics.revenue, region)}</p></div>
                <div className="rounded-xl bg-blue-50 p-3"><p className="text-xs font-semibold text-blue-700">Pedidos pagados</p><p className="text-lg font-extrabold text-blue-900">{analytics.orders}</p></div>
                <div className="rounded-xl bg-amber-50 p-3"><p className="text-xs font-semibold text-amber-700">Pendientes</p><p className="text-lg font-extrabold text-amber-900">{analytics.pendingOrders}</p></div>
                <div className="rounded-xl bg-purple-50 p-3"><p className="text-xs font-semibold text-purple-700">Usuarios</p><p className="text-lg font-extrabold text-purple-900">{analytics.users}</p></div>
              </div>

              {analytics.byDay.length > 0 ? (
                <div className="mt-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ventas (últimos 30 días)</p>
                  <div className="mt-2 flex h-28 items-end gap-1">
                    {analytics.byDay.map((d) => (
                      <div key={d.day} title={`${d.day}: ${formatPrice(d.revenue, region)}`} className="group relative flex-1 rounded-t-md bg-brand-200 transition-colors hover:bg-brand-400" style={{ height: `${Math.max(6, (d.revenue / maxRevenue) * 100)}%` }} />
                    ))}
                  </div>
                </div>
              ) : null}

              {analytics.topProducts.length > 0 && (
                <div className="mt-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Productos más vendidos</p>
                  <ul className="mt-2 space-y-2">
                    {analytics.topProducts.map((p, i) => (
                      <li key={p.name} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{p.name} <span className="text-xs text-slate-400">× {p.qty}</span></span>
                        <strong className="text-sm">{formatPrice(p.revenue, region)}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <EmptyState title="Sin analíticas todavía" subtitle="Los datos de ventas aparecerán cuando haya pedidos." icon={<TrendingUp className="h-7 w-7" />} />
          )}
        </section>

        {/* Alertas de stock */}
        <section className="space-y-6">
          <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-5">
            <h3 className="font-bold text-orange-900">⚠️ Stock bajo</h3>
            <p className="mt-1 text-sm text-orange-700">Repón antes de quedarte sin producto.</p>
            <div className="mt-3 space-y-2">
              {(analytics?.lowStock ?? []).length === 0 ? (
                <p className="text-sm text-orange-600/70">Todo el stock está bien.</p>
              ) : (
                analytics?.lowStock.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm">
                    <span className="truncate font-medium text-slate-700">{p.name}</span>
                    <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${p.stock <= 0 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>{p.stock} uds</span>
                  </div>
                ))
              )}
            </div>
            {(analytics?.soldOut ?? []).length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-red-500">Agotados ({analytics?.soldOut.length})</p>
                <ul className="mt-2 space-y-1">
                  {analytics?.soldOut.map((p) => (
                    <li key={p.id} className="flex justify-between text-sm">
                      <span className="truncate text-slate-700">{p.name}</span>
                      <button onClick={() => onReponer(p.id)} className="ml-2 shrink-0 inline-flex items-center gap-1 font-bold text-brand-700 hover:underline">
                        <RefreshCw className="h-3 w-3" /> Reponer
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Últimos pedidos */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-bold text-slate-900">Últimos pedidos</h3>
            <ul className="mt-3 space-y-2">
              {orders.length === 0 && <p className="text-sm text-slate-400">Sin pedidos todavía.</p>}
              {orders.slice(0, 6).map((o) => (
                <li key={o.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <strong className="truncate text-slate-800">#{o.id} · {o.customerName}</strong>
                    <span className="shrink-0 font-bold">{formatPrice(o.total, region)}</span>
                  </div>
                  <div className="mt-1"><StatusBadge status={o.status} label={o.status} /></div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  )
}
