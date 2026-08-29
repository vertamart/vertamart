import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { formatPrice } from '../../../lib/currency'
import { storeService } from '../../../api/services/store'
import { useAdmin } from '../context'
import { ConfirmModal, EmptyState, FilterChip, Pagination, SearchInput, Skeleton, StatusBadge } from '../ui'

export function PaymentsTab() {
  const { region, payments, setPayments, notify, loading } = useAdmin()
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
