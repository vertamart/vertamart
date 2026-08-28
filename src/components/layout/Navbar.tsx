import { useEffect, useState, type FormEvent } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Globe, Heart, Menu, MessageCircle, Search, ShoppingCart, User, X } from 'lucide-react'
import { storeService } from '../../api/services/store'
import { useStore } from '../../context/StoreContext'
import { useAuth } from '../../context/AuthContext'
import { useCatalog } from '../../context/CatalogContext'
import { useI18n } from '../../context/I18nContext'
import { cn } from '../../lib/cn'

const linkKeys = [
  { to: '/', key: 'nav.home' },
  { to: '/productos', key: 'nav.products' },
  { to: '/categorias', key: 'nav.categories' },
  { to: '/ofertas', key: 'nav.offers' },
  { to: '/feed', key: 'nav.feed' },
  { to: '/nosotros', key: 'nav.about' },
  { to: '/contacto', key: 'nav.contact' },
  { to: '/instalar', key: 'nav.install' },
]

export function Navbar() {
  const { cartCount, favorites } = useStore()
  const { user, logout } = useAuth()
  const { t, lang, setLang } = useI18n()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [suggested, setSuggested] = useState<{ id: string; name: string; slug: string; category: string }[]>([])
  const { products } = useCatalog()
  const navigate = useNavigate()

  // Autocompletado del buscador: filtra el catálogo mientras escribes.
  useEffect(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 1) {
      setSuggested([])
      return
    }
    const results = products
      .filter((p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))
      .slice(0, 6)
      .map((p) => ({ id: p.id, name: p.name, slug: p.slug, category: p.category }))
    setSuggested(results)
  }, [query, products])

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  // Soporte solo necesita acceder al chat y a su perfil. Admin mantiene todos los enlaces.
  const allLinks = user?.role === 'support'
    ? [{ to: '/chat', key: 'nav.chat' }, { to: `/vendedor/${user.id}`, key: 'nav.account' }]
    : user?.role === 'admin'
      ? [...linkKeys, { to: '/panel', key: 'nav.panel' }]
      : linkKeys

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (user?.role === 'support') return
    const q = query.trim()
    navigate(q ? `/productos?q=${encodeURIComponent(q)}` : '/productos')
    setQuery('')
    setOpen(false)
  }

  // Contador de mensajes sin leer (polling ligero cuando hay sesión)
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    if (!user) {
      setUnread(0)
      return
    }
    let cancelled = false
    const tick = () => {
      storeService
        .getConversations()
        .then((res) => {
          if (!cancelled) setUnread(res.items.reduce((acc, c) => acc + c.unreadCount, 0))
        })
        .catch(() => undefined)
    }
    void tick()
    const id = window.setInterval(tick, 20000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [user])

  // Bloquear scroll cuando el menú móvil está abierto
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6" aria-label={t('nav.home')}>
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2" aria-label="Vertamart">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3c2 0 3.5 1 4.5 3l4 10-3-1-1.5-4H8l-1.5 4-3 1 4-10C8.5 4 10 3 12 3z" />
            </svg>
          </span>
          <span className="text-xl font-extrabold tracking-tight text-slate-900">
            Verta<span className="text-brand-600">mart</span>
          </span>
        </Link>

        {/* Links de escritorio */}
        <ul className="hidden items-center gap-1 lg:flex">
          {allLinks.map((l) => (
            <li key={l.to}>
              <NavLink
                to={l.to}
                className={({ isActive }) =>
                  cn(
                    'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive ? 'text-brand-700' : 'text-slate-600 hover:text-brand-700',
                  )
                }
              >
                {t(l.key)}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {/* Buscador (escritorio/tablet) */}
          {user?.role !== 'support' && <form onSubmit={submit} className="relative hidden md:block" role="search">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 150)}
              placeholder={t('nav.search')}
              aria-label={t('nav.search')}
              aria-expanded={focused && suggested.length > 0}
              className="h-10 w-44 rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none transition-all placeholder:text-slate-400 focus:w-64 focus:border-brand-400 focus:bg-white"
            />
            {focused && suggested.length > 0 && (
              <ul className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl" role="listbox">
                {suggested.map((s) => (
                  <li key={s.id} role="option">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { navigate(`/producto/${s.slug}`); setQuery(''); setSuggested([]); setFocused(false) }}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-brand-50"
                    >
                      <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="truncate font-medium text-slate-800">{s.name}</span>
                      <span className="ml-auto text-[10px] uppercase text-slate-400">{s.category}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </form>}

          {/* Buscar móvil */}
          {user?.role !== 'support' && <button
            onClick={() => setOpen(true)}
            className="rounded-xl p-2 text-slate-600 hover:bg-brand-50 hover:text-brand-700 md:hidden"
            aria-label={t('nav.search')}
          >
            <Search className="h-5 w-5" />
          </button>}

          {/* Selector de idioma */}
          <button
            onClick={() => setLang(lang === 'es' ? 'en' : 'es')}
            className="flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm font-bold text-slate-600 transition-colors hover:bg-brand-50 hover:text-brand-700"
            aria-label={t('nav.lang')}
            title={t('nav.lang')}
          >
            <Globe className="h-4 w-4" />
            <span className="uppercase">{lang}</span>
          </button>

          {user && (
            <Link
              to="/chat"
              className="relative rounded-xl p-2 text-slate-600 transition-colors hover:bg-brand-50 hover:text-brand-700"
              aria-label={t('nav.chat')}
            >
              <MessageCircle className="h-5 w-5" />
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Link>
          )}

          {user?.role !== 'support' && <Link
            to="/favoritos"
            className="relative rounded-xl p-2 text-slate-600 transition-colors hover:bg-brand-50 hover:text-brand-700"
            aria-label={t('nav.favorites')}
          >
            <Heart className="h-5 w-5" />
            {favorites.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {favorites.length}
              </span>
            )}
          </Link>}

          {user?.role !== 'support' && <Link
            to="/carrito"
            className="relative rounded-xl p-2 text-slate-600 transition-colors hover:bg-brand-50 hover:text-brand-700"
            aria-label={t('nav.cart')}
          >
            <ShoppingCart className="h-5 w-5" />
            {cartCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                {cartCount}
              </span>
            )}
          </Link>}

          {user ? (
            <div className="hidden items-center gap-2 sm:flex">
              <Link
                to={user.role === 'support' ? `/vendedor/${user.id}` : '/cuenta'}
                title={`${user.name} · ${user.email}`}
                aria-label={t('nav.account')}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white shadow-sm transition-transform hover:scale-105"
              >
                {user.name.charAt(0).toUpperCase()}
              </Link>
              <button
                onClick={handleLogout}
                className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-brand-50 hover:text-brand-700"
                aria-label={t('nav.logout')}
              >
                {t('nav.logout')}
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="hidden items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 sm:inline-flex"
            >
              <User className="h-4 w-4" />
              {t('nav.login')}
            </Link>
          )}

          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-xl p-2 text-slate-600 hover:bg-brand-50 hover:text-brand-700 lg:hidden"
            aria-label={open ? t('nav.closeSession') : t('nav.home')}
            aria-expanded={open}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </nav>

      {/* Panel móvil */}
      {open && (
        <div className="fixed inset-0 top-16 z-50 bg-slate-950/50 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)}>
          <div
            className="animate-fade-in mx-4 my-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {user?.role !== 'support' && <form onSubmit={submit} className="relative mb-4 md:hidden" role="search">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('nav.search')}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:bg-white"
              />
            </form>}
            <ul className="flex flex-col gap-1">
              {allLinks.map((l) => (
                <li key={l.to}>
                  <NavLink
                    to={l.to}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'block rounded-xl px-4 py-3 text-base font-medium',
                        isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-50',
                      )
                    }
                  >
                    {t(l.key)}
                  </NavLink>
                </li>
              ))}
              {user ? (
                <li className="border-t border-slate-100 pt-1">
                  <div className="flex items-center justify-between rounded-xl px-4 py-3">
                    <Link to={user.role === 'support' ? `/vendedor/${user.id}` : '/cuenta'} onClick={() => setOpen(false)} className="flex min-w-0 items-center gap-2 text-base font-semibold text-slate-700">
                      <User className="h-5 w-5 shrink-0 text-brand-600" />
                      <span className="truncate">{user.name}</span>
                    </Link>
                    <button
                      onClick={() => { setOpen(false); void handleLogout() }}
                      className="shrink-0 text-sm font-semibold text-brand-700 hover:underline"
                    >
                      {t('nav.logout')}
                    </button>
                  </div>
                </li>
              ) : (
                <li className="border-t border-slate-100 pt-1">
                  <NavLink
                    to="/login"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 rounded-xl px-4 py-3 text-base font-semibold text-brand-700 hover:bg-brand-50"
                  >
                    <User className="h-5 w-5" /> {t('nav.login')}
                  </NavLink>
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
    </header>
  )
}
