import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import type { CategoryId } from '../data/products'
import { useCatalog } from '../context/CatalogContext'

const catIcons: Record<CategoryId, string> = {
  audio: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm-3-8h6m-3-4v5M9 13a3 3 0 0 0 6 0',
  wearables: 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm0 6h10M12 17h.01',
  teclado: 'M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8zm5 2v.01M12 10v.01M16 10v.01M8 14h8',
  mouse: 'M9 4h6a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3zm3 0v5M12 12v5',
  carga: 'M13 2L4.5 12.5H11l-1 8L18.5 10H12l1-8z',
  monitor: 'M4 5h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm6 12h4v3h-4z',
}

export function Categories() {
  const { products, categories, status } = useCatalog()

  if (status === 'loading') {
    return <div className="mx-auto max-w-7xl px-4 py-24 text-center text-slate-400">Cargando categorías…</div>
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">Explora</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Nuestras categorías</h1>
        <p className="mx-auto mt-2 max-w-xl text-slate-500">Encuentra exactamente lo que buscas dentro de nuestras colecciones de tecnología.</p>
      </header>

      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((c) => {
          const count = products.filter((p) => p.category === c.id).length
          const sample = products.filter((p) => p.category === c.id).slice(0, 3)
          return (
            <Link key={c.id} to={`/productos?categoria=${c.id}`} className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-7 transition-all hover:-translate-y-1 hover:border-brand-300 hover:shadow-xl">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-600 group-hover:text-white">
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d={catIcons[c.id]} />
                </svg>
              </div>
              <h2 className="mt-4 text-xl font-bold text-slate-900">{c.name}</h2>
              <p className="mt-1 text-sm text-slate-500">{c.tagline} · {count} producto{count !== 1 && 's'}</p>
              <div className="mt-4 flex -space-x-3">
                {sample.map((p) => (
                  <div key={p.id} className="h-12 w-12 overflow-hidden rounded-xl border-2 border-white shadow-sm">
                    <svg viewBox="0 0 40 40" className="h-full w-full bg-brand-600">
                      <circle cx="20" cy="20" r="14" fill="rgba(255,255,255,0.15)" />
                    </svg>
                  </div>
                ))}
              </div>
              <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
                Ver productos <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}