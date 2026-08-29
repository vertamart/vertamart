import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PackageSearch, SlidersHorizontal, X } from 'lucide-react'
import type { CategoryId } from '../data/products'
import { useCatalog } from '../context/CatalogContext'
import { CatalogError, CatalogSkeleton } from '../components/ui/CatalogState'
import { ProductCard } from '../components/ui/ProductCard'
import { cn } from '../lib/cn'

type SortKey = 'relevancia' | 'precio-asc' | 'precio-desc' | 'rating' | 'novedades'

export function ProductCatalog() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const cat = (params.get('categoria') ?? '') as CategoryId | ''
  const codigo = (params.get('codigo') ?? '').trim().toUpperCase()
  // 0 = sin límite aún; se inicializa con el precio máximo del catálogo cuando carga
  const [maxPrice, setMaxPrice] = useState(0)
  const [minRating, setMinRating] = useState(0)
  const [inStock, setInStock] = useState(false)
  const [sort, setSort] = useState<SortKey>('relevancia')
  const [showFilters, setShowFilters] = useState(false)
  const { products, status, error, refresh } = useCatalog()

  const priceCeiling = useMemo(() => Math.max(...products.map((p) => p.price), 1), [products])

  // El filtro arranca en el precio máximo del catálogo (no oculta nada por defecto)
  useEffect(() => {
    if (maxPrice === 0 && products.length > 0) setMaxPrice(priceCeiling)
  }, [maxPrice, priceCeiling, products.length])

  useEffect(() => { window.scrollTo({ top: 0 }) }, [q, cat])

  const filtered = useMemo(() => {
    let list = products.filter((p) => {
      const matchQ = !q || `${p.name} ${p.brand} ${p.description}`.toLowerCase().includes(q.toLowerCase())
      const matchCat = !cat || p.category === cat
      const matchPrice = maxPrice === 0 || p.price <= maxPrice
      const matchRating = p.rating >= minRating
      const matchStock = !inStock || p.stock > 0
      // Si vienes con ?codigo=, busca ese producto concreto
      const matchCode = !codigo || (p.productCode ?? '').toUpperCase() === codigo
      return matchQ && matchCat && matchPrice && matchRating && matchStock && matchCode
    })
    switch (sort) {
      case 'precio-asc': list = [...list].sort((a, b) => a.price - b.price); break
      case 'precio-desc': list = [...list].sort((a, b) => b.price - a.price); break
      case 'rating': list = [...list].sort((a, b) => b.rating - a.rating); break
      case 'novedades': list = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); break
      default: list = [...list].sort((a, b) => Number(!!b.badge) - Number(!!a.badge))
    }
    return list
  }, [q, cat, codigo, maxPrice, minRating, inStock, sort, products])

  const setCat = (c: string) => {
    if (!c || c === 'todas') {
      params.delete('categoria')
      setParams(params, { replace: true })
    } else {
      setParams({ ...Object.fromEntries(params), categoria: c }, { replace: true })
    }
  }

  const clearAll = () => {
    setParams({}, { replace: true })
    setMaxPrice(priceCeiling)
    setMinRating(0)
    setInStock(false)
    setSort('relevancia')
  }

  if (status === 'error' && products.length === 0) {
    return <CatalogError message={error ?? 'No pudimos cargar el catálogo.'} onRetry={refresh} />
  }
  if (status === 'loading' && products.length === 0) {
    return <div className="mx-auto max-w-7xl px-4 py-8"><CatalogSkeleton cards={9} /></div>
  }

  const filters = (
    <FilterPanel
      cat={cat} setCat={setCat}
      maxPrice={maxPrice} setMaxPrice={setMaxPrice}
      priceCeiling={priceCeiling}
      minRating={minRating} setMinRating={setMinRating}
      inStock={inStock} setInStock={setInStock}
      onClear={clearAll}
    />
  )

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">Catálogo</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          {q ? `Resultados para "${q}"` : 'Todos los productos'}
        </h1>
        <p className="mt-1 text-slate-500">{filtered.length} producto{filtered.length !== 1 && 's'}</p>
      </header>

      <div className="mt-6 flex flex-col gap-6 lg:flex-row">
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-24 rounded-2xl border border-slate-200 bg-white p-5">{filters}</div>
        </aside>

        {showFilters && (
          <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm lg:hidden" onClick={() => setShowFilters(false)}>
            <div className="absolute inset-y-0 left-0 w-80 max-w-[85%] overflow-y-auto bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900">Filtros</h2>
                <button onClick={() => setShowFilters(false)} aria-label="Cerrar filtros" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">
                  <X className="h-5 w-5" />
                </button>
              </div>
              {filters}
              <button onClick={() => setShowFilters(false)} className="mt-6 w-full rounded-xl bg-brand-600 py-3 font-bold text-white">Ver resultados</button>
            </div>
          </div>
        )}

        <div className="flex-1">
          <div className="mb-4 flex items-center justify-between gap-3">
            <button onClick={() => setShowFilters(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 lg:hidden">
              <SlidersHorizontal className="h-4 w-4" /> Filtros
            </button>
            <div className="ml-auto flex items-center gap-2">
              <label htmlFor="sort" className="hidden text-sm text-slate-500 sm:block">Ordenar:</label>
              <select id="sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-400">
                <option value="relevancia">Relevancia</option>
                <option value="precio-asc">Precio: menor a mayor</option>
                <option value="precio-desc">Precio: mayor a menor</option>
                <option value="rating">Mejor valorados</option>
                <option value="novedades">Novedades</option>
              </select>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 py-20 text-center">
              <PackageSearch className="h-12 w-12 text-slate-300" />
              <h3 className="mt-4 text-lg font-bold text-slate-700">Sin resultados</h3>
              <p className="mt-1 text-sm text-slate-500">Prueba ajustando los filtros o busca otro término.</p>
              <button onClick={clearAll} className="mt-4 rounded-xl bg-brand-600 px-5 py-2 text-sm font-bold text-white hover:bg-brand-700">Limpiar filtros</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((p) => (
                <ProductCard key={p.id} product={p} className="animate-fade-up" />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FilterPanel(props: {
  cat: CategoryId | ''
  setCat: (c: string) => void
  maxPrice: number
  setMaxPrice: (n: number) => void
  priceCeiling: number
  minRating: number
  setMinRating: (n: number) => void
  inStock: boolean
  setInStock: (b: boolean) => void
  onClear: () => void
}) {
  const { cat, setCat, maxPrice, setMaxPrice, priceCeiling, minRating, setMinRating, inStock, setInStock, onClear } = props
  const { categories } = useCatalog()
  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-700">Categoría</h3>
        <div className="flex flex-col gap-1">
          <button onClick={() => setCat('todas')} className={cn('rounded-lg px-3 py-1.5 text-left text-sm transition-colors', cat === '' ? 'bg-brand-50 font-bold text-brand-700' : 'text-slate-600 hover:bg-slate-50')}>Todas</button>
          {categories.map((c) => (
            <button key={c.id} onClick={() => setCat(c.id)} className={cn('rounded-lg px-3 py-1.5 text-left text-sm transition-colors', cat === c.id ? 'bg-brand-50 font-bold text-brand-700' : 'text-slate-600 hover:bg-slate-50')}>
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-700">Precio máximo</h3>
        <input type="range" min={1000} max={priceCeiling} step={1000} value={maxPrice || priceCeiling} onChange={(e) => setMaxPrice(Number(e.target.value))} className="w-full accent-brand-600" aria-label="Precio máximo" />
        <div className="mt-1 flex justify-between text-xs text-slate-500">
          <span>$1.000</span>
          <span className="font-semibold text-slate-700">Hasta ${maxPrice.toLocaleString('es-CL')}</span>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-700">Valoración mínima</h3>
        <div className="flex gap-1.5">
          {[0, 3, 4, 4.5].map((r) => (
            <button key={r} onClick={() => setMinRating(r)}
              className={cn('rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors', minRating === r ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500 hover:border-brand-300')}>
              {r === 0 ? 'Todas' : `${r}★+`}
            </button>
          ))}
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} className="h-4 w-4 accent-brand-600" />
Solo productos con descarga disponible
      </label>

      <button onClick={onClear} className="text-sm font-semibold text-brand-700 hover:underline">Limpiar todo</button>
    </div>
  )
}