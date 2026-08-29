import { useMemo, useState, type FormEvent } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { storeService, type AdminCategory } from '../../../api/services/store'
import { useAdmin } from '../context'
import { BulkBar, BulkButton, ConfirmModal, EmptyState, Field, inputCls, Modal, Pagination, SearchInput, Skeleton, StatusBadge } from '../ui'

export function CategoriesTab() {
  const { categories, setCategories, notify, loading } = useAdmin()
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<AdminCategory | null>(null)
  const [form, setForm] = useState({ key: '', name: '', tagline: '', active: true, sortOrder: '0' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [confirmDel, setConfirmDel] = useState<{ ids: number[]; label: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return categories.filter((c) => !q || c.name.toLowerCase().includes(q) || c.key.toLowerCase().includes(q))
  }, [categories, query])

  const pages = Math.max(1, Math.ceil(filtered.length / 12))
  const visible = filtered.slice((page - 1) * 12, page * 12)

  const openCreate = () => { setEditing(null); setForm({ key: '', name: '', tagline: '', active: true, sortOrder: '0' }); setFormError(''); setShowForm(true) }
  const openEdit = (c: AdminCategory) => { setEditing(c); setForm({ key: c.key, name: c.name, tagline: c.tagline ?? '', active: !!c.active, sortOrder: String(c.sortOrder) }); setFormError(''); setShowForm(true) }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (form.key.trim().length < 2 || form.name.trim().length < 2) { setFormError('La categoría necesita nombre y clave'); return }
    setSaving(true)
    setFormError('')
    try {
      const body = { key: form.key.trim(), name: form.name.trim(), tagline: form.tagline.trim() || undefined, active: form.active, sortOrder: Number(form.sortOrder) }
      if (editing) {
        const updated = await storeService.adminUpdateCategory(editing.id, body)
        setCategories(categories.map((c) => (c.id === updated.id ? updated : c)))
        notify('Categoría actualizada correctamente')
      } else {
        const created = await storeService.adminCreateCategory(body)
        setCategories([...categories, created])
        notify('Categoría creada correctamente')
      }
      setShowForm(false)
    } catch (err) { setFormError(err instanceof Error ? err.message : 'No se pudo guardar') } finally { setSaving(false) }
  }

  const toggleActive = async (c: AdminCategory) => {
    try {
      const updated = await storeService.adminUpdateCategory(c.id, { active: !c.active })
      setCategories(categories.map((x) => (x.id === c.id ? updated : x)))
      notify(updated.active ? 'Categoría activada' : 'Categoría desactivada', 'info')
    } catch (err) { notify(err instanceof Error ? err.message : 'No se pudo actualizar', 'info') }
  }

  const doDelete = async (ids: number[]) => {
    setBusy(true)
    try {
      for (const id of ids) await storeService.adminDeleteCategory(id)
      setCategories(categories.filter((c) => !ids.includes(c.id)))
      notify(ids.length === 1 ? 'Categoría eliminada' : `${ids.length} categorías eliminadas`, 'info')
    } catch (err) { notify(err instanceof Error ? err.message : 'No se pudo eliminar', 'info') } finally { setBusy(false); setConfirmDel(null) }
  }

  const bulkActive = async (active: boolean) => {
    setBusy(true)
    try {
      await Promise.all(Array.from(selected).map((id) => storeService.adminUpdateCategory(id, { active })))
      setCategories(categories.map((c) => (selected.has(c.id) ? { ...c, active: active ? 1 : 0 } : c)))
      notify(active ? `${selected.size} categorías activadas` : `${selected.size} categorías desactivadas`, 'info')
    } catch (err) { notify(err instanceof Error ? err.message : 'No se pudo actualizar', 'info') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar categoría…" className="w-full sm:w-64" />
        <div className="ml-auto">
          <button onClick={openCreate} className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-700">
            <Plus className="h-4 w-4" /> Nueva categoría
          </button>
        </div>
      </div>

      <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
        <BulkButton onClick={() => void bulkActive(true)}>Activar</BulkButton>
        <BulkButton onClick={() => void bulkActive(false)}>Desactivar</BulkButton>
        <BulkButton danger onClick={() => setConfirmDel({ ids: Array.from(selected), label: `${selected.size} categorías` })}><Trash2 className="mr-1 inline h-3.5 w-3.5" />Eliminar</BulkButton>
      </BulkBar>

      {busy && <p className="text-xs font-semibold text-brand-600">Procesando…</p>}
      {loading ? <Skeleton rows={5} /> : filtered.length === 0 ? (
        <EmptyState title="Sin categorías" subtitle="Crea la primera categoría para organizar el catálogo." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((c) => (
            <div key={c.id} className={`rounded-2xl border bg-white p-4 shadow-sm transition-all hover:shadow-md ${c.active ? 'border-slate-200' : 'border-slate-100 opacity-70'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-slate-800">{c.name}</p>
                  <p className="truncate text-xs text-slate-400">clave: {c.key}</p>
                  {c.tagline && <p className="mt-1 text-xs text-slate-500">{c.tagline}</p>}
                </div>
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => setSelected((cur) => { const n = new Set(cur); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n })} className="mt-1 h-4 w-4 rounded border-slate-300 accent-brand-600" aria-label={`Seleccionar ${c.name}`} />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">{c.productCount} productos</span>
                <StatusBadge status={c.active ? 'active' : 'hidden'} label={c.active ? 'Activa' : 'Oculta'} />
              </div>
              <div className="mt-3 flex gap-1.5 border-t border-slate-100 pt-3">
                <button onClick={() => void toggleActive(c)} className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50">{c.active ? 'Desactivar' : 'Activar'}</button>
                <button onClick={() => openEdit(c)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-brand-700 hover:bg-brand-50"><Pencil className="h-3 w-3" /> Editar</button>
                <button onClick={() => setConfirmDel({ ids: [c.id], label: c.name })} className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2"><Pagination page={page} pages={pages} total={filtered.length} onChange={setPage} /></div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Editar categoría' : 'Nueva categoría'}>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
            <Field label="Clave (slug, ej. plantillas)"><input className={inputCls} value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value.toLowerCase().replace(/\s+/g, '-') })} required /></Field>
          </div>
          <Field label="Descripción corta"><input className={inputCls} value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="h-4 w-4 accent-brand-600" /> Activa
            </label>
            <Field label="Orden"><input type="number" min="0" className={inputCls} value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></Field>
          </div>
          {formError && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{formError}</p>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
            <button type="submit" disabled={saving} className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50">{saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear categoría'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => confirmDel && void doDelete(confirmDel.ids)}
        loading={busy}
        title={`¿Eliminar ${confirmDel ? (confirmDel.ids.length === 1 ? 'esta categoría' : `${confirmDel.ids.length} categorías`) : ''}?`}
        message="Los productos de esa categoría pasarán a «General». Esta acción no se puede deshacer."
      />
    </div>
  )
}
