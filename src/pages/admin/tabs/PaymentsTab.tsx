import { useEffect, useMemo, useState } from 'react'
import { ArrowDownToLine, FlaskConical, Landmark, RefreshCw, Trash2, Wallet } from 'lucide-react'
import { formatPrice } from '../../../lib/currency'
import { storeService } from '../../../api/services/store'
import { useAdmin } from '../context'
import { ConfirmModal, EmptyState, FilterChip, Pagination, SearchInput, Skeleton, StatusBadge } from '../ui'

interface StripeFinance {
  mode: string
  currency: string
  available: { amount: number; currency: string }[]
  pending: { amount: number; currency: string }[]
  payouts: { id: string; amount: number; status: string; arrivalDate: number; currency: string }[]
  charges: { id: string; amount: number; status: string; paid: boolean; refunded: boolean; currency: string; created: number; email: string | null }[]
}

const eur = (n: number) => `${(n / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}`

export function PaymentsTab() {
  const { region, payments, setPayments, notify, loading } = useAdmin()
  const [finance, setFinance] = useState<StripeFinance | null>(null)
  const [financeLoading, setFinanceLoading] = useState(false)
  const [financeError, setFinanceError] = useState('')
  const [refunding, setRefunding] = useState<string | null>(null)

  const loadFinance = () => {
    setFinanceLoading(true)
    setFinanceError('')
    storeService.adminStripeFinance()
      .then(setFinance)
      .catch(() => setFinanceError('No se pudo consultar Stripe (¿claves configuradas?)'))
      .finally(() => setFinanceLoading(false))
  }
  useEffect(() => { void loadFinance() }, [])

  const refundCharge = async (chargeId: string) => {
    if (!window.confirm('¿Reembolsar este cobro completo vía Stripe? Se revoca el acceso del cliente al producto.')) return
    setRefunding(chargeId)
    try {
      const r = await storeService.adminStripeRefund(chargeId)
      notify(`Reembolso ${r.status} de ${eur(r.amount)} iniciado`)
      void loadFinance()
    } catch (err) { notify(err instanceof Error ? err.message : 'No se pudo reembolsar', 'info') } finally { setRefunding(null) }
  }
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [confirmDel, setConfirmDel] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return payments.filter((p) => {
      if (status !== 'all' && p.status !== status) return false
      if (q && !String(p.id).includes(q) && !String(p.orderId).includes(q) && !p.method.toLowerCase().includes(q)) return false
      return true
    })
  }, [payments, query, status])

  const pages = Math.max(1, Math.ceil(filtered.length / 12))
  const visible = filtered.slice((page - 1) * 12, page * 12)

  const doDelete = async (id: number) => {
    setBusy(true)
    try {
      await storeService.adminDeletePayment(id)
      setPayments(payments.filter((p) => p.id !== id))
      notify('Registro de pago eliminado', 'info')
    } catch (err) { notify(err instanceof Error ? err.message : 'No se pudo eliminar', 'info') } finally { setBusy(false); setConfirmDel(null) }
  }

  return (
    <div className="space-y-4">
      {/* Dashboard financiero de Stripe */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-bold text-slate-900"><Wallet className="h-5 w-5 text-brand-600" /> Liquidaciones · Stripe</h2>
          <div className="flex items-center gap-2">
            {finance?.mode && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${finance.mode === 'live' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                <FlaskConical className="h-3 w-3" /> {finance.mode === 'live' ? 'PRODUCCIÓN' : 'PRUEBA'}
              </span>
            )}
            <button onClick={() => void loadFinance()} disabled={financeLoading} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><RefreshCw className={`h-4 w-4 ${financeLoading ? 'animate-spin' : ''}`} /></button>
          </div>
        </div>

        {financeError ? (
          <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">{financeError}</p>
        ) : !finance ? (
          <p className="mt-3 text-sm text-slate-400">Consultando saldo y liquidaciones…</p>
        ) : (
          <>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl bg-brand-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Saldo disponible</p>
                <p className="mt-1 text-xl font-extrabold text-slate-900">{eur(finance.available.reduce((a, b) => a + b.amount, 0))}</p>
              </div>
              <div className="rounded-xl bg-amber-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Saldo pendiente</p>
                <p className="mt-1 text-xl font-extrabold text-slate-900">{eur(finance.pending.reduce((a, b) => a + b.amount, 0))}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pagos (últimos 50)</p>
                <p className="mt-1 text-xl font-extrabold text-slate-900">{finance.charges.length}</p>
              </div>
            </div>

            {finance.charges.length > 0 && (
              <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/60 text-[10px] uppercase tracking-wide text-slate-400">
                        <th className="px-3 py-2">Cobro</th>
                        <th className="px-3 py-2">Cliente</th>
                        <th className="px-3 py-2">Importe</th>
                        <th className="px-3 py-2">Estado</th>
                        <th className="px-3 py-2">Fecha</th>
                        <th className="px-3 py-2 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {finance.charges.slice(0, 12).map((c) => (
                        <tr key={c.id} className="border-b border-slate-50 last:border-0">
                          <td className="px-3 py-2 font-mono text-[10px] text-slate-500">{c.id.slice(0, 18)}…</td>
                          <td className="px-3 py-2 text-slate-600">{c.email ?? '—'}</td>
                          <td className="px-3 py-2 font-semibold">{eur(c.amount)}</td>
                          <td className="px-3 py-2"><StatusBadge status={c.refunded ? 'refunded' : c.paid ? 'approved' : c.status} label={c.refunded ? 'Reembolsado' : c.paid ? 'Pagado' : c.status} /></td>
                          <td className="px-3 py-2 text-slate-500">{new Date(c.created * 1000).toLocaleDateString('es-ES')}</td>
                          <td className="px-3 py-2 text-right">
                            {!c.refunded && c.paid && (
                              <button onClick={() => void refundCharge(c.id)} disabled={refunding === c.id} className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2 py-1 text-[10px] font-bold text-red-600 hover:bg-red-100 disabled:opacity-50">
                                <ArrowDownToLine className="h-3 w-3" /> Reembolsar
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {finance.payouts.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                  <Landmark className="h-3.5 w-3.5" /> Liquidaciones: {finance.payouts.slice(0, 5).map((p) => `${eur(p.amount)} (${p.status})`).join(' · ')}
                </span>
              </div>
            )}
          </>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar por ID, pedido o método…" className="w-full sm:w-64" />
        <div className="flex items-center gap-1.5">
          <FilterChip label="Todos" active={status === 'all'} onClick={() => setStatus('all')} />
          <FilterChip label="Aprobados" active={status === 'approved'} tone="green" onClick={() => setStatus('approved')} />
          <FilterChip label="Pendientes" active={status === 'pending'} tone="amber" onClick={() => setStatus('pending')} />
          <FilterChip label="Rechazados" active={status === 'declined'} tone="red" onClick={() => setStatus('declined')} />
        </div>
      </div>

      {busy && <p className="text-xs font-semibold text-brand-600">Procesando…</p>}
      {loading ? <Skeleton rows={5} /> : filtered.length === 0 ? (
        <EmptyState title="Sin pagos" subtitle="No hay registros de pago con estos filtros." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Pedido</th>
                  <th className="px-4 py-3">Método</th>
                  <th className="px-4 py-3">Monto</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Transacción</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-brand-50/40">
                    <td className="px-4 py-3 text-slate-400">{p.id}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">#{p.orderId}</td>
                    <td className="px-4 py-3 capitalize text-slate-600">{p.method}</td>
                    <td className="px-4 py-3 font-semibold">{formatPrice(p.amount, region)}</td>
                    <td className="px-4 py-3"><StatusBadge status={p.status} label={p.status} /></td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.transactionId ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{new Date(p.createdAt).toLocaleDateString('es-ES')}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setConfirmDel(p.id)} title="Eliminar registro" className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 px-4 py-3"><Pagination page={page} pages={pages} total={filtered.length} onChange={setPage} /></div>
        </div>
      )}

      <ConfirmModal
        open={confirmDel !== null}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => confirmDel !== null && void doDelete(confirmDel)}
        loading={busy}
        title="¿Eliminar registro de pago?"
        message="Esta acción no se puede deshacer. El pedido asociado no se modifica."
      />
    </div>
  )
}
