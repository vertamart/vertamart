import { useEffect, useState, type FormEvent } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Globe, Heart, LayoutDashboard, Menu, MessageCircle, Search, ShoppingCart, User, X } from 'lucide-react'
import { storeService } from '../../api/services/store'
import { useStore } from '../../context/StoreContext'
import { useAuth } from '../../context/AuthContext'
import { useCatalog } from '../../context/CatalogContext'
import { useI18n } from '../../context/I18nContext'
import { cn } from '../../lib/cn'

const linkKeys = [
  { to: '/', key: 'nav.home' },
  { to: '/productos', key: 'nav.products' },
  { to: '/bundles', key: 'nav.bundles' },
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
  // El botón Panel se inserta en la posición 4 para que siempre quepa en la barra de escritorio.
  const allLinks = user?.role === 'support'
    ? [{ to: '/chat', key: 'nav.chat' }, { to: `/vendedor/${user.id}`, key: 'nav.account' }]
    : user?.role === 'admin'
      ? [...linkKeys.slice(0, 4), { to: '/panel', key: 'nav.panel' }, ...linkKeys.slice(4)]
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

  const Logo = (
    <Link to="/" className="flex shrink-0 items-center gap-2" aria-label="Vertamart">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3c2 0 3.5 1 4.5 3l4 10-3-1-1.5-4H8l-1.5 4-3 1 4-10C8.5 4 10 3 12 3z" />
        </svg>
      </span>
      <span className="text-xl font-extrabold tracking-tight text-slate-900">
        Verta<span className="text-brand-600">mart</span>
      </span>
    </Link>
  )

  const SearchBox = ({ mobile = false }: { mobile?: boolean }) => (
    <form onSubmit={submit} className={cn('relative', mobile ? 'w-full' : 'hidden w-40 min-w-0 flex-1 xl:block xl:max-w-[19rem]')} role="search">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={t('nav.search')}
        aria-label={t('nav.search')}
        aria-expanded={focused && suggested.length > 0}
        className={cn(
          'h-10 rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none transition-all placeholder:text-slate-400 focus:border-brand-400 focus:bg-white',
          mobile ? 'w-full' : 'w-full',
        )}
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
    </form>
  )

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-md">
      <nav className="page-container flex h-16 items-center gap-2 sm:gap-3 lg:gap-4" aria-label="Principal">
        {Logo}

        {/* Navegación escritorio: solo a partir de xl para que nunca desborde en lg */}
        <ul className="hidden min-w-0 items-center gap-0.5 xl:flex">
          {allLinks.slice(0, 7).map((l) => (
            <li key={l.to} className="shrink-0">
              <NavLink
                to={l.to}
                className={({ isActive }) =>
                  l.key === 'nav.panel'
                    ? cn(
                        'inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-bold text-white whitespace-nowrap shadow-sm transition-all hover:bg-brand-700',
                        isActive && 'ring-2 ring-brand-300 ring-offset-1',
                      )
                    : cn(
                        'rounded-lg px-2.5 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                        isActive ? 'text-brand-700' : 'text-slate-600 hover:text-brand-700',
                      )
                }
              >
                {l.key === 'nav.panel' && <LayoutDashboard className="h-3.5 w-3.5" />}
                {t(l.key)}
              </NavLink>
            </li>
          ))}
          {allLinks.length > 7 && (
            <li className="shrink-0">
              <NavLink
                to={allLinks[7].to}
                className={({ isActive }) =>
                  allLinks[7].key === 'nav.panel'
                    ? cn(
                        'inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-bold text-white whitespace-nowrap shadow-sm transition-all hover:bg-brand-700',
                        isActive && 'ring-2 ring-brand-300 ring-offset-1',
                      )
                    : cn(
                        'rounded-lg px-2.5 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                        isActive ? 'text-brand-700' : 'text-slate-600 hover:text-brand-700',
                      )
                }
              >
                {allLinks[7].key === 'nav.panel' && <LayoutDashboard className="h-3.5 w-3.5" />}
                {t(allLinks[7].key)}
              </NavLink>
            </li>
          )}
        </ul>

        <div className="ml-auto flex min-w-0 items-center justify-end gap-0.5 sm:gap-1.5">
          {/* Buscador escritorio */}
          {user?.role !== 'support' && <SearchBox />}

          {/* Buscar móvil/tablet: icono que abre el panel */}
          {user?.role !== 'support' && (
            <button
              onClick={() => setOpen(true)}
              className="rounded-xl p-2 text-slate-600 hover:bg-brand-50 hover:text-brand-700 xl:hidden"
              aria-label={t('nav.search')}
            >
              <Search className="h-5 w-5" />
            </button>
          )}

          {/* Selector de idioma */}
          <button
            onClick={() => setLang(lang === 'es' ? 'en' : 'es')}
            className="flex shrink-0 items-center gap-1.5 rounded-xl px-2 py-2 text-sm font-bold text-slate-600 transition-colors hover:bg-brand-50 hover:text-brand-700"
            aria-label={t('nav.lang')}
            title={t('nav.lang')}
          >
            <Globe className="h-4 w-4" />
            <span className="hidden uppercase sm:inline">{lang}</span>
          </button>

          {user && (
            <Link
              to="/chat"
              className="relative shrink-0 rounded-xl p-2 text-slate-600 transition-colors hover:bg-brand-50 hover:text-brand-700"
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

          {user?.role !== 'support' && (
            <Link
              to="/favoritos"
              className="relative hidden shrink-0 rounded-xl p-2 text-slate-600 transition-colors hover:bg-brand-50 hover:text-brand-700 sm:inline-flex"
              aria-label={t('nav.favorites')}
            >
              <Heart className="h-5 w-5" />
              {favorites.length > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {favorites.length}
                </span>
              )}
            </Link>
          )}

          {user?.role !== 'support' && (
            <Link
              to="/carrito"
              className="relative shrink-0 rounded-xl p-2 text-slate-600 transition-colors hover:bg-brand-50 hover:text-brand-700"
              aria-label={t('nav.cart')}
            >
              <ShoppingCart className="h-5 w-5" />
              {cartCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                  {cartCount}
                </span>
              )}
            </Link>
          )}

          {user ? (
            <div className="hidden shrink-0 items-center gap-1.5 md:flex">
              <Link
                to={user.role === 'support' ? `/vendedor/${user.id}` : '/cuenta'}
                title={`${user.name} · ${user.email}`}
                aria-label={t('nav.account')}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white shadow-sm transition-transform hover:scale-105"
              >
                {user.name.charAt(0).toUpperCase()}
              </Link>
            </div>
          ) : (
            <Link
              to="/login"
              className="hidden shrink-0 items-center gap-2 rounded-xl bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 md:inline-flex"
            >
              <User className="h-4 w-4" />
              <span className="whitespace-nowrap">{t('nav.login')}</span>
            </Link>
          )}

          <button
            onClick={() => setOpen((v) => !v)}
            className="shrink-0 rounded-xl p-2 text-slate-600 hover:bg-brand-50 hover:text-brand-700 xl:hidden"
            aria-label={open ? t('nav.closeSession') : t('nav.home')}
            aria-expanded={open}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </nav>

      {/* Panel móvil / tablet (hasta xl) */}
      {open && (
        <div className="fixed inset-0 top-16 z-50 bg-slate-950/50 backdrop-blur-sm xl:hidden" onClick={() => setOpen(false)}>
          <div
            className="animate-scale-in mx-auto my-4 max-h-[calc(100vh-6rem)] w-[min(94vw,30rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {user?.role !== 'support' && (
              <div className="mb-4">
                <SearchBox mobile />
              </div>
            )}
            <ul className="flex flex-col gap-0.5">
              {allLinks.map((l) => (
                <li key={l.to}>
                  <NavLink
                    to={l.to}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      l.key === 'nav.panel'
                        ? cn(
                            'mt-1 flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-base font-bold text-white shadow-sm',
                            isActive && 'ring-2 ring-brand-300',
                          )
                        : cn(
                            'block rounded-xl px-4 py-3 text-base font-medium',
                            isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-50',
                          )
                    }
                  >
                    {l.key === 'nav.panel' && <LayoutDashboard className="h-4 w-4" />}
                    {t(l.key)}
                  </NavLink>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-3">
              <button
                onClick={() => setLang(lang === 'es' ? 'en' : 'es')}
                className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Globe className="h-4 w-4 text-brand-600" /> {lang === 'es' ? 'Español (ES)' : 'English (EN)'}
              </button>
              {user ? (
                <button
                  onClick={() => { setOpen(false); void handleLogout() }}
                  className="rounded-xl px-3 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50"
                >
                  {t('nav.logout')}
                </button>
              ) : null}
            </div>
            {user ? (
              <Link
                to={user.role === 'support' ? `/vendedor/${user.id}` : '/cuenta'}
                onClick={() => setOpen(false)}
                className="mt-2 flex items-center gap-3 rounded-xl bg-brand-50 p-3"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                  {user.name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-slate-800">{user.name}</span>
                  <span className="block truncate text-xs text-slate-500">{user.email}</span>
                </span>
              </Link>
            ) : (
              <NavLink
                to="/login"
                onClick={() => setOpen(false)}
                className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-base font-semibold text-white hover:bg-slate-800"
              >
                <User className="h-5 w-5" /> {t('nav.login')}
              </NavLink>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
