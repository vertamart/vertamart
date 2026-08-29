import { useMemo, useState, type FormEvent } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { formatPrice } from '../../../lib/currency'
import { storeService, type PromoCode } from '../../../api/services/store'
import { useAdmin } from '../context'
import { BulkBar, BulkButton, ConfirmModal, EmptyState, Field, FilterChip, inputCls, Modal, Pagination, SearchInput, Skeleton, StatusBadge } from '../ui'

interface CouponForm {
  code: string
  type: 'percent' | 'fixed'
  percent: string
  value: string
  minAmount: string
  startsAt: string
  expiresAt: string
  maxUses: string
}

const emptyForm: CouponForm = { code: '', type: 'percent', percent: '10', value: '', minAmount: '0', startsAt: '', expiresAt: '', maxUses: '' }

export function CouponsTab() {
  const { region, promos, setPromos, notify, loading } = useAdmin()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<PromoCode | null>(null)
  const [form, setForm] = useState<CouponForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [confirmDel, setConfirmDel] = useState<{ ids: number[]; label: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return promos.filter((p) => {
      if (status === 'active' && !p.active) return false
      if (status === 'inactive' && p.active) return false
      if (q && !p.code.toLowerCase().includes(q)) return false
      return true
    })
  }, [promos, query, status])

  const pages = Math.max(1, Math.ceil(filtered.length / 12))
  const visible = filtered.slice((page - 1) * 12, page * 12)

  const openCreate = () => { setEditing(null); setForm(emptyForm); setFormError(''); setShowForm(true) }
  const openEdit = (p: PromoCode) => {
    setEditing(p)
    setForm({
      code: p.code, type: p.type, percent: String(p.percent), value: p.value ? String(p.value) : '',
      minAmount: String(p.minAmount), startsAt: p.startsAt ?? '', expiresAt: p.expiresAt ?? '',
      maxUses: p.maxUses ? String(p.maxUses) : '',
    })
    setFormError('')
    setShowForm(true)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      const base = {
        code: form.code.trim().toUpperCase(),
        type: form.type,
        percent: Number(form.percent) || 0,
        value: form.type === 'fixed' ? Number(form.value) || 0 : 0,
        minAmount: Number(form.minAmount) || 0,
        startsAt: form.startsAt || undefined,
        expiresAt: form.expiresAt || undefined,
        maxUses: form.maxUses ? Number(form.maxUses) : undefined,
      }
      if (editing) {
        const updated = await storeService.adminUpdatePromoCode(editing.id, { ...base, usedCount: editing.usedCount })
        setPromos(promos.map((p) => (p.id === updated.id ? updated : p)))
        notify('Cupón actualizado correctamente')
      } else {
        const created = await storeService.adminCreatePromoCode(base)
        setPromos([created, ...promos])
        notify('Cupón creado correctamente')
      }
      setShowForm(false)
    } catch (err) { setFormError(err instanceof Error ? err.message : 'No se pudo guardar') } finally { setSaving(false) }
  }

  const toggleActive = async (p: PromoCode) => {
    try {
      const updated = await storeService.adminUpdatePromoCode(p.id, { active: p.active ? 0 : 1 })
      setPromos(promos.map((x) => (x.id === p.id ? updated : x)))
      notify(updated.active ? 'Cupón activado' : 'Cupón desactivado', 'info')
    } catch (err) { notify(err instanceof Error ? err.message : 'No se pudo actualizar', 'info') }
  }

  const doDelete = async (ids: number[]) => {
    setBusy(true)
    try {
      for (const id of ids) await storeService.adminDeletePromoCode(id)
      setPromos(promos.filter((p) => !ids.includes(p.id)))
      notify(ids.length === 1 ? 'Cupón eliminado' : `${ids.length} cupones eliminados`, 'info')
    } catch (err) { notify(err instanceof Error ? err.message : 'No se pudo eliminar', 'info') } finally { setBusy(false); setConfirmDel(null) }
  }

  const bulkActive = async (active: boolean) => {
    setBusy(true)
    try {
      await Promise.all(Array.from(selected).map((id) => storeService.adminUpdatePromoCode(id, { active: active ? 1 : 0 })))
      setPromos(promos.map((p) => (selected.has(p.id) ? { ...p, active: active ? 1 : 0 } : p)))
      notify(active ? `${selected.size} cupones activados` : `${selected.size} cupones desactivados`, 'info')
    } catch (err) { notify(err instanceof Error ? err.message : 'No se pudo actualizar', 'info') } finally { setBusy(false) }
  }

  const discountLabel = (p: PromoCode) => p.type === 'fixed' ? `${formatPrice(p.value, region)} off` : `-${p.percent}%`

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar código…" className="w-full sm:w-56" />
        <div className="flex items-center gap-1.5">
          <FilterChip label="Activos" active={status === 'active'} tone="green" onClick={() => setStatus(status === 'active' ? 'all' : 'active')} />
          <FilterChip label="Inactivos" active={status === 'inactive'} tone="red" onClick={() => setStatus(status === 'inactive' ? 'all' : 'inactive')} />
        </div>
        <div className="ml-auto">
          <button onClick={openCreate} className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-700">
            <Plus className="h-4 w-4" /> Nuevo cupón
          </button>
        </div>
      </div>

      <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
        <BulkButton onClick={() => void bulkActive(true)}>Activar</BulkButton>
        <BulkButton onClick={() => void bulkActive(false)}>Desactivar</BulkButton>
        <BulkButton danger onClick={() => setConfirmDel({ ids: Array.from(selected), label: `${selected.size} cupones` })}><Trash2 className="mr-1 inline h-3.5 w-3.5" />Eliminar</BulkButton>
      </BulkBar>

      {busy && <p className="text-xs font-semibold text-brand-600">Procesando…</p>}
      {loading ? <Skeleton rows={5} /> : filtered.length === 0 ? (
        <EmptyState title="Sin cupones" subtitle="Crea códigos promocionales para tus clientes." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((p) => (
            <div key={p.id} className={`rounded-2xl border bg-white p-4 shadow-sm transition-all hover:shadow-md ${p.active ? 'border-slate-200' : 'border-slate-100 opacity-70'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-base font-extrabold text-brand-700">{p.code}</p>
                  <p className="text-sm font-bold text-slate-800">{discountLabel(p)}</p>
                </div>
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => setSelected((cur) => { const n = new Set(cur); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n })} className="mt-1 h-4 w-4 rounded border-slate-300 accent-brand-600" aria-label={`Seleccionar ${p.code}`} />
              </div>
              <div className="mt-2 space-y-1 text-xs text-slate-500">
                <p>Mínimo: {formatPrice(p.minAmount, region)}</p>
                <p>Usos: {p.usedCount}{p.maxUses ? ` / ${p.maxUses}` : ' (ilimitados)'}</p>
                <p>{p.startsAt ? `Inicio: ${p.startsAt}` : 'Sin inicio'} · {p.expiresAt ? `Caduca: ${p.expiresAt}` : 'Sin caducidad'}</p>
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                <StatusBadge status={p.active ? 'active' : 'hidden'} label={p.active ? 'Activo' : 'Inactivo'} />
                <div className="flex gap-1">
                  <button onClick={() => void toggleActive(p)} className="rounded-lg px-2 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50">{p.active ? 'Desactivar' : 'Activar'}</button>
                  <button onClick={() => openEdit(p)} className="rounded-lg p-1.5 text-brand-700 hover:bg-brand-50"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setConfirmDel({ ids: [p.id], label: p.code })} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2"><Pagination page={page} pages={pages} total={filtered.length} onChange={setPage} /></div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Editar cupón' : 'Nuevo cupón'}>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Código"><input className={inputCls} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} required placeholder="EJEMPLO20" /></Field>
            <Field label="Tipo">
              <select className={inputCls} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'percent' | 'fixed' })}>
                <option value="percent">Porcentaje (%)</option>
                <option value="fixed">Cantidad fija</option>
              </select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {form.type === 'percent' ? (
              <Field label="Descuento (%)"><input type="number" min="1" max="90" className={inputCls} value={form.percent} onChange={(e) => setForm({ ...form, percent: e.target.value })} /></Field>
            ) : (
              <Field label="Descuento fijo (base)"><input type="number" min="1" className={inputCls} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></Field>
            )}
            <Field label="Compra mínima"><input type="number" min="0" className={inputCls} value={form.minAmount} onChange={(e) => setForm({ ...form, minAmount: e.target.value })} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Inicio (opcional)"><input type="date" className={inputCls} value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></Field>
            <Field label="Caducidad (opcional)"><input type="date" className={inputCls} value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} /></Field>
            <Field label="Límite de usos (opcional)"><input type="number" min="1" className={inputCls} value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} /></Field>
          </div>
          {formError && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{formError}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
            <button type="submit" disabled={saving} className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50">{saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear cupón'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => confirmDel && void doDelete(confirmDel.ids)}
        loading={busy}
        title={`¿Eliminar ${confirmDel ? (confirmDel.ids.length === 1 ? 'este cupón' : `${confirmDel.ids.length} cupones`) : ''}?`}
        message="Los clientes ya no podrán usar este código. Esta acción no se puede deshacer."
      />
    </div>
  )
}
