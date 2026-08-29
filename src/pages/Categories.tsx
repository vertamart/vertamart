import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import type { CategoryId } from '../data/products'
import { useCatalog } from '../context/CatalogContext'

const catIcons: Record<CategoryId, string> = {
  plantillas: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm0 2l6 6h-6V4zM9 13h6M9 17h4',
  presets: 'M3 17l5-5 4 4 6-7 3 3V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12z',
  iconos: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zm7 12l.9 2.6L22.5 18l-2.6.9L19 21.5l-.9-2.6L15.5 18l2.6-.9L19 15z',
  fuentes: 'M4 7V5h16v2M12 5v14m-4 0h8',
  'modelos-3d': 'M12 2l8 4.5v9L12 20l-8-4.5v-9L12 2zm0 0v9m8-4.5L12 11M4 6.5L12 11m0 9v-9',
  plugins: 'M9 3H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm10 10h-4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2zM5 15h4v4H5z',
  cursos: 'M12 5l8 3-8 3-8-3 8-3zm-8 5v5c0 1.1 3.6 3 8 3s8-1.9 8-3v-5M12 14v5',
  packs: 'M21 8l-9-5-9 5v8l9 5 9-5V8zm-9-3v4m-7 2l7 4 7-4',
  android: 'M8 2l-1.5 3H6a3 3 0 0 0-3 3v11a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3h-.5L16 2h-2l-1 2h-2l-1-2H8zm-2 8h12v8H6v-8zm2 2v4m4-4v4',
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
        <p className="mx-auto mt-2 max-w-xl text-slate-500">Recursos digitales listos para descargar al instante: plantillas, presets, iconos, fuentes y más.</p>
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