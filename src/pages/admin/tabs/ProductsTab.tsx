import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Copy, Download, FileArchive, FolderInput, Percent, Pencil, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { formatPrice } from '../../../lib/currency'
import { storeService, type StoredProduct } from '../../../api/services/store'
import { ProductImage } from '../../../components/ui/ProductImage'
import { ImageUpload } from '../../../components/ui/ImageUpload'
import { useAdmin } from '../context'
import { BulkBar, BulkButton, ConfirmModal, EmptyState, Field, FilterChip, inputCls, Modal, Pagination, SearchInput, Skeleton, StatusBadge, textareaCls } from '../ui'
import { cn } from '../../../lib/cn'

const PAGE_SIZE = 12

interface ProductForm {
  name: string
  description: string
  category: string
  price: string
  oldPrice: string
  stock: string
  image: string
  badge: string
  fileType: string
  fileSize: string
  compatibility: string
  license: string
  updates: string
  support: string
  version: string
  versionNotes: string
  features: string
  includes: string
  requirements: string
}

const emptyForm = (category: string): ProductForm => ({
  name: '', description: '', category, price: '', oldPrice: '', stock: '10', image: '',
  badge: '', fileType: 'ZIP', fileSize: '10 MB', compatibility: 'Windows · macOS · Linux',
  license: 'Uso personal y comercial', updates: 'Actualizaciones de por vida', support: 'Soporte por correo',
  version: '1.0.0', versionNotes: '', features: '', includes: '', requirements: '',
})

export function ProductsTab({ initialCategory, stockTarget, onStockTargetHandled }: { initialCategory?: string; stockTarget?: { id: string; ts: number } | null; onStockTargetHandled?: () => void }) {
  const { region, products, setProducts, categories, notify, refresh, t, loading } = useAdmin()

  const [query, setQuery] = useState('')
  const [cat, setCat] = useState(initialCategory ?? 'all')
  const [status, setStatus] = useState('all')
  const [stockFilter, setStockFilter] = useState('all')
  const [sort, setSort] = useState<'new' | 'name' | 'price' | 'downloads'>('new')
  const [page, setPage] = useState(1)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<StoredProduct | null>(null)
  const [form, setForm] = useState<ProductForm>(emptyForm(categories[0]?.key ?? 'general'))
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [confirmDel, setConfirmDel] = useState<{ ids: string[]; label: string } | null>(null)
  const [bulkCat, setBulkCat] = useState(false)
  const [bulkDiscount, setBulkDiscount] = useState(false)
  const [bulkDiscountPct, setBulkDiscountPct] = useState('10')
  const [busy, setBusy] = useState(false)
  const [editStock, setEditStock] = useState<{ id: string; value: string } | null>(null)

  const allCats = useMemo(() => {
    const set = new Set<string>(categories.map((c) => c.key))
    products.forEach((p) => set.add(p.category))
    return Array.from(set)
  }, [categories, products])

  useEffect(() => { setPage(1) }, [query, cat, status, stockFilter, sort])

  // Abrir el editor de stock cuando llega un objetivo (ej. «Reponer» desde el Dashboard)
  useEffect(() => {
    if (stockTarget) {
      const p = products.find((x) => x.id === stockTarget.id)
      if (p) setEditStock({ id: p.id, value: String(p.stock) })
      onStockTargetHandled?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockTarget])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = products.filter((p) => {
      if (cat !== 'all' && p.category !== cat) return false
      if (status !== 'all' && (p.status ?? 'active') !== status) return false
      if (stockFilter === 'out' && p.stock !== 0) return false
      if (stockFilter === 'low' && !(p.stock > 0 && p.stock <= 5)) return false
      if (q && !p.name.toLowerCase().includes(q) && !(p.productCode ?? '').toLowerCase().includes(q)) return false
      return true
    })
    list = [...list].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      if (sort === 'price') return a.price - b.price
      if (sort === 'downloads') return b.downloads - a.downloads
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
    return list
  }, [products, query, cat, status, stockFilter, sort])

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const allVisibleSelected = visible.length > 0 && visible.every((p) => selected.has(p.id))

  const toggleOne = (id: string) => {
    setSelected((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleVisible = () => {
    setSelected((cur) => {
      const next = new Set(cur)
      if (allVisibleSelected) visible.forEach((p) => next.delete(p.id))
      else visible.forEach((p) => next.add(p.id))
      return next
    })
  }

  const refreshProduct = (updated: StoredProduct) => {
    setProducts(products.map((p) => (p.id === updated.id ? updated : p)))
    refresh()
  }

  const updateStatus = async (p: StoredProduct) => {
    const status2 = (p.status ?? 'active') === 'hidden' ? 'active' : 'hidden'
    try {
      const updated = await storeService.updateProduct(p.id, { status: status2 })
      refreshProduct(updated)
      notify(status2 === 'hidden' ? 'Producto oculto' : 'Producto activado', 'info')
    } catch (err) { notify(err instanceof Error ? err.message : 'No se pudo actualizar', 'info') }
  }

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm(cat !== 'all' ? cat : categories[0]?.key ?? 'general'))
    setFormError('')
    setShowForm(true)
  }
  const openEdit = (p: StoredProduct) => {
    setEditing(p)
    setForm({
      name: p.name, description: p.description, category: p.category,
      price: String(Math.round(p.price * region.rate)), oldPrice: p.oldPrice ? String(Math.round(p.oldPrice * region.rate)) : '',
      stock: String(p.stock), image: p.image, badge: p.badge ?? '',
      fileType: p.fileType, fileSize: p.fileSize, compatibility: p.compatibility, license: p.license,
      updates: p.updates, support: p.support, version: p.version ?? '1.0.0', versionNotes: '',
      features: p.features.join('\n'), includes: p.includes.join('\n'), requirements: p.requirements.join('\n'),
    })
    setFormError('')
    setShowForm(true)
  }

  const submitForm = async (e: FormEvent) => {
    e.preventDefault()
    const price = Number(form.price)
    if (form.name.trim().length < 3 || form.description.trim().length < 3 || !Number.isFinite(price) || price <= 0 || Number(form.stock) < 0) {
      setFormError('Revisa nombre, descripción, precio y stock')
      return
    }
    setSaving(true)
    setFormError('')
    const base = {
      name: form.name.trim(),
      description: form.description.trim(),
      category: form.category,
      price: Math.round(price / region.rate),
      oldPrice: form.oldPrice ? Math.round(Number(form.oldPrice) / region.rate) : undefined,
      stock: Number(form.stock),
      image: form.image.trim(),
      badge: form.badge || undefined,
      features: form.features.split('\n').map((s) => s.trim()).filter(Boolean),
      fileType: form.fileType.trim() || 'ZIP',
      fileSize: form.fileSize.trim() || '10 MB',
      compatibility: form.compatibility.trim(),
      license: form.license.trim(),
      updates: form.updates.trim(),
      support: form.support.trim(),
      version: form.version.trim() || '1.0.0',
      versionNotes: form.versionNotes.trim(),
      includes: form.includes.split('\n').map((s) => s.trim()).filter(Boolean),
      requirements: form.requirements.split('\n').map((s) => s.trim()).filter(Boolean),
    }
    try {
      if (editing) {
        const updated = await storeService.updateProduct(editing.id, base)
        refreshProduct(updated)
        notify('Producto actualizado correctamente')
      } else {
        const created = await storeService.createProduct(base)
        setProducts([created as StoredProduct, ...products])
        refresh()
        notify('Producto creado correctamente')
      }
      setShowForm(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const doDelete = async (ids: string[]) => {
    setBusy(true)
    try {
      for (const id of ids) await storeService.deleteProduct(id)
      setProducts(products.filter((p) => !ids.includes(p.id)))
      setSelected((cur) => { const next = new Set(cur); ids.forEach((id) => next.delete(id)); return next })
      refresh()
      notify(ids.length === 1 ? 'Producto eliminado correctamente' : `${ids.length} productos eliminados`, 'info')
    } catch (err) { notify(err instanceof Error ? err.message : 'No se pudo eliminar', 'info') } finally { setBusy(false); setConfirmDel(null) }
  }

  const bulkStatus = async (status2: 'active' | 'hidden') => {
    if (selected.size === 0) return
    setBusy(true)
    try {
      await Promise.all(Array.from(selected).map((id) => storeService.updateProduct(id, { status: status2 })))
      setProducts(products.map((p) => (selected.has(p.id) ? { ...p, status: status2 } : p)))
      notify(status2 === 'hidden' ? `${selected.size} productos ocultos` : `${selected.size} productos activados`, 'info')
      refresh()
    } catch (err) { notify(err instanceof Error ? err.message : 'No se pudo actualizar', 'info') } finally { setBusy(false) }
  }

  const bulkCategory = async (category: string) => {
    setBusy(true)
    try {
      await Promise.all(Array.from(selected).map((id) => storeService.updateProduct(id, { category })))
      setProducts(products.map((p) => (selected.has(p.id) ? { ...p, category } as StoredProduct : p)))
      notify(`Categoría actualizada en ${selected.size} productos`, 'info')
    } catch (err) { notify(err instanceof Error ? err.message : 'No se pudo actualizar', 'info') } finally { setBusy(false); setBulkCat(false) }
  }

  const applyBulkDiscount = async () => {
    const pct = Number(bulkDiscountPct)
    if (!Number.isFinite(pct) || pct <= 0 || pct > 90) { notify('Descuento entre 1 y 90%', 'info'); return }
    setBusy(true)
    try {
      await Promise.all(Array.from(selected).map(async (id) => {
        const p = products.find((x) => x.id === id)
        if (!p) return
        const oldPrice = p.oldPrice ?? p.price
        await storeService.updateProduct(id, { oldPrice, price: Math.max(100, Math.round(oldPrice * (1 - pct / 100))) })
      }))
      setProducts(products.map((p) => (selected.has(p.id) ? { ...p, oldPrice: p.oldPrice ?? p.price, price: Math.max(100, Math.round((p.oldPrice ?? p.price) * (1 - pct / 100))) } : p)))
      notify(`Descuento del ${pct}% aplicado a ${selected.size} productos`, 'info')
      refresh()
    } catch (err) { notify(err instanceof Error ? err.message : 'No se pudo aplicar el descuento', 'info') } finally { setBusy(false); setBulkDiscount(false) }
  }

  const bulkDuplicate = async () => {
    setBusy(true)
    const ids = Array.from(selected)
    try {
      const created: StoredProduct[] = []
      for (const id of ids) {
        const p = products.find((x) => x.id === id)
        if (!p) continue
        created.push(await storeService.createProduct({
          name: `${p.name} (copia)`, description: p.description, category: p.category, price: p.price,
          oldPrice: p.oldPrice, stock: p.stock, image: p.image, badge: p.badge, features: p.features,
          fileType: p.fileType, fileSize: p.fileSize, compatibility: p.compatibility, license: p.license,
        }))
      }
      setProducts([...created, ...products])
      refresh()
      notify(`${created.length} productos duplicados`, 'info')
    } catch (err) { notify(err instanceof Error ? err.message : 'No se pudieron duplicar', 'info') } finally { setBusy(false) }
  }

  const exportCsv = () => {
    const ids = selected.size > 0 ? Array.from(selected) : filtered.map((p) => p.id)
    const rows = products.filter((p) => ids.includes(p.id))
    const header = ['id', 'nombre', 'categoria', 'precio', 'stock', 'estado', 'descargas', 'codigo', 'fecha']
    const csv = [header.join(';'), ...rows.map((p) => [p.id, `"${p.name.replace(/"/g, '""')}"`, p.category, p.price, p.stock, p.status ?? 'active', p.downloads, p.productCode ?? '', p.createdAt].join(';'))].join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'vertamart-productos.csv'
    a.click()
    URL.revokeObjectURL(url)
    notify('CSV exportado', 'info')
  }

  const saveStock = async () => {
    if (!editStock) return
    const value = Number(editStock.value)
    if (!Number.isInteger(value) || value < 0) { notify('Cantidad no válida', 'info'); return }
    try {
      const updated = await storeService.updateProduct(editStock.id, { stock: value })
      refreshProduct(updated)
      notify(`Stock actualizado a ${value}`)
    } catch (err) { notify(err instanceof Error ? err.message : 'No se pudo actualizar el stock', 'info') } finally { setEditStock(null) }
  }

  return (
    <div className="space-y-4">
      {/* Barra de herramientas */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar por nombre o código…" className="w-full sm:w-64" />
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">
          <option value="all">Todas las categorías</option>
          {allCats.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">
          <option value="all">Cualquier estado</option>
          <option value="active">Activos</option>
          <option value="hidden">Ocultos</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">
          <option value="new">Más recientes</option>
          <option value="name">Nombre A-Z</option>
          <option value="price">Precio</option>
          <option value="downloads">Más descargados</option>
        </select>
        <div className="flex items-center gap-1.5">
          <FilterChip label="Con stock" active={stockFilter === 'all'} onClick={() => setStockFilter('all')} />
          <FilterChip label="Stock bajo" active={stockFilter === 'low'} tone="amber" onClick={() => setStockFilter('low')} />
          <FilterChip label="Agotados" active={stockFilter === 'out'} tone="red" onClick={() => setStockFilter('out')} />
        </div>
        <div className="ml-auto">
          <button onClick={openCreate} className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-700">
            <Plus className="h-4 w-4" /> Nuevo producto
          </button>
        </div>
      </div>

      {/* Acciones masivas */}
      <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
        <BulkButton onClick={() => void bulkStatus('active')}>Activar</BulkButton>
        <BulkButton onClick={() => void bulkStatus('hidden')}>Ocultar</BulkButton>
        <BulkButton onClick={() => setBulkCat(true)}><FolderInput className="mr-1 inline h-3.5 w-3.5" />Categoría</BulkButton>
        <BulkButton onClick={() => setBulkDiscount(true)}><Percent className="mr-1 inline h-3.5 w-3.5" />Descuento</BulkButton>
        <BulkButton onClick={() => void bulkDuplicate()}><Copy className="mr-1 inline h-3.5 w-3.5" />Duplicar</BulkButton>
        <BulkButton onClick={exportCsv}><Download className="mr-1 inline h-3.5 w-3.5" />Exportar</BulkButton>
        <BulkButton danger onClick={() => setConfirmDel({ ids: Array.from(selected), label: `${selected.size} producto${selected.size !== 1 ? 's' : ''}` })}>
          <Trash2 className="mr-1 inline h-3.5 w-3.5" />Eliminar
        </BulkButton>
      </BulkBar>

      {/* Tabla */}
      {busy && <p className="text-xs font-semibold text-brand-600">Procesando…</p>}
      {loading ? <Skeleton rows={6} /> : filtered.length === 0 ? (
        <EmptyState title="Sin productos" subtitle="Ajusta los filtros o crea un producto nuevo." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-xs uppercase tracking-wide text-slate-400">
                  <th className="w-10 px-4 py-3">
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} aria-label="Seleccionar visibles" className="h-4 w-4 rounded border-slate-300 accent-brand-600" />
                  </th>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3">Precio</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Stock</th>
                  <th className="px-4 py-3">Descargas</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <tr key={p.id} className={cn('border-b border-slate-50 transition-colors last:border-0 hover:bg-brand-50/40', selected.has(p.id) && 'bg-brand-50/70')}>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} aria-label={`Seleccionar ${p.name}`} className="h-4 w-4 rounded border-slate-300 accent-brand-600" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-50"><ProductImage src={p.image} fallback={p.category} name={p.name} /></div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-800">{p.name}</p>
                          <p className="text-xs text-slate-400">Código: {p.productCode ?? '—'} · {new Date(p.createdAt).toLocaleDateString('es-ES')}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{p.category}</span></td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{formatPrice(p.price, region)}</td>
                    <td className="px-4 py-3"><StatusBadge status={p.status ?? 'active'} label={(p.status ?? 'active') === 'hidden' ? 'Oculto' : 'Activo'} /></td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {editStock?.id === p.id ? (
                        <div className="flex items-center gap-1">
                          <input autoFocus type="number" min="0" value={editStock.value} onChange={(e) => setEditStock({ id: p.id, value: e.target.value })}
                            onKeyDown={(e) => { if (e.key === 'Enter') void saveStock(); if (e.key === 'Escape') setEditStock(null) }}
                            onBlur={() => void saveStock()}
                            className="h-9 w-20 rounded-xl border border-brand-400 px-2 text-sm" />
                          <button onClick={() => void saveStock()} className="rounded-lg bg-brand-600 p-1.5 text-white"><Save className="h-3.5 w-3.5" /></button>
                        </div>
                      ) : p.stock === 0 ? (
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-600">Agotado</span>
                          <button onClick={() => setEditStock({ id: p.id, value: '' })} className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-brand-700">
                            <RotateCcw className="h-3.5 w-3.5" /> Reponer
                          </button>
                        </div>
                      ) : (
                        <button title="Doble clic para editar stock" onDoubleClick={() => setEditStock({ id: p.id, value: String(p.stock) })}
                          className="inline-flex cursor-default items-center gap-1.5 rounded-lg px-2 py-1 font-semibold text-slate-700 hover:bg-brand-50">
                          <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold', p.stock <= 5 ? 'bg-orange-50 text-orange-600' : 'bg-green-50 text-green-700')}>{p.stock}</span>
                          <span className="text-[10px] text-slate-400">doble clic ✎</span>
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{p.downloads.toLocaleString('es-ES')}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => void updateStatus(p)} title={p.status === 'hidden' ? 'Activar' : 'Ocultar'} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-brand-700">
                          <FileArchive className="h-4 w-4" />
                        </button>
                        <button onClick={() => openEdit(p)} title="Editar" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-brand-700"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => setConfirmDel({ ids: [p.id], label: p.name })} title="Eliminar" className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 px-4 py-3">
            <Pagination page={page} pages={pages} total={filtered.length} onChange={setPage} />
          </div>
        </div>
      )}

      {/* Modal crear/editar */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Editar producto' : 'Nuevo producto'} wide>
        <form onSubmit={submitForm} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
            <Field label="Categoría">
              <select className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {allCats.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Descripción"><textarea rows={3} className={textareaCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Precio"><input type="number" min="1" className={inputCls} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field>
            <Field label="Precio anterior (opcional)"><input type="number" min="1" className={inputCls} value={form.oldPrice} onChange={(e) => setForm({ ...form, oldPrice: e.target.value })} /></Field>
            <Field label="Stock"><input type="number" min="0" className={inputCls} value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></Field>
          </div>
          <Field label="Imagen"><ImageUpload value={form.image} onChange={(v) => setForm({ ...form, image: v })} placeholder="URL o sube una imagen" /></Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Formato"><input className={inputCls} value={form.fileType} onChange={(e) => setForm({ ...form, fileType: e.target.value })} /></Field>
            <Field label="Tamaño"><input className={inputCls} value={form.fileSize} onChange={(e) => setForm({ ...form, fileSize: e.target.value })} /></Field>
            <Field label="Versión"><input className={inputCls} value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} placeholder="1.0.0" /></Field>
            <Field label="Notas de la versión (changelog)"><textarea className={textareaCls} rows={2} value={form.versionNotes} onChange={(e) => setForm({ ...form, versionNotes: e.target.value })} placeholder="Qué cambia en esta versión — visible para los compradores" /></Field>
            <Field label="Compatibilidad"><input className={inputCls} value={form.compatibility} onChange={(e) => setForm({ ...form, compatibility: e.target.value })} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Licencia"><input className={inputCls} value={form.license} onChange={(e) => setForm({ ...form, license: e.target.value })} /></Field>
            <Field label="Etiqueta">
              <select className={inputCls} value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })}>
                <option value="">Sin etiqueta</option>
                <option value="nuevo">Nuevo</option>
                <option value="popular">Popular</option>
                <option value="top">Top ventas</option>
              </select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Actualizaciones"><input className={inputCls} value={form.updates} onChange={(e) => setForm({ ...form, updates: e.target.value })} /></Field>
            <Field label="Soporte"><input className={inputCls} value={form.support} onChange={(e) => setForm({ ...form, support: e.target.value })} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Características (una por línea)"><textarea rows={4} className={textareaCls} value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} /></Field>
            <Field label="Qué incluye (una por línea)"><textarea rows={4} className={textareaCls} value={form.includes} onChange={(e) => setForm({ ...form, includes: e.target.value })} /></Field>
            <Field label="Requisitos (una por línea)"><textarea rows={4} className={textareaCls} value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} /></Field>
          </div>
          {formError && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{formError}</p>}
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50">
              <Save className="h-4 w-4" /> {editing ? 'Guardar cambios' : t('panel.createProduct')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirmación eliminar */}
      <ConfirmModal
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => confirmDel && void doDelete(confirmDel.ids)}
        loading={busy}
        title={`¿Eliminar ${confirmDel ? (confirmDel.ids.length === 1 ? 'este producto' : `${confirmDel.ids.length} productos`) : ''}?`}
        message={<span>Esta acción no se puede deshacer. {confirmDel?.ids.length === 1 ? `Se eliminará «${confirmDel.label}» de la tienda.` : `Se eliminarán ${confirmDel?.ids.length} productos de la tienda.`}</span>}
      />

      {/* Modal categoría masiva */}
      <Modal open={bulkCat} onClose={() => setBulkCat(false)} title={`Cambiar categoría (${selected.size})`}>
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Los productos seleccionados pasarán a esta categoría.</p>
          <select className={inputCls} defaultValue="" onChange={(e) => { if (e.target.value) void bulkCategory(e.target.value) }}>
            <option value="" disabled>Elige categoría…</option>
            {allCats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </Modal>

      {/* Modal descuento masivo */}
      <Modal open={bulkDiscount} onClose={() => setBulkDiscount(false)} title={`Aplicar descuento (${selected.size})`}>
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Se fijará el precio anterior y se aplicará el % de descuento sobre él.</p>
          <div className="flex items-center gap-3">
            <input type="number" min="1" max="90" className={inputCls} value={bulkDiscountPct} onChange={(e) => setBulkDiscountPct(e.target.value)} />
            <span className="font-bold text-slate-700">%</span>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setBulkDiscount(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
            <button onClick={() => void applyBulkDiscount()} className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700">Aplicar</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
