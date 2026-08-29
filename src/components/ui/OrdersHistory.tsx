import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Package, Receipt } from 'lucide-react'
import { storeService } from '../../api/services/store'
import { formatPrice } from '../../lib/currency'
import { useRegion } from '../../context/RegionContext'

interface OrderItem {
  productId: string
  name: string
  price: number
  qty: number
  licenseKey: string | null
}
interface Order {
  id: number
  total: number
  discount: number
  status: string
  paymentMethod: string
  createdAt: string
  pointsEarned: number
  items: OrderItem[]
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pendiente de pago', cls: 'bg-amber-50 text-amber-700' },
  paid: { label: 'Pagado', cls: 'bg-green-50 text-green-700' },
  delivered: { label: 'Entregado', cls: 'bg-green-50 text-green-700' },
  failed: { label: 'Fallido', cls: 'bg-red-50 text-red-600' },
  cancelled: { label: 'Cancelado', cls: 'bg-slate-100 text-slate-500' },
  refunded: { label: 'Reembolsado', cls: 'bg-slate-100 text-slate-500' },
  shipped: { label: 'Procesando', cls: 'bg-blue-50 text-blue-700' },
}

function methodLabel(m: string): string {
  if (m === 'stripe') return 'Tarjeta/Apple Pay (Stripe)'
  if (m === 'card') return 'Tarjeta (demo)'
  if (m === 'transfer') return 'Transferencia'
  return m
}

export function OrdersHistory() {
  const { region } = useRegion()
  const [orders, setOrders] = useState<Order[] | null>(null)

  useEffect(() => {
    storeService.myOrders().then((r) => setOrders(r.items)).catch(() => setOrders([]))
  }, [])

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Receipt className="h-5 w-5 text-brand-600" /> Historial de compras</h2>
      <p className="mt-1 text-sm text-slate-500">Tus pedidos, su estado y el acceso a tus productos.</p>

      {orders === null ? (
        <p className="mt-4 text-sm text-slate-400">Cargando…</p>
      ) : orders.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
          Todavía no has realizado compras. <Link to="/productos" className="font-bold text-brand-700 hover:underline">Explora el catálogo</Link>.
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {orders.map((o) => {
            const st = STATUS_LABEL[o.status] ?? { label: o.status, cls: 'bg-slate-100 text-slate-500' }
            return (
              <li key={o.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-slate-800">Pedido #{o.id}</p>
                    <p className="text-xs text-slate-400">{new Date(o.createdAt.replace(' ', 'T') + 'Z').toLocaleDateString('es-ES')} · {methodLabel(o.paymentMethod)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.label}</span>
                    <span className="font-extrabold text-slate-900">{formatPrice(o.total, region)}</span>
                  </div>
                </div>
                <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                  {o.items.map((it) => (
                    <li key={it.productId} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2 text-slate-600">
                        <Package className="h-4 w-4 shrink-0 text-brand-600" />
                        <span className="truncate">{it.name} × {it.qty}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {it.licenseKey && <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">{it.licenseKey}</code>}
                        <Link to={`/producto/${it.productId}`} className="text-xs font-semibold text-brand-700 hover:underline">Ver</Link>
                      </span>
                    </li>
                  ))}
                </ul>
                {(o.status === 'paid' || o.status === 'delivered') && (
                  <div className="mt-3 border-t border-slate-100 pt-3 text-right">
                    <Link to="/cuenta?tab=descargas" className="text-xs font-bold text-brand-700 hover:underline">Descargar mis productos →</Link>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
