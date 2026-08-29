import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Download, Package, ShieldCheck, Sparkles, Zap } from 'lucide-react'
import { useCatalog } from '../context/CatalogContext'
import { useStore } from '../context/StoreContext'
import { useI18n } from '../context/I18nContext'
import { getBundleBySlug, bundleProducts, bundleRegularTotal, bundlePriceOf, bundleSavings, bundleSavingsPercent } from '../data/bundles'
import { ProductImage } from '../components/ui/ProductImage'
import { Price } from '../components/ui/Price'
import { formatPrice } from '../lib/currency'
import { useRegion } from '../context/RegionContext'

export function BundleDetail() {
  const { slug } = useParams<{ slug: string }>()
  const { products } = useCatalog()
  const { addBundleToCart, notify } = useStore()
  const { t } = useI18n()
  const { region } = useRegion()

  const bundle = slug ? getBundleBySlug(slug) : undefined

  if (!bundle) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col items-center px-4 py-24 text-center">
        <Package className="h-12 w-12 text-slate-300" />
        <h1 className="mt-4 text-2xl font-extrabold text-slate-900">{t('bundles.notFound')}</h1>
        <Link to="/bundles" className="mt-6 rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white hover:bg-emerald-700">
          {t('bundles.back')}
        </Link>
      </div>
    )
  }

  const items = bundleProducts(bundle, products)
  const regular = bundleRegularTotal(bundle, products)
  const price = bundlePriceOf(bundle)
  const savings = bundleSavings(bundle, products)
  const pct = bundleSavingsPercent(bundle, products)

  const buy = () => {
    if (items.length === 0) {
      notify(t('bundles.unavailable'), 'info')
      return
    }
    addBundleToCart({
      slug: bundle.slug,
      name: bundle.name,
      image: bundle.image,
      price: bundle.bundlePrice,
      productSlugs: bundle.productSlugs,
    })
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <Link to="/bundles" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:underline">
        <ArrowLeft className="h-4 w-4" /> {t('bundles.back')}
      </Link>

      {/* Cabecera del bundle */}
      <div className="mt-6 grid gap-8 lg:grid-cols-[420px_1fr]">
        <div className="relative h-72 overflow-hidden rounded-3xl border border-slate-200 shadow-lg lg:h-full lg:min-h-[380px]">
          <ProductImage src={bundle.image} fallback="monitor" name={bundle.name} eager />
          <span className="absolute left-4 top-4 rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-extrabold text-white shadow">
            {t('bundles.save')} {pct}%
          </span>
        </div>

        <div className="flex flex-col">
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-4 py-1.5 text-xs font-extrabold uppercase tracking-wider text-emerald-700">
            <Sparkles className="h-3.5 w-3.5" /> Verta Bundle
          </span>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">{bundle.name}</h1>
          <p className="mt-2 text-lg font-medium text-emerald-700">{bundle.tagline}</p>
          <p className="mt-3 max-w-2xl leading-relaxed text-slate-600">{bundle.description}</p>

          <div className="mt-6 flex flex-wrap gap-6">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">{t('bundles.regular')}</p>
              <p className="text-lg font-bold text-slate-400 line-through">{formatPrice(regular, region)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">{t('bundles.bundlePrice')}</p>
              <Price price={price} size="lg" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">{t('bundles.youSave')}</p>
              <p className="text-lg font-extrabold text-emerald-600">-{formatPrice(savings, region)}</p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={buy}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-8 py-3.5 font-bold text-white shadow-lg shadow-emerald-600/20 transition-all hover:scale-[1.02] hover:bg-emerald-700"
            >
              <Zap className="h-5 w-5" /> {t('bundles.buyBundle')} · {formatPrice(price, region)}
            </button>
            <Link
              to="/carrito"
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-600 px-6 py-3.5 font-bold text-emerald-700 transition-colors hover:bg-emerald-50"
            >
              {t('bundles.viewCart')}
            </Link>
          </div>

          <div className="mt-6 flex flex-wrap gap-4 text-sm text-slate-500">
            <span className="inline-flex items-center gap-1.5"><Zap className="h-4 w-4 text-emerald-600" /> {t('bundles.instantDelivery')}</span>
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-600" /> {t('bundles.license')}</span>
            <span className="inline-flex items-center gap-1.5"><Download className="h-4 w-4 text-emerald-600" /> {items.length} {t('bundles.products')}</span>
          </div>
        </div>
      </div>

      {/* Productos incluidos */}
      <section className="mt-14">
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">{t('bundles.includedTitle')}</h2>
        <p className="mt-1 text-slate-500">{t('bundles.includedSubtitle')}</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <Link
              key={p.slug}
              to={`/producto/${p.slug}`}
              className="group flex gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
            >
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-50">
                <ProductImage src={p.image} fallback={p.category} name={p.name} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-800 group-hover:text-emerald-700">{p.name}</p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                  <Download className="h-3 w-3" /> {p.fileType} · {p.fileSize}
                </p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-base font-extrabold text-slate-900">{formatPrice(p.price, region)}</span>
                  {p.oldPrice && p.oldPrice > p.price && (
                    <span className="text-xs text-slate-400 line-through">{formatPrice(p.oldPrice, region)}</span>
                  )}
                </div>
              </div>
              <Check className="mt-1 h-5 w-5 shrink-0 text-emerald-600" />
            </Link>
          ))}
        </div>

        {/* Resumen del ahorro */}
        <div className="mt-8 flex flex-col items-center gap-4 rounded-3xl bg-gradient-to-br from-emerald-950 to-emerald-800 px-6 py-8 text-center text-white sm:flex-row sm:justify-between sm:text-left">
          <div>
            <p className="text-sm uppercase tracking-wider text-emerald-200">{t('bundles.regular')} · {items.length} {t('bundles.products')}</p>
            <p className="mt-1 text-xl font-extrabold text-slate-300 line-through">{formatPrice(regular, region)}</p>
          </div>
          <div className="text-center">
            <p className="text-sm uppercase tracking-wider text-emerald-200">{t('bundles.bundlePrice')}</p>
            <p className="mt-1 text-4xl font-extrabold text-white">{formatPrice(price, region)}</p>
          </div>
          <div className="text-center">
            <p className="text-sm uppercase tracking-wider text-emerald-200">{t('bundles.youSave')}</p>
            <p className="mt-1 text-3xl font-extrabold text-emerald-300">-{formatPrice(savings, region)}</p>
            <p className="text-xs font-bold text-emerald-200">{pct}% {t('bundles.save')}</p>
          </div>
          <button
            onClick={buy}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 font-bold text-emerald-900 shadow-lg transition-transform hover:scale-[1.03]"
          >
            <Zap className="h-5 w-5" /> {t('bundles.buyBundle')}
          </button>
        </div>
      </section>
    </div>
  )
}
