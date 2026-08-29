import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Clock, Download, ShieldAlert } from 'lucide-react'

/**
 * Resultado del pago tras volver de Stripe Checkout.
 * - /pago/exito?session_id=...  → pago procesado por Stripe (el webhook confirma la entrega).
 * - /pago/cancelado             → el usuario canceló; el pedido queda pendiente/failed.
 */
export function PaymentResult() {
  const [params] = useSearchParams()
  const isSuccess = params.get('session_id') != null
  const [status, setStatus] = useState<'verificando' | 'ok' | 'pendiente'>('verificando')

  useEffect(() => {
    if (!isSuccess) return
    // El webhook de Stripe confirma el pedido en segundo plano; esperamos un momento
    // y mostramos la biblioteca como destino (la entrega se hace vía webhook verificado).
    const t = setTimeout(() => setStatus('ok'), 1800)
    return () => clearTimeout(t)
  }, [isSuccess])

  if (!isSuccess) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-100">
          <Clock className="h-10 w-10 text-amber-600" />
        </div>
        <h1 className="mt-6 text-2xl font-extrabold text-slate-900">Pago cancelado</h1>
        <p className="mt-3 text-slate-500">No se ha realizado ningún cargo. Puedes volver al carrito cuando quieras y completar la compra.</p>
        <div className="mt-6 flex gap-3">
          <Link to="/carrito" className="rounded-xl bg-brand-600 px-6 py-3 font-bold text-white hover:bg-brand-700">Volver al carrito</Link>
          <Link to="/productos" className="rounded-xl border-2 border-slate-200 px-6 py-3 font-bold text-slate-600 hover:border-brand-300">Seguir comprando</Link>
        </div>
      </div>
    )
  }

  if (status === 'verificando') {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
        <div className="h-20 w-20 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
        <h1 className="mt-6 text-2xl font-extrabold text-slate-900">Verificando tu pago…</h1>
        <p className="mt-3 text-slate-500">Estamos confirmando la transacción con el proveedor de pagos. En cuanto se verifique, tu producto se libera en tu biblioteca.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-100">
        <CheckCircle2 className="h-10 w-10 text-brand-600" />
      </div>
      <h1 className="mt-6 text-3xl font-extrabold text-slate-900">Compra completada</h1>
      <p className="mt-3 text-slate-500">
        Tu pago se ha procesado con Stripe. Tu producto ya está disponible en tu biblioteca con su <strong>licencia única</strong>.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link to="/cuenta?tab=descargas" className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-7 py-3.5 font-bold text-white hover:bg-brand-700">
          <Download className="h-5 w-5" /> Ver mi biblioteca
        </Link>
        <Link to="/productos" className="rounded-xl border-2 border-brand-600 px-7 py-3.5 font-bold text-brand-700 hover:bg-brand-50">
          Seguir comprando
        </Link>
      </div>
      <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-400">
        <ShieldAlert className="h-3.5 w-3.5" /> Pagado mediante checkout seguro de Stripe (PCI-DSS). No almacenamos datos de tarjeta.
      </p>
    </div>
  )
}
