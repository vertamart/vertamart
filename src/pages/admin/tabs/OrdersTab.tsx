import { useEffect, useMemo, useState } from 'react'
import { Check, Truck } from 'lucide-react'
import { formatPrice } from '../../../lib/currency'
import { storeService, type Order } from '../../../api/services/store'
import { useAdmin } from '../context'
import { BulkBar, BulkButton, EmptyState, FilterChip, Modal, Pagination, SearchInput, Skeleton, StatusBadge, inputCls } from '../ui'

const ORDER_STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled']
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente', paid: 'Pagado', shipped: 'Enviado', delivered: 'Entregado', cancelled: 'Cancelado',
  approved: 'Aprobado', declined: 'Rechazado',
}

interface OrderItemsRes { items: { id: number; product_id: string; name: string; price: number; qty: number }[] }

export function OrdersTab() {
  const { region, orders, setOrders, payments, setPayments, notify, loading } = useAdmin()

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [payFilter, setPayFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [orderItems, setOrderItems] = useState<OrderItemsRes['items']>([])
  const [refundData, setRefundData] = useState<{ order: Order; amount: string; reason: string } | null>(null)
  const [refunding, setRefunding] = useState(false)
  const [bulkStatus, setBulkStatus] = useState(false)
  const [busy, setBusy] = useState(false)

  const pendingOrders = orders.filter((o) => o.paymentStatus === 'pending' || o.status === 'pending')

  useEffect(() => { setPage(1) }, [query, status, payFilter])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return orders.filter((o) => {
      if (status !== 'all' && o.status !== status) return false
      if (payFilter === 'pending' && o.paymentStatus !== 'pending' && o.paymentStatus !== null) return false
      if (payFilter === 'approved' && o.paymentStatus !== 'approved') return false
      if (q && !String(o.id).includes(q) && !o.customerName.toLowerCase().includes(q) && !o.customerEmail.toLowerCase().includes(q)) return false
      return true
    })
  }, [orders, query, status, payFilter])

  const pages = Math.max(1, Math.ceil(filtered.length / 12))
  const visible = filtered.slice((page - 1) * 12, page * 12)

  const toggleOne = (id: number) => {
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openOrder = async (order: Order) => {
    setSelectedOrder(order)
    try { setOrderItems((await storeService.adminOrderItems(order.id)).items) } catch { setOrderItems([]) }
  }

  const approveOrder = async (order: Order) => {
    try {
      await storeService.adminApproveOrder(order.id)
      setOrders(orders.map((o) => (o.id === order.id ? { ...o, status: 'paid', paymentStatus: 'approved' } : o)))
      setPayments(payments.map((p) => (p.orderId === order.id ? { ...p, status: 'approved' } : p)))
      notify(`Pedido #${order.id} aprobado`)
    } catch (err) { notify(err instanceof Error ? err.message : 'No se pudo aprobar', 'info') }
  }

  const updateStatus = async (id: number, s: string) => {
    try {
      await storeService.adminUpdateOrderStatus(id, s)
      setOrders(orders.map((o) => (o.id === id ? { ...o, status: s } : o)))
      notify(`Pedido #${id}: ${STATUS_LABEL[s] ?? s}`)
    } catch (err) { notify(err instanceof Error ? err.message : 'No se pudo actualizar', 'info') }
  }

  const bulkApplyStatus = async (s: string) => {
    setBusy(true)
    try {
      await Promise.all(Array.from(selected).map((id) => storeService.adminUpdateOrderStatus(id, s)))
      setOrders(orders.map((o) => (selected.has(o.id) ? { ...o, status: s } : o)))
      notify(`${selected.size} pedidos → ${STATUS_LABEL[s] ?? s}`, 'info')
    } catch (err) { notify(err instanceof Error ? err.message : 'No se pudo actualizar', 'info') } finally { setBusy(false); setBulkStatus(false) }
  }

  const updateDelivery = async (order: Order, date: string) => {
    if (!date) return
    try {
      await storeService.adminUpdateDelivery(order.id, date)
      setOrders(orders.map((o) => (o.id === order.id ? { ...o, estimatedDelivery: date } : o)))
      setSelectedOrder((cur) => (cur?.id === order.id ? { ...cur, estimatedDelivery: date } : cur))
      notify('Fecha de entrega actualizada')
    } catch (err) { notify(err instanceof Error ? err.message : 'No se pudo actualizar la entrega', 'info') }
  }

  const setTracking = async (order: Order) => {
    const value = window.prompt('Número de seguimiento real (Correos / SEUR / etc.):', order.trackingNumber ?? '')
    if (value === null) return
    if (!value.trim()) { notify('El número de seguimiento no puede estar vacío', 'info'); return }
    try {
      await storeService.setTrackingNumber(order.id, value.trim())
      setOrders(orders.map((o) => (o.id === order.id ? { ...o, trackingNumber: value.trim() } : o)))
      setSelectedOrder((cur) => (cur?.id === order.id ? { ...cur, trackingNumber: value.trim() } : cur))
      notify('Número de seguimiento guardado')
    } catch (err) { notify(err instanceof Error ? err.message : 'No se pudo guardar', 'info') }
  }

  const confirmRefund = async () => {
    if (!refundData) return
    if (refundData.amount && (Number(refundData.amount) < 0 || Number(refundData.amount) > refundData.order.total)) { notify('El importe no es válido', 'info'); return }
    setRefunding(true)
    try {
      const amount = refundData.amount ? Number(refundData.amount) : refundData.order.total
      const res = await storeService.refundOrder(refundData.order.id, amount, refundData.reason.trim())
      setOrders(orders.map((o) => (o.id === refundData.order.id ? { ...o, refundStatus: res.refundStatus, refundAmount: res.refundAmount, refundReason: res.refundReason } : o)))
      setSelectedOrder((cur) => (cur?.id === refundData.order.id ? { ...cur, refundStatus: res.refundStatus, refundAmount: res.refundAmount, refundReason: res.refundReason } : cur))
      setRefundData(null)
      notify(res.refundStatus === 'full' ? 'Reembolso total procesado' : 'Reembolso parcial procesado')
    } catch (err) { notify(err instanceof Error ? err.message : 'No se pudo reembolsar', 'info') } finally { setRefunding(false) }
  }

  return (
    <div className="space-y-4">
      {/* Cola de aprobación */}
      {pendingOrders.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-amber-900">Pedidos por aceptar</h2>
              <p className="text-sm text-amber-700">Al aprobar un pedido, se liberan las descargas digitales y el dinero queda registrado.</p>
            </div>
            <span className="rounded-full bg-amber-200 px-3 py-1 text-sm font-bold text-amber-900">{pendingOrders.length}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {pendingOrders.map((o) => (
              <button key={o.id} onClick={() => void approveOrder(o)} className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-700">
                <Check className="h-4 w-4" /> Aprobar #{o.id} · {formatPrice(o.total, region)}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Herramientas */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar por ID, cliente o correo…" className="w-full sm:w-72" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">
          <option value="all">Cualquier estado</option>
          {ORDER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <div className="flex items-center gap-1.5">
          <FilterChip label="Pago pendiente" active={payFilter === 'pending'} tone="amber" onClick={() => setPayFilter(payFilter === 'pending' ? 'all' : 'pending')} />
          <FilterChip label="Pago aprobado" active={payFilter === 'approved'} tone="green" onClick={() => setPayFilter(payFilter === 'approved' ? 'all' : 'approved')} />
        </div>
      </div>

      <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
        <BulkButton onClick={() => setBulkStatus(true)}>Cambiar estado</BulkButton>
      </BulkBar>

      {busy && <p className="text-xs font-semibold text-brand-600">Procesando…</p>}
      {loading ? <Skeleton rows={6} /> : filtered.length === 0 ? (
        <EmptyState title="Sin pedidos" subtitle="No hay pedidos que coincidan con los filtros." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-400">
                  <th className="w-10 px-4 py-3"><input type="checkbox" className="h-4 w-4 accent-brand-600" disabled aria-label="Seleccionar" /></th>
                  <th className="px-4 py-3">Pedido</th>
                  <th className="px-4 py-3">Comprador</th>
                  <th className="px-4 py-3">Pago</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Entrega</th>
                  <th className="px-4 py-3">Seguimiento</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((o) => (
                  <tr key={o.id} className="border-b border-slate-50 transition-colors last:border-0 hover:bg-brand-50/40">
                    <td className="px-4 py-3"><input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleOne(o.id)} className="h-4 w-4 rounded border-slate-300 accent-brand-600" aria-label={`Seleccionar pedido ${o.id}`} /></td>
                    <td className="px-4 py-3 font-semibold text-slate-800">#{o.id}<p className="text-xs font-normal text-slate-400">{new Date(o.createdAt).toLocaleDateString('es-ES')}</p></td>
                    <td className="px-4 py-3"><p className="font-medium text-slate-800">{o.customerName}</p><p className="text-xs text-slate-400">{o.customerEmail}</p></td>
                    <td className="px-4 py-3 capitalize text-slate-600">{o.paymentMethod ?? '—'}<p className="text-xs text-slate-400">{o.paymentStatus ?? ''}</p></td>
                    <td className="px-4 py-3 font-semibold">{formatPrice(o.total, region)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <select value={o.status} onChange={(e) => void updateStatus(o.id, e.target.value)} className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-xs font-semibold">
                          {ORDER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                        </select>
                        {o.refundStatus !== 'none' && <StatusBadge status={o.refundStatus!} label={`RMB ${o.refundStatus}`} />}
                      </div>
                    </td>
                    <td className="px-4 py-3"><input type="date" value={o.estimatedDelivery ?? ''} onChange={(e) => void updateDelivery(o, e.target.value)} className="h-9 rounded-xl border border-slate-200 px-2 text-xs" /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {o.trackingNumber ? <span className="max-w-[110px] truncate font-mono text-xs text-slate-600" title={o.trackingNumber}>{o.trackingNumber}</span> : <span className="text-xs text-slate-400">—</span>}
                        <button onClick={() => void setTracking(o)} title="Añadir número de seguimiento" className="rounded-lg p-1.5 text-brand-600 hover:bg-brand-50"><Truck className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => { setRefundData({ order: o, amount: '', reason: '' }) }} disabled={o.refundStatus !== 'none'} className="rounded-lg px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-30">Reembolsar</button>
                        <button onClick={() => void openOrder(o)} className="rounded-lg px-3 py-1.5 text-xs font-bold text-brand-700 hover:bg-brand-50">Ver detalles</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 px-4 py-3"><Pagination page={page} pages={pages} total={filtered.length} onChange={setPage} /></div>
        </div>
      )}

      {/* Modal detalles */}
      <Modal open={!!selectedOrder} onClose={() => setSelectedOrder(null)} title={`Detalles del pedido #${selectedOrder?.id ?? ''}`}>
        {selectedOrder && (
          <div className="space-y-4">
            <div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
              <p><strong className="text-slate-700">Nombre:</strong> {selectedOrder.customerName}</p>
              <p><strong className="text-slate-700">Correo:</strong> {selectedOrder.customerEmail}</p>
              <p><strong className="text-slate-700">Método:</strong> {selectedOrder.paymentMethod ?? '—'}</p>
              <p><strong className="text-slate-700">Pago:</strong> {selectedOrder.paymentStatus ?? '—'}</p>
              <p><strong className="text-slate-700">Subtotal:</strong> {formatPrice(selectedOrder.subtotal, region)}</p>
              <p><strong className="text-slate-700">Descuento:</strong> -{formatPrice(selectedOrder.discount, region)}</p>
              <p><strong className="text-slate-700">Total:</strong> <span className="font-extrabold text-brand-700">{formatPrice(selectedOrder.total, region)}</span></p>
              <p><strong className="text-slate-700">Fecha:</strong> {new Date(selectedOrder.createdAt).toLocaleString('es-ES')}</p>
              <p><strong className="text-slate-700">Entrega estimada:</strong> {selectedOrder.estimatedDelivery ?? 'Sin definir'}</p>
              <p><strong className="text-slate-700">Seguimiento:</strong> {selectedOrder.trackingNumber || '—'}</p>
            </div>
            <h3 className="font-bold text-slate-900">Productos digitales</h3>
            <ul className="space-y-2">
              {orderItems.length === 0 && <p className="text-sm text-slate-400">Sin items registrados.</p>}
              {orderItems.map((item) => (
                <li key={item.id} className="flex justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate text-slate-700">{item.name} <span className="text-xs text-slate-400">× {item.qty}</span></span>
                  <strong>{formatPrice(item.price * item.qty, region)}</strong>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Modal>

      {/* Modal reembolso */}
      <Modal open={!!refundData} onClose={() => setRefundData(null)} title={`Reembolsar pedido #${refundData?.order.id ?? ''}`}>
        {refundData && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">Total del pedido: <strong>{formatPrice(refundData.order.total, region)}</strong> · {refundData.order.customerName}</p>
            <label className="block text-sm font-semibold text-slate-700">Importe a devolver <span className="font-normal text-slate-400">(vacío = total)</span>
              <input type="number" min="0" max={refundData.order.total} value={refundData.amount} onChange={(e) => setRefundData({ ...refundData, amount: e.target.value })} className={`${inputCls} mt-1`} />
            </label>
            <label className="block text-sm font-semibold text-slate-700">Motivo
              <textarea rows={2} value={refundData.reason} onChange={(e) => setRefundData({ ...refundData, reason: e.target.value })} placeholder="Defectos, cambio…" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
              <button onClick={() => setRefundData(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={() => void confirmRefund()} disabled={refunding} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">
                {refunding ? 'Procesando…' : 'Confirmar reembolso'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal estado masivo */}
      <Modal open={bulkStatus} onClose={() => setBulkStatus(false)} title={`Cambiar estado (${selected.size} pedidos)`}>
        <div className="space-y-3">
          {ORDER_STATUSES.map((s) => (
            <button key={s} onClick={() => void bulkApplyStatus(s)} className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-brand-300 hover:bg-brand-50">
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  )
}
