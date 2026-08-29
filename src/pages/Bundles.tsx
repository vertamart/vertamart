import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Package, Plus, Sparkles, X } from 'lucide-react'
import { useCatalog } from '../context/CatalogContext'
import { useStore } from '../context/StoreContext'
import { useI18n } from '../context/I18nContext'
import { BUNDLES, bundlePriceOf, bundleProducts, bundleRegularTotal, bundleSavings, bundleSavingsPercent, customBundleDiscount, customBundlePrice } from '../data/bundles'
import { ProductImage } from '../components/ui/ProductImage'
import { Price } from '../components/ui/Price'
import { formatPrice } from '../lib/currency'
import { useRegion } from '../context/RegionContext'
import { cn } from '../lib/cn'

export function Bundles() {
  const { products } = useCatalog()
  const { addBundleToCart, notify } = useStore()
  const { t } = useI18n()
  const { region } = useRegion()

  /* ---------------------- Crea tu propio bundle ---------------------- */
  const [selected, setSelected] = useState<string[]>([])

  const toggleSelect = (slug: string) => {
    setSelected((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]))
  }

  const customItems = useMemo(
    () => selected.map((slug) => products.find((p) => p.slug === slug)).filter((p): p is NonNullable<typeof p> => !!p),
    [selected, products],
  )
  const customRegular = customItems.reduce((s, p) => s + p.price, 0)
  const customDiscount = customBundleDiscount(customItems.length)
  const customFinal = customBundlePrice(customItems)

  const addCustomBundle = () => {
    if (customItems.length < 2) {
      notify(t('bundles.minProducts'), 'info')
      return
    }
    addBundleToCart({
      slug: 'custom',
      name: t('bundles.customName'),
      image: customItems[0]?.image ?? '',
      price: customFinal,
      productSlugs: customItems.map((p) => p.slug),
    })
  }

  const addBundle = (slug: string) => {
    const bundle = BUNDLES.find((b) => b.slug === slug)
    if (!bundle) return
    const items = bundleProducts(bundle, products)
    if (items.length === 0) {
      notify(t('bundles.unavailable'), 'info')
      return
    }
    addBundleToCart({
      slug: bundle.slug,
      name: bundle.name,
      image: bundle.image,
      price: bundlePriceOf(bundle),
      productSlugs: bundle.productSlugs,
    })
  }

  const tiers = [
    { count: 2, pct: 10 },
    { count: 3, pct: 15 },
    { count: 5, pct: 25 },
    { count: 8, pct: 35 },
  ]

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950 via-emerald-900 to-emerald-700 px-6 py-14 text-center text-white sm:px-12">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-emerald-300/10 blur-3xl" />
        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider backdrop-blur">
          <Sparkles className="h-3.5 w-3.5" /> Verta Bundles
        </span>
        <h1 className="mx-auto mt-5 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-5xl">
          {t('bundles.title')}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-emerald-100">
          {t('bundles.subtitle')}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href="#crear-bundle"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-bold text-emerald-900 shadow-lg transition-transform hover:scale-[1.02]"
          >
            <Plus className="h-5 w-5" /> {t('bundles.buildOwn')}
          </a>
          <a href="#bundles" className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/20 px-6 py-3 font-bold text-white ring-1 ring-white/30 transition-colors hover:bg-emerald-500/30">
            <Package className="h-5 w-5" /> {t('bundles.viewPacks')}
          </a>
        </div>
      </div>

      {/* Listado de bundles */}
      <section id="bundles" className="mt-14 scroll-mt-24">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{t('bundles.packsTitle')}</h2>
            <p className="mt-1 text-slate-500">{t('bundles.packsSubtitle')}</p>
          </div>
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {BUNDLES.map((bundle) => {
            const items = bundleProducts(bundle, products)
            const regular = bundleRegularTotal(bundle, products)
            const price = bundlePriceOf(bundle)
            const savings = bundleSavings(bundle, products)
            const pct = bundleSavingsPercent(bundle, products)
            return (
              <article
                key={bundle.id}
                className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl"
              >
                <div className="relative h-44 overflow-hidden">
                  <ProductImage src={bundle.image} fallback="monitor" name={bundle.name} />
                  <span className="absolute left-3 top-3 rounded-full bg-emerald-600 px-3 py-1 text-xs font-extrabold text-white shadow">
                    {t('bundles.save')} {pct}%
                  </span>
                  {bundle.featured && (
                    <span className="absolute right-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-extrabold text-emerald-700 shadow backdrop-blur">
                      ⭐ {t('bundles.featured')}
                    </span>
                  )}
                </div>

                <div className="flex flex-1 flex-col p-5">
                  <h3 className="text-lg font-extrabold text-slate-900">{bundle.name}</h3>
                  <p className="mt-0.5 text-sm text-slate-500">{bundle.tagline}</p>

                  {/* Vista previa de productos */}
                  <div className="mt-4 flex -space-x-2">
                    {items.slice(0, 5).map((p) => (
                      <div key={p.slug} className="h-9 w-9 overflow-hidden rounded-full border-2 border-white bg-slate-100" title={p.name}>
                        <ProductImage src={p.image} fallback={p.category} name={p.name} />
                      </div>
                    ))}
                    <span className="ml-2 inline-flex items-center text-xs font-semibold text-slate-400">
                      {items.length} {t('bundles.products')}
                    </span>
                  </div>

                  <div className="mt-4 space-y-1.5">
                    {items.slice(0, 3).map((p) => (
                      <p key={p.slug} className="flex items-center gap-2 text-xs text-slate-600">
                        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        {p.name}
                      </p>
                    ))}
                    {items.length > 3 && (
                      <p className="text-xs font-semibold text-slate-400">+{items.length - 3} {t('bundles.more')}</p>
                    )}
                  </div>

                  <div className="mt-5 flex items-baseline justify-between border-t border-slate-100 pt-4">
                    <div>
                      <p className="text-xs text-slate-400">{t('bundles.regular')}</p>
                      <p className="text-sm font-bold text-slate-400 line-through">{formatPrice(regular, region)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400">{t('bundles.bundlePrice')}</p>
                      <Price price={price} size="lg" />
                    </div>
                  </div>
                  <p className="mt-2 text-center text-xs font-bold text-emerald-700">
                    {t('bundles.youSave')} {formatPrice(savings, region)}
                  </p>

                  <div className="mt-4 flex gap-2">
                    <Link
                      to={`/bundle/${bundle.slug}`}
                      className="flex-1 rounded-xl border border-emerald-600 px-4 py-2.5 text-center text-sm font-bold text-emerald-700 transition-colors hover:bg-emerald-50"
                    >
                      {t('bundles.details')}
                    </Link>
                    <button
                      onClick={() => addBundle(bundle.slug)}
                      className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-700"
                    >
                      {t('bundles.buyBundle')}
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      {/* Crea tu propio bundle */}
      <section id="crear-bundle" className="mt-16 scroll-mt-24 overflow-hidden rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 sm:p-10">
        <div className="grid gap-10 lg:grid-cols-[1fr_360px]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-extrabold uppercase tracking-wider text-white">
              <Sparkles className="h-3.5 w-3.5" /> {t('bundles.buildOwn')}
            </span>
            <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{t('bundles.customTitle')}</h2>
            <p className="mt-2 max-w-xl text-slate-500">{t('bundles.customSubtitle')}</p>

            {/* Escalones de descuento */}
            <div className="mt-6 flex flex-wrap gap-2">
              {tiers.map((tier) => (
                <div
                  key={tier.count}
                  className={cn(
                    'rounded-xl border px-3.5 py-2 text-center',
                    customItems.length >= tier.count ? 'border-emerald-500 bg-emerald-600 text-white shadow' : 'border-slate-200 bg-white text-slate-600',
                  )}
                >
                  <p className="text-sm font-extrabold">{tier.count}+ {tier.count === 8 ? t('bundles.products') : t('bundles.products')}</p>
                  <p className="text-xs opacity-80">-{tier.pct}%</p>
                </div>
              ))}
            </div>

            {/* Selector de productos */}
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {products
                .filter((p) => p.status !== 'hidden')
                .map((p) => {
                  const isIn = selected.includes(p.slug)
                  return (
                    <button
                      key={p.slug}
                      onClick={() => toggleSelect(p.slug)}
                      className={cn(
                        'flex items-center gap-3 rounded-xl border p-3 text-left transition-all',
                        isIn ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/30' : 'border-slate-200 bg-white hover:border-emerald-300',
                      )}
                    >
                      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                        <ProductImage src={p.image} fallback={p.category} name={p.name} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-800">{p.name}</p>
                        <p className="text-xs text-slate-400">{p.category}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-slate-700">{formatPrice(p.price, region)}</span>
                        {isIn ? (
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white">
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        ) : (
                          <span className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-slate-400">
                            <Plus className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
            </div>
          </div>

          {/* Resumen en vivo */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
              <h3 className="text-lg font-extrabold text-slate-900">{t('bundles.yourBundle')}</h3>
              <div className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
                {customItems.length === 0 ? (
                  <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-400">{t('bundles.emptySelection')}</p>
                ) : (
                  customItems.map((p) => (
                    <div key={p.slug} className="flex items-center gap-3 rounded-xl bg-slate-50 p-2.5">
                      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                        <ProductImage src={p.image} fallback={p.category} name={p.name} />
                      </div>
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">{p.name}</p>
                      <button onClick={() => toggleSelect(p.slug)} className="rounded-full p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600" aria-label="Quitar">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-sm">
                <div className="flex justify-between text-slate-500">
                  <span>{t('bundles.regular')}</span>
                  <span className="font-semibold text-slate-700">{formatPrice(customRegular, region)}</span>
                </div>
                {customDiscount > 0 && (
                  <div className="flex justify-between font-semibold text-emerald-700">
                    <span>{t('bundles.discount')} (-{customDiscount}%)</span>
                    <span>-{formatPrice(customRegular - customFinal, region)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-extrabold text-slate-900">
                  <span>{t('bundles.total')}</span>
                  <span>{formatPrice(customFinal, region)}</span>
                </div>
              </div>

              <button
                onClick={addCustomBundle}
                disabled={customItems.length < 2}
                className="mt-5 w-full rounded-xl bg-emerald-600 px-5 py-3 font-bold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {customItems.length < 2 ? t('bundles.minProducts') : `${t('bundles.addCustom')} · ${formatPrice(customFinal, region)}`}
              </button>
              <p className="mt-3 text-center text-xs text-slate-400">
                {t('bundles.liveUpdate')}
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
