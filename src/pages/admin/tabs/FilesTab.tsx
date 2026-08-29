import { useMemo, useState } from 'react'
import { Download, FileArchive, Pencil } from 'lucide-react'
import { storeService, type StoredProduct } from '../../../api/services/store'
import { ProductImage } from '../../../components/ui/ProductImage'
import { useAdmin } from '../context'
import { EmptyState, Field, FilterChip, inputCls, Modal, Pagination, SearchInput, Skeleton } from '../ui'

interface FileForm {
  fileType: string
  fileSize: string
  compatibility: string
  license: string
  updates: string
  support: string
  includes: string
  requirements: string
}

export function FilesTab() {
  const { products, setProducts, notify, refresh, loading } = useAdmin()
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<StoredProduct | null>(null)
  const [form, setForm] = useState<FileForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const types = useMemo(() => Array.from(new Set(products.map((p) => p.fileType).filter(Boolean))).sort(), [products])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products.filter((p) => {
      if (typeFilter !== 'all' && p.fileType !== typeFilter) return false
      if (q && !p.name.toLowerCase().includes(q) && !(p.productCode ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [products, query, typeFilter])

  const pages = Math.max(1, Math.ceil(filtered.length / 12))
  const visible = filtered.slice((page - 1) * 12, page * 12)

  const openEdit = (p: StoredProduct) => {
    setEditing(p)
    setForm({
      fileType: p.fileType, fileSize: p.fileSize, compatibility: p.compatibility, license: p.license,
      updates: p.updates, support: p.support, includes: p.includes.join('\n'), requirements: p.requirements.join('\n'),
    })
    setError('')
  }

  const save = async () => {
    if (!editing || !form) return
    setSaving(true)
    setError('')
    try {
      const updated = await storeService.updateProduct(editing.id, {
        fileType: form.fileType.trim() || 'ZIP',
        fileSize: form.fileSize.trim() || '10 MB',
        compatibility: form.compatibility.trim(),
        license: form.license.trim(),
        updates: form.updates.trim(),
        support: form.support.trim(),
        includes: form.includes.split('\n').map((s) => s.trim()).filter(Boolean),
        requirements: form.requirements.split('\n').map((s) => s.trim()).filter(Boolean),
      })
      setProducts(products.map((p) => (p.id === updated.id ? updated : p)))
      refresh()
      notify('Archivo digital actualizado correctamente')
      setEditing(null)
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar') } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">Gestiona los archivos digitales de cada producto: formato, tamaño, licencia, actualizaciones y soporte. Las descargas se liberan automáticamente al aprobarse el pedido.</p>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar por producto o código…" className="w-full sm:w-64" />
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip label="Todos" active={typeFilter === 'all'} onClick={() => setTypeFilter('all')} />
          {types.slice(0, 8).map((t) => (
            <FilterChip key={t} label={t} active={typeFilter === t} tone="blue" onClick={() => setTypeFilter(typeFilter === t ? 'all' : t)} />
          ))}
        </div>
      </div>

      {loading ? <Skeleton rows={6} /> : filtered.length === 0 ? (
        <EmptyState title="Sin archivos" subtitle="No hay productos digitales con estos filtros." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Formato</th>
                  <th className="px-4 py-3">Tamaño</th>
                  <th className="px-4 py-3">Licencia</th>
                  <th className="px-4 py-3">Compatibilidad</th>
                  <th className="px-4 py-3">Descargas</th>
                  <th className="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-brand-50/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-50"><ProductImage src={p.image} fallback={p.category} name={p.name} /></div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-800">{p.name}</p>
                          <p className="text-xs text-slate-400">Código: {p.productCode ?? '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700"><FileArchive className="h-3 w-3" />{p.fileType}</span></td>
                    <td className="px-4 py-3 text-slate-600">{p.fileSize}</td>
                    <td className="max-w-[160px] truncate px-4 py-3 text-slate-600" title={p.license}>{p.license}</td>
                    <td className="max-w-[180px] truncate px-4 py-3 text-slate-500" title={p.compatibility}>{p.compatibility}</td>
                    <td className="px-4 py-3"><span className="inline-flex items-center gap-1 font-semibold text-slate-700"><Download className="h-3.5 w-3.5 text-brand-600" />{p.downloads.toLocaleString('es-ES')}</span></td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openEdit(p)} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold text-brand-700 hover:bg-brand-50"><Pencil className="h-3.5 w-3.5" /> Editar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 px-4 py-3"><Pagination page={page} pages={pages} total={filtered.length} onChange={setPage} /></div>
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Archivo digital — ${editing?.name ?? ''}`} wide>
        {form && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Formato"><input className={inputCls} value={form.fileType} onChange={(e) => setForm({ ...form, fileType: e.target.value })} /></Field>
              <Field label="Tamaño"><input className={inputCls} value={form.fileSize} onChange={(e) => setForm({ ...form, fileSize: e.target.value })} /></Field>
              <Field label="Compatibilidad"><input className={inputCls} value={form.compatibility} onChange={(e) => setForm({ ...form, compatibility: e.target.value })} /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Licencia"><input className={inputCls} value={form.license} onChange={(e) => setForm({ ...form, license: e.target.value })} /></Field>
              <Field label="Actualizaciones"><input className={inputCls} value={form.updates} onChange={(e) => setForm({ ...form, updates: e.target.value })} /></Field>
            </div>
            <Field label="Soporte"><input className={inputCls} value={form.support} onChange={(e) => setForm({ ...form, support: e.target.value })} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Qué incluye (una por línea)"><textarea rows={4} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.includes} onChange={(e) => setForm({ ...form, includes: e.target.value })} /></Field>
              <Field label="Requisitos (una por línea)"><textarea rows={4} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} /></Field>
            </div>
            {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button onClick={() => setEditing(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={() => void save()} disabled={saving} className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar cambios'}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
