import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle2, Clock3, Package, Search, Truck, XCircle } from 'lucide-react'
import { storeService } from '../api/services/store'
import { useRegion } from '../context/RegionContext'
import { formatPrice } from '../lib/currency'
import { cn } from '../lib/cn'

const STEPS = ['pending', 'paid', 'shipped', 'delivered']

export function OrderTracking() {
  const { token } = useParams<{ token: string }>()
  const { region } = useRegion()
  const [order, setOrder] = useState<Awaited<ReturnType<typeof storeService.trackOrder>> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) { setError('INVALID_TRACKING_LINK'); setLoading(false); return }
    let cancelled = false
    const load = () => storeService.trackOrder(token).then((data) => { if (!cancelled) { setOrder(data); setError('') } }).catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Enlace no válido') }).finally(() => { if (!cancelled) setLoading(false) })
    void load()
    const timer = window.setInterval(load, 15000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [token])

  if (loading) return <div className="mx-auto max-w-2xl px-4 py-24 text-center text-slate-400">Cargando seguimiento…</div>
  if (error || !order) return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-24 text-center"><XCircle className="h-14 w-14 text-red-400" /><h1 className="mt-4 text-2xl font-extrabold text-slate-900">Enlace no válido</h1><p className="mt-2 text-slate-500">Este enlace de seguimiento no existe o ha caducado.</p><Link to="/" className="mt-6 rounded-xl bg-brand-600 px-6 py-3 font-bold text-white">Volver a la tienda</Link></div>
  )

  const cancelled = order.status === 'cancelled'
  const current = STEPS.indexOf(order.status)

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <div className="text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50"><Search className="h-8 w-8 text-brand-600" /></div><h1 className="mt-5 text-3xl font-extrabold tracking-tight text-slate-900">Estado del pedido #{order.id}</h1><p className="mt-2 text-slate-500">Hola, {order.customerName}. Este enlace es privado.</p></div>
      <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        {cancelled ? <div className="rounded-2xl bg-red-50 p-5 text-center"><XCircle className="mx-auto h-8 w-8 text-red-500" /><p className="mt-2 font-bold text-red-700">Pedido cancelado</p></div> : <div className="grid grid-cols-4 gap-2">{STEPS.map((step, i) => <div key={step} className="text-center"><div className={cn('mx-auto flex h-10 w-10 items-center justify-center rounded-full', i <= current ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-400')}>{i === 0 ? <Clock3 className="h-5 w-5" /> : i === 1 ? <CheckCircle2 className="h-5 w-5" /> : i === 2 ? <Truck className="h-5 w-5" /> : <Package className="h-5 w-5" />}</div><p className="mt-2 text-xs font-semibold text-slate-600">{step === 'pending' ? 'Recibido' : step === 'paid' ? 'Aprobado' : step === 'shipped' ? 'Enviado' : 'Entregado'}</p></div>)}</div>}
        <div className="mt-8 space-y-3 border-t border-slate-100 pt-5 text-sm"><div className="flex justify-between"><span className="text-slate-500">Estado</span><strong className="capitalize text-brand-700">{order.status}</strong></div><div className="flex justify-between"><span className="text-slate-500">Total</span><strong>{formatPrice(order.total, region)}</strong></div>{order.estimatedDelivery && <div className="flex justify-between"><span className="text-slate-500">Entrega estimada</span><strong>{new Date(`${order.estimatedDelivery}T12:00:00`).toLocaleDateString()}</strong></div>}{order.trackingNumber && <div className="flex justify-between"><span className="text-slate-500">Nº de seguimiento</span><strong className="font-mono text-slate-800">{order.trackingNumber}</strong></div>}{order.refund?.status && order.refund.status !== 'none' && <div className="rounded-xl bg-red-50 p-3"><p className="font-bold text-red-700">{order.refund.status === 'full' ? 'Pedido reembolsado (total)' : 'Reembolso parcial'}</p>{order.refund.reason && <p className="mt-1 text-xs text-red-600">{order.refund.reason}</p>}</div>}</div>
      </div>
      <p className="mt-5 text-center text-xs text-slate-400">El estado se actualiza automáticamente cada 15 segundos.</p>
    </div>
  )
}
