import { useMemo, useState } from 'react'
import { Ban, ShieldCheck, Trash2, UserRound, UserRoundCheck } from 'lucide-react'
import { formatPrice } from '../../../lib/currency'
import { storeService, type AdminUser } from '../../../api/services/store'
import { useAdmin } from '../context'
import { BulkBar, BulkButton, ConfirmModal, EmptyState, FilterChip, Pagination, SearchInput, Skeleton, StatusBadge } from '../ui'

interface AccountRow extends AdminUser {
  spent: number
  purchases: number
}

export function AccountsTab() {
  const { region, users, setUsers, orders, notify, loading, user: currentUser } = useAdmin()
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [stateFilter, setStateFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [confirmDel, setConfirmDel] = useState<{ ids: number[]; label: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const rows: AccountRow[] = useMemo(() => {
    const spentByEmail = new Map<string, { spent: number; purchases: number }>()
    orders.forEach((o) => {
      const key = o.customerEmail.toLowerCase()
      const cur = spentByEmail.get(key) ?? { spent: 0, purchases: 0 }
      spentByEmail.set(key, { spent: cur.spent + o.total, purchases: cur.purchases + 1 })
    })
    return users.map((u) => {
      const stats = spentByEmail.get(u.email.toLowerCase())
      return { ...u, spent: stats?.spent ?? 0, purchases: stats?.purchases ?? 0 }
    })
  }, [users, orders])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false
      if (stateFilter === 'suspended' && !u.isSuspended) return false
      if (stateFilter === 'active' && u.isSuspended) return false
      if (q && !u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false
      return true
    })
  }, [rows, query, roleFilter, stateFilter])

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

  const toggleSuspension = async (u: AdminUser) => {
    try {
      const updated = u.isSuspended ? await storeService.adminRestoreUser(u.id) : await storeService.adminSuspendUser(u.id)
      setUsers(users.map((x) => (x.id === u.id ? { ...x, isSuspended: updated.isSuspended } : x)))
      notify(updated.isSuspended ? 'Cuenta suspendida' : 'Cuenta reactivada', 'info')
    } catch (err) { notify(err instanceof Error ? err.message : 'No se pudo cambiar el estado', 'info') }
  }

  const toggleRole = async (u: AdminUser) => {
    const role = u.role === 'admin' ? 'customer' : 'admin'
    try {
      await storeService.adminUpdateUserRole(u.id, role)
      setUsers(users.map((x) => (x.id === u.id ? { ...x, role } : x)))
      notify('Rol actualizado')
    } catch (err) { notify(err instanceof Error ? err.message : 'No se pudo actualizar', 'info') }
  }

  const doDelete = async (ids: number[]) => {
    setBusy(true)
    try {
      for (const id of ids) await storeService.adminDeleteUser(id)
      setUsers(users.filter((u) => !ids.includes(u.id)))
      notify(ids.length === 1 ? 'Usuario eliminado' : `${ids.length} usuarios eliminados`, 'info')
    } catch (err) { notify(err instanceof Error ? err.message : 'No se pudo eliminar', 'info') } finally { setBusy(false); setConfirmDel(null) }
  }

  const bulkSuspend = async (suspend: boolean) => {
    setBusy(true)
    try {
      await Promise.all(Array.from(selected).map((id) => suspend ? storeService.adminSuspendUser(id) : storeService.adminRestoreUser(id)))
      setUsers(users.map((u) => (selected.has(u.id) ? { ...u, isSuspended: suspend } : u)))
      notify(suspend ? `${selected.size} cuentas suspendidas` : `${selected.size} cuentas reactivadas`, 'info')
    } catch (err) { notify(err instanceof Error ? err.message : 'No se pudo actualizar', 'info') } finally { setBusy(false) }
  }

  const isProtected = (u: AdminUser) => u.id === currentUser?.id || u.role === 'admin' || u.role === 'support'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar por nombre o correo…" className="w-full sm:w-72" />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">
          <option value="all">Cualquier rol</option>
          <option value="admin">Admin</option>
          <option value="support">Soporte</option>
          <option value="customer">Cliente</option>
        </select>
        <div className="flex items-center gap-1.5">
          <FilterChip label="Activas" active={stateFilter === 'active'} tone="green" onClick={() => setStateFilter(stateFilter === 'active' ? 'all' : 'active')} />
          <FilterChip label="Suspendidas" active={stateFilter === 'suspended'} tone="red" onClick={() => setStateFilter(stateFilter === 'suspended' ? 'all' : 'suspended')} />
        </div>
      </div>

      <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
        <BulkButton onClick={() => void bulkSuspend(false)}><UserRoundCheck className="mr-1 inline h-3.5 w-3.5" />Reactivar</BulkButton>
        <BulkButton onClick={() => void bulkSuspend(true)}><Ban className="mr-1 inline h-3.5 w-3.5" />Suspender</BulkButton>
        <BulkButton danger onClick={() => setConfirmDel({ ids: Array.from(selected), label: `${selected.size} usuarios` })}><Trash2 className="mr-1 inline h-3.5 w-3.5" />Eliminar</BulkButton>
      </BulkBar>

      {busy && <p className="text-xs font-semibold text-brand-600">Procesando…</p>}
      {loading ? <Skeleton rows={6} /> : filtered.length === 0 ? (
        <EmptyState title="Sin clientes" subtitle="No hay cuentas que coincidan con la búsqueda." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-400">
                  <th className="w-10 px-4 py-3"><input type="checkbox" className="h-4 w-4 accent-brand-600" disabled aria-label="Seleccionar" /></th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Rol</th>
                  <th className="px-4 py-3">País</th>
                  <th className="px-4 py-3">Compras</th>
                  <th className="px-4 py-3">Total gastado</th>
                  <th className="px-4 py-3">Registro</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((u) => (
                  <tr key={u.id} className="border-b border-slate-50 last:border-0 hover:bg-brand-50/40">
                    <td className="px-4 py-3"><input type="checkbox" disabled={isProtected(u)} checked={selected.has(u.id)} onChange={() => toggleOne(u.id)} className="h-4 w-4 rounded border-slate-300 accent-brand-600" aria-label={`Seleccionar ${u.name}`} /></td>
                    <td className="px-4 py-3"><p className="font-semibold text-slate-800">{u.name}</p><p className="text-xs text-slate-400">{u.email}</p></td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${u.role === 'admin' ? 'bg-purple-50 text-purple-700' : u.role === 'support' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                        {u.role === 'admin' ? <ShieldCheck className="h-3 w-3" /> : u.role === 'support' ? <UserRound className="h-3 w-3" /> : null}
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{u.country}</td>
                    <td className="px-4 py-3 text-slate-600">{u.purchases}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{u.spent > 0 ? formatPrice(u.spent, region) : '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{new Date(u.createdAt).toLocaleDateString('es-ES')}</td>
                    <td className="px-4 py-3"><StatusBadge status={u.isSuspended ? 'suspended' : 'ok'} label={u.isSuspended ? 'Suspendida' : 'Activa'} /></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {!isProtected(u) && (
                          <>
                            <button onClick={() => void toggleSuspension(u)} className="rounded-lg px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50">{u.isSuspended ? 'Reactivar' : 'Suspender'}</button>
                            <button onClick={() => void toggleRole(u)} className="rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50">{u.role === 'admin' ? 'Quitar admin' : 'Hacer admin'}</button>
                            <button onClick={() => setConfirmDel({ ids: [u.id], label: u.name })} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                          </>
                        )}
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

      <ConfirmModal
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => confirmDel && void doDelete(confirmDel.ids)}
        loading={busy}
        title={`¿Eliminar ${confirmDel ? (confirmDel.ids.length === 1 ? 'este usuario' : `${confirmDel.ids.length} usuarios`) : ''}?`}
        message="Esta acción no se puede deshacer. Se eliminarán las cuentas y sus datos asociados."
      />
    </div>
  )
}
