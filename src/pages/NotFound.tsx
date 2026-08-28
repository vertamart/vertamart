import { Link } from 'react-router-dom'
import { Home, Search } from 'lucide-react'

export function NotFound() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-24 text-center">
      <p className="text-8xl font-extrabold tracking-tight text-brand-200">404</p>
      <h1 className="mt-4 text-2xl font-extrabold text-slate-900">Página no encontrada</h1>
      <p className="mt-2 text-slate-500">Lo sentimos, la página que buscas no existe o fue movida.</p>
      <div className="mt-8 flex gap-3">
        <Link to="/" className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 font-bold text-white hover:bg-brand-700">
          <Home className="h-4 w-4" /> Inicio
        </Link>
        <Link to="/productos" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 font-bold text-slate-700 hover:border-brand-400 hover:text-brand-700">
          <Search className="h-4 w-4" /> Ver productos
        </Link>
      </div>
    </div>
  )
}