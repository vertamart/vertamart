import { Link } from 'react-router-dom'
import { Heart } from 'lucide-react'
import { useStore } from '../context/StoreContext'
import { useCatalog } from '../context/CatalogContext'
import { ProductCard } from '../components/ui/ProductCard'

export function Favorites() {
  const { favorites } = useStore()
  const { products, status } = useCatalog()
  const items = products.filter((p) => favorites.includes(p.id))

  if (status === 'loading') {
    return <div className="mx-auto max-w-7xl px-4 py-24 text-center text-slate-400">Cargando tus favoritos…</div>
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Mis favoritos</h1>
      <p className="mt-1 text-slate-500">{items.length} producto{items.length !== 1 && 's'} guardado{items.length !== 1 && 's'}</p>

      {items.length === 0 ? (
        <div className="mt-12 flex flex-col items-center rounded-2xl border border-dashed border-slate-300 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
            <Heart className="h-8 w-8 text-red-400" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-700">Aún no tienes favoritos</h2>
          <p className="mt-1 text-sm text-slate-500">Marca los productos que te gusten con el corazón ♥</p>
          <Link to="/productos" className="mt-6 rounded-xl bg-brand-600 px-6 py-3 font-bold text-white hover:bg-brand-700">
            Explorar productos
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  )
}