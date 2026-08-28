import { useCatalog } from '../context/CatalogContext'
import { ProductCard } from '../components/ui/ProductCard'
import { Tag } from 'lucide-react'

export function Sale() {
  const { products, status } = useCatalog()
  const onSale = products.filter((p) => p.oldPrice)

  if (status === 'loading') {
    return <div className="mx-auto max-w-7xl px-4 py-24 text-center text-slate-400">Cargando ofertas…</div>
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="rounded-3xl bg-gradient-to-r from-brand-700 to-brand-900 p-10 text-white">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-widest backdrop-blur">
          <Tag className="h-3.5 w-3.5" /> Ofertas activas
        </span>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Ahorra hasta 25% hoy</h1>
        <p className="mt-2 max-w-xl text-brand-100">Descuentos reales en productos seleccionados. Usa el cupón VERTA10 al pagar para un 10% extra.</p>
      </header>

      <p className="mt-8 text-slate-500">{onSale.length} productos en oferta</p>
      <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {onSale.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </div>
  )
}