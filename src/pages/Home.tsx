import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CreditCard, Headphones, Rocket, ShieldCheck, Sparkles, Truck, Star, X } from 'lucide-react'
import { useCatalog } from '../context/CatalogContext'
import { CatalogError, CatalogSkeleton } from '../components/ui/CatalogState'
import { ProductCard } from '../components/ui/ProductCard'
import { useStore } from '../context/StoreContext'
import { useI18n } from '../context/I18nContext'
import { cn } from '../lib/cn'

const BANNER_KEY = 'verta.bannerDismissed'

export function Home() {
  const { notify } = useStore()
  const { t } = useI18n()
  const { products, categories, status, error, refresh } = useCatalog()
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [subscribed, setSubscribed] = useState(false)
  const [bannerVisible, setBannerVisible] = useState(() => {
    try {
      return localStorage.getItem(BANNER_KEY) !== '1'
    } catch {
      return true
    }
  })

  const featured = products.filter((p) => p.badge === 'top' || p.badge === 'popular').slice(0, 4)
  const onSale = products.filter((p) => p.oldPrice).slice(0, 4)

  if (status === 'error' && products.length === 0) {
    return <CatalogError message={error ?? t('cat.loadError')} onRetry={refresh} />
  }
  if (status === 'loading' && products.length === 0) {
    return <div className="mx-auto max-w-7xl px-4 py-16"><CatalogSkeleton cards={8} /></div>
  }

  const subscribe = (e: FormEvent) => {
    e.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError(t('home.newsError'))
      return
    }
    setEmailError('')
    setEmail('')
    setSubscribed(true)
    notify(t('home.newsDoneTitle'))
  }

  const dismissBanner = () => {
    setBannerVisible(false)
    try {
      localStorage.setItem(BANNER_KEY, '1')
    } catch {
      /* sin almacenamiento: solo se oculta en esta visita */
    }
  }

  const reviews = [
    { name: t('home.rev1.name'), text: t('home.rev1.text'), rating: 5 },
    { name: t('home.rev2.name'), text: t('home.rev2.text'), rating: 5 },
    { name: t('home.rev3.name'), text: t('home.rev3.text'), rating: 4 },
  ]

  const advantages = [
    { icon: Rocket, title: t('home.advShip'), text: t('home.advShipText') },
    { icon: ShieldCheck, title: t('home.advWarranty'), text: t('home.advWarrantyText') },
    { icon: CreditCard, title: t('home.advPay'), text: t('home.advPayText') },
    { icon: Headphones, title: t('home.advSupport'), text: t('home.advSupportText') },
  ]

  return (
    <div>
      {/* BANNER DE NOVEDADES */}
      {bannerVisible && (
        <div className="bg-gradient-to-r from-brand-700 via-brand-600 to-brand-800 text-white">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
            <Sparkles className="h-5 w-5 shrink-0 text-brand-200" aria-hidden="true" />
            <p className="min-w-0 flex-1 truncate text-sm sm:whitespace-normal">
              <span className="mr-2 rounded bg-white/20 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide">{t('home.bannerTag')}</span>
              <span className="font-semibold">{t('home.bannerTitle')}</span>
              <span className="hidden text-brand-100 sm:inline"> {t('home.bannerText')}</span>
            </p>
            <Link
              to="/productos"
              className="shrink-0 rounded-lg bg-white px-4 py-1.5 text-sm font-bold text-brand-800 transition-colors hover:bg-brand-50"
            >
              {t('home.bannerCta')}
            </Link>
            <button
              onClick={dismissBanner}
              className="shrink-0 rounded-lg p-1 text-brand-100 transition-colors hover:bg-white/10 hover:text-white"
              aria-label={t('home.bannerDismiss')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* HERO */}
      <section className="relative overflow-hidden bg-brand-950 text-white">
        <div className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-brand-400/10 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-brand-200 backdrop-blur">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-400" /> {t('home.heroBadge')}
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              {t('home.heroTitle1')} <span className="text-brand-400">{t('home.heroTitle2')}</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-300">
              {t('home.heroSub')}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/productos" className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-7 py-3.5 text-base font-bold text-white shadow-lg shadow-brand-500/30 transition-all hover:bg-brand-400 hover:shadow-brand-400/40">
                {t('home.heroCta')} <ArrowRight className="h-5 w-5" />
              </Link>
              <Link to="/categorias" className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-7 py-3.5 text-base font-semibold text-white backdrop-blur transition-colors hover:bg-white/10">
                {t('home.heroCta2')}
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap gap-6 text-sm text-slate-300">
              <div className="flex items-center gap-2"><Truck className="h-5 w-5 text-brand-400" /> {t('home.heroShip')}</div>
              <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-brand-400" /> {t('home.heroWarranty')}</div>
              <div className="flex items-center gap-2"><Star className="h-5 w-5 text-brand-400" /> {t('home.heroRating')}</div>
            </div>
          </div>
          <div className="animate-fade-in hidden lg:block">
            <div className="relative mx-auto aspect-square max-w-md rounded-3xl bg-gradient-to-br from-brand-700 to-brand-950 p-2 shadow-2xl">
              <div className="flex h-full w-full items-center justify-center rounded-2xl bg-brand-800/40">
                <svg viewBox="0 0 24 24" className="h-40 w-40 text-brand-200" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CATEGORÍAS */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6" aria-label={t('home.shopByCategory')}>
        <div className="mb-8 flex items-end justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">{t('home.explore')}</p>
            <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{t('home.shopByCategory')}</h2>
          </div>
          <Link to="/categorias" className="hidden items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800 sm:inline-flex">
            {t('home.seeAll')} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {categories.map((c) => (
            <Link
              key={c.id}
              to={`/productos?categoria=${c.id}`}
              className="group rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm transition-all hover:-translate-y-1 hover:border-brand-300 hover:shadow-lg"
            >
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-600 group-hover:text-white">
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" />
                </svg>
              </div>
              <p className="font-semibold text-slate-800">{c.name}</p>
              <p className="mt-0.5 text-xs text-slate-500">{c.tagline}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* DESTACADOS */}
      <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6" aria-label={t('home.featured')}>
        <div className="mb-8 flex items-end justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">{t('home.bestSellers')}</p>
            <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{t('home.featured')}</h2>
          </div>
          <Link to="/productos" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800">
            {t('home.seeAll')} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {featured.map((p) => (
            <ProductCard key={p.id} product={p} className="animate-fade-up" />
          ))}
        </div>
      </section>

      {/* OFERTAS */}
      <section className="bg-slate-100/70 py-14" aria-label={t('home.onSale')}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-8 flex items-end justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-red-500">{t('home.discounts')}</p>
              <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{t('home.onSale')}</h2>
            </div>
            <Link to="/ofertas" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800">
              {t('home.seeOffers')} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {onSale.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      </section>

      {/* VENTAJAS */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6" aria-label={t('home.advShip')}>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {advantages.map((f, i) => (
            <div key={i} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                <f.icon className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-slate-900">{f.title}</h3>
              <p className="mt-1 text-sm text-slate-500">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* BANNER PROMOCIONAL */}
      <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-brand-700 to-brand-900 p-10 text-white sm:p-14">
          <div className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 rounded-full bg-brand-400/20 blur-3xl" />
          <div className="relative flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div>
              <p className="text-sm font-bold uppercase tracking-widest text-brand-200">{t('home.promoBadge')}</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{t('home.promoTitle')}</h2>
              <p className="mt-2 text-brand-100">{t('home.promoSub')} <span className="rounded bg-white/20 px-2 py-0.5 font-mono font-bold">VERTA10</span> {t('home.promoCode')}</p>
            </div>
            <Link to="/ofertas" className="shrink-0 rounded-xl bg-white px-7 py-3.5 text-base font-bold text-brand-800 shadow-lg transition-all hover:bg-brand-50">
              {t('home.goOffers')}
            </Link>
          </div>
        </div>
      </section>

      {/* OPINIONES */}
      <section className="bg-slate-100/70 py-14" aria-label={t('home.reviewsTitle')}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-8 text-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">{t('home.reviewsEyebrow')}</p>
            <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{t('home.reviewsTitle')}</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {reviews.map((r, i) => (
              <div key={i} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex gap-0.5 text-amber-400">
                  {Array.from({ length: r.rating }).map((_, j) => (
                    <Star key={j} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <p className="mt-3 text-slate-600">"{r.text}"</p>
                <p className="mt-4 font-semibold text-slate-900">— {r.name}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* NEWSLETTER */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          {subscribed ? (
            <div className="animate-fade-up rounded-2xl border border-brand-200 bg-brand-50 p-8">
              <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">{t('home.newsDoneTitle')}</h2>
              <p className="mt-2 text-slate-600">{t('home.newsDoneSub')}</p>
              <ul className="mt-5 space-y-2 text-left text-sm text-slate-700">
                {['home.newsUnlocked1', 'home.newsUnlocked2', 'home.newsUnlocked3', 'home.newsUnlocked4'].map((key) => (
                  <li key={key} className="flex items-start gap-2 rounded-xl bg-white px-4 py-2.5 shadow-sm">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                    <span>{t(key)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{t('home.newsTitle')}</h2>
              <p className="mt-2 text-slate-500">{t('home.newsSub')}</p>
              <form onSubmit={subscribe} noValidate className="mt-6 flex flex-col gap-3 sm:flex-row">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setEmailError('') }}
                  placeholder={t('home.newsPlaceholder')}
                  aria-label={t('home.newsPlaceholder')}
                  className={cn('h-12 flex-1 rounded-xl border bg-white px-4 text-sm outline-none transition-colors focus:border-brand-400', emailError ? 'border-red-300' : 'border-slate-200')}
                />
                <button type="submit" className="h-12 rounded-xl bg-brand-600 px-6 font-bold text-white transition-colors hover:bg-brand-700">
                  {t('home.newsButton')}
                </button>
              </form>
              {emailError && <p className="mt-2 text-left text-sm text-red-500">{emailError}</p>}
            </>
          )}
        </div>
      </section>
    </div>
  )
}
