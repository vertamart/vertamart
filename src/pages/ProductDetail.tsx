import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Check, Copy, Download, FileArchive, Heart, MessageSquare, Minus, Plus, RefreshCcw, Send, ShieldCheck, ShoppingCart, Star, Trash2, Zap } from 'lucide-react'
import { useCatalog } from '../context/CatalogContext'
import { CatalogError } from '../components/ui/CatalogState'
import { useStore } from '../context/StoreContext'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../context/I18nContext'
import { storeService, type ProductReview } from '../api/services/store'
import { ProductImage } from '../components/ui/ProductImage'
import { ProductCard } from '../components/ui/ProductCard'
import { Price } from '../components/ui/Price'
import { Rating } from '../components/ui/Rating'
import { DiscountBadge } from '../components/ui/DiscountBadge'
import { Button } from '../components/ui/Button'
import { ImageUpload } from '../components/ui/ImageUpload'
import { formatDate } from '../lib/format'
import { cn } from '../lib/cn'

export function ProductDetail() {
  const { slug } = useParams<{ slug: string }>()
  const { products, status, error, refresh } = useCatalog()
  const product = useMemo(() => products.find((p) => p.slug === slug) ?? null, [products, slug])
  const { addToCart, toggleFavorite, isFavorite, notify } = useStore()
  const { user } = useAuth()
  const { t } = useI18n()
  const [qty, setQty] = useState(1)
  const [activeImg, setActiveImg] = useState(0)
  const [reviews, setReviews] = useState<ProductReview[]>([])
  const [reviewsLoading, setReviewsLoading] = useState(true)
  const [myRating, setMyRating] = useState(0)
  const [myText, setMyText] = useState('')
  const [myImage, setMyImage] = useState('')
  const [reviewErrors, setReviewErrors] = useState<Record<string, string>>({})
  const [savingReview, setSavingReview] = useState(false)
  const [copied, setCopied] = useState(false)
  const [claimingFree, setClaimingFree] = useState(false)
  const [freeClaimed, setFreeClaimed] = useState(false)

  const claimFree = async () => {
    if (!user) {
      notify('Inicia sesión para descargar este producto gratuito', 'info')
      return
    }
    setClaimingFree(true)
    try {
      const res = await storeService.freeProduct(product!.id)
      setFreeClaimed(true)
      notify(`¡Producto añadido a tu biblioteca! Licencia: ${res.licenseKey}`, 'success')
    } catch (e) {
      const msg = e instanceof Error && e.message.includes('409') ? 'Ya tienes este producto en tu biblioteca' : 'No se pudo añadir el producto. Inténtalo de nuevo.'
      notify(msg, 'info')
    } finally {
      setClaimingFree(false)
    }
  }

  useEffect(() => {
    setQty(1)
    setActiveImg(0)
    setMyRating(0)
    setMyText('')
    setReviewErrors({})
  }, [slug])

  // Carga las reseñas del producto (si la API no responde, lista vacía sin romper la página)
  useEffect(() => {
    if (!product) return
    let cancelled = false
    setReviewsLoading(true)
    storeService
      .getReviews(product.id)
      .then((res) => {
        if (!cancelled) setReviews(res.items)
      })
      .catch(() => {
        if (!cancelled) setReviews([])
      })
      .finally(() => {
        if (!cancelled) setReviewsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [product?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const submitReview = async (e: FormEvent) => {
    e.preventDefault()
    if (!product || !user) return
    const er: Record<string, string> = {}
    if (myRating < 1) er.rating = t('review.needRating')
    if (myText.trim().length < 3) er.content = t('review.needText')
    setReviewErrors(er)
    if (Object.keys(er).length > 0) return

    setSavingReview(true)
    try {
      await storeService.addReview(product.id, myRating, myText.trim(), myImage || undefined)
      const res = await storeService.getReviews(product.id)
      setReviews(res.items)
      setMyRating(0)
      setMyText('')
      setMyImage('')
      setReviewErrors({})
      refresh() // actualiza la valoración media del producto en el catálogo
      notify(t('review.thanks'))
    } catch {
      notify(t('review.error'), 'info')
    } finally {
      setSavingReview(false)
    }
  }

  const removeMyReview = async () => {
    if (!product || !user) return
    try {
      await storeService.deleteMyReview(product.id)
      setReviews((prev) => prev.filter((r) => r.userId !== user.id))
      refresh()
      notify(t('review.deleted'), 'info')
    } catch {
      notify(t('review.error'), 'info')
    }
  }

  const related = useMemo(
    () => (product ? products.filter((x) => x.id !== product.id && x.category === product.category).slice(0, 4) : []),
    [products, product],
  )

  if (status === 'error' && !product) {
    return <CatalogError message={error ?? 'No pudimos cargar el producto.'} onRetry={refresh} />
  }
  if (status === 'loading' && !product) {
    return <div className="mx-auto max-w-7xl px-4 py-24 text-center text-slate-400">Cargando producto…</div>
  }

  if (!product) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col items-center px-4 py-24 text-center">
        <h1 className="text-2xl font-extrabold text-slate-900">Producto no encontrado</h1>
        <p className="mt-2 text-slate-500">El producto que buscas no existe o fue removido.</p>
        <Link to="/productos" className="mt-6 rounded-xl bg-brand-600 px-6 py-3 font-bold text-white hover:bg-brand-700">
          Volver al catálogo
        </Link>
      </div>
    )
  }

  const fav = isFavorite(product.id)

  const buyNow = () => {
    addToCart(product.id, qty)
    notify('Redirigiendo al carrito...', 'info')
    window.location.href = '/carrito'
  }

  const digitalFacts = [
    { icon: FileArchive, label: 'Formato', value: product.fileType },
    { icon: Download, label: 'Tamaño', value: product.fileSize },
    { icon: Check, label: 'Compatibilidad', value: product.compatibility },
  ]

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500" aria-label="Miga de pan">
        <Link to="/" className="hover:text-brand-700">Inicio</Link>
        <span>/</span>
        <Link to="/productos" className="hover:text-brand-700">Productos</Link>
        <span>/</span>
        <span className="font-medium text-slate-800">{product.name}</span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-2">
        {/* Galería / preview */}
        <div>
          <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
            <ProductImage src={product.images[activeImg] ?? product.image} fallback={product.category} name={product.name} eager />
            <div className="absolute left-4 top-4 flex gap-2">
              <DiscountBadge price={product.price} oldPrice={product.oldPrice} className="px-3 py-1 text-sm" />
              {product.badge === 'nuevo' && <span className="rounded-full bg-slate-900 px-3 py-1 text-sm font-bold text-white">Nuevo</span>}
              <span className="rounded-full bg-brand-600 px-3 py-1 text-sm font-bold text-white">Digital</span>
            </div>
          </div>
          {product.images.length > 1 && (
            <div className="mt-4 flex gap-3">
              {product.images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImg(i)}
                  aria-label={`Ver imagen ${i + 1}`}
                  className={cn('h-20 w-20 overflow-hidden rounded-xl border-2 transition-colors', i === activeImg ? 'border-brand-600' : 'border-slate-200 hover:border-brand-300')}
                >
                  <ProductImage src={img} fallback={product.category} className="h-full w-full" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold uppercase tracking-wide text-brand-600">{product.brand}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-bold text-green-700">
              <Download className="h-3 w-3" /> Descarga instantánea
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
              <FileArchive className="h-3 w-3" /> {product.fileType} · {product.fileSize}
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">{product.name}</h1>
          {product.productCode && (
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(product.productCode!)
                  setCopied(true)
                  window.setTimeout(() => setCopied(false), 1500)
                } catch {
                  /* portapapeles no disponible */
                }
              }}
              title="Copiar código de producto"
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700 transition-colors hover:bg-brand-100"
            >
              <Copy className="h-3.5 w-3.5" /> Código: {product.productCode}
              {copied && <span className="text-brand-600">· copiado</span>}
            </button>
          )}
          {reviews.length > 0 && (
            <div className="mt-3">
              <Rating
                value={reviews.reduce((s, r) => s + r.rating, 0) / reviews.length}
                count={reviews.length}
                size="lg"
              />
              <p className="mt-1 text-xs text-slate-400">{reviews.length} reseña{reviews.length !== 1 && 's'}</p>
            </div>
          )}

          <div className="mt-5 flex items-center gap-3">
            <Price price={product.price} oldPrice={product.oldPrice} size="lg" />
          </div>

          <p className="mt-5 leading-relaxed text-slate-600">{product.description}</p>

          {/* Vendedor (productos publicados por usuarios) */}
          {product.owner && (
            <div className="mt-6 flex items-center justify-between rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
              <Link to={`/vendedor/${product.owner.id}`} className="flex min-w-0 items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-base font-bold text-white">
                  {product.owner.name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-medium uppercase tracking-wide text-brand-600">Vendido por</span>
                  <span className="flex items-center gap-1.5 font-bold text-slate-900">
                    <span className="truncate">{product.owner.name}</span>
                    {product.owner.verified && (
                      <span title="Vendedor verificado" aria-label="Vendedor verificado" className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500 text-[11px] font-black leading-none text-white">✓</span>
                    )}
                  </span>
                </span>
              </Link>
              <Link
                to={`/vendedor/${product.owner.id}`}
                className="shrink-0 rounded-xl border border-brand-300 bg-white px-4 py-2 text-sm font-bold text-brand-700 transition-colors hover:bg-brand-600 hover:text-white"
              >
                Ver perfil
              </Link>
            </div>
          )}

          {/* Cantidad + acciones */}
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <div className="flex items-center rounded-xl border border-slate-200">
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Disminuir cantidad" className="p-3 text-slate-600 hover:text-brand-700 disabled:opacity-40" disabled={qty <= 1}>
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-10 text-center font-bold" aria-live="polite">{qty}</span>
              <button onClick={() => setQty((q) => q + 1)} aria-label="Aumentar cantidad" className="p-3 text-slate-600 hover:text-brand-700">
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <Button size="lg" onClick={() => addToCart(product.id, qty)} className="flex-1 min-w-[220px]">
              <ShoppingCart className="h-5 w-5" /> Añadir al carrito
            </Button>

            <Button size="icon" variant="outline" onClick={() => toggleFavorite(product.id)} aria-label={fav ? 'Quitar de favoritos' : 'Añadir a favoritos'} className="h-13 w-13">
              <Heart className={cn('h-5 w-5', fav && 'fill-current text-red-500')} />
            </Button>
          </div>

          {product.price <= 0 ? (
            <Button variant="secondary" size="lg" onClick={() => void claimFree()} loading={claimingFree} disabled={freeClaimed} className="mt-3 w-full">
              <Download className="h-5 w-5" /> {freeClaimed ? 'Añadido a tu biblioteca ✓' : 'Descargar gratis'}
            </Button>
          ) : (
            <Button variant="secondary" size="lg" onClick={buyNow} className="mt-3 w-full">
              <Zap className="h-5 w-5" /> Comprar ahora — descarga inmediata
            </Button>
          )}

          {/* Datos del archivo digital */}
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {digitalFacts.map((f) => (
              <div key={f.label} className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
                <f.icon className="mx-auto h-5 w-5 text-brand-600" />
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{f.label}</p>
                <p className="mt-0.5 text-sm font-bold text-slate-800">{f.value}</p>
              </div>
            ))}
          </div>

          {/* Garantías del producto digital */}
          <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-5 text-sm">
            <div className="flex gap-3">
              <Download className="h-5 w-5 shrink-0 text-brand-600" />
              <p><strong>Acceso inmediato.</strong> Recibirás tu archivo en cuanto se confirme el pago.</p>
            </div>
            <div className="flex gap-3">
              <RefreshCcw className="h-5 w-5 shrink-0 text-brand-600" />
              <p><strong>{product.updates}</strong> — siempre tendrás la última versión.</p>
            </div>
            <div className="flex gap-3">
              <ShieldCheck className="h-5 w-5 shrink-0 text-brand-600" />
              <p><strong>{product.license}.</strong> {product.support} incluido.</p>
            </div>
          </div>

          {/* Características */}
          <div className="mt-8">
            <h2 className="text-lg font-bold text-slate-900">Características</h2>
            <ul className="mt-3 space-y-2">
              {product.features.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-slate-600">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Qué incluye */}
          {product.includes && product.includes.length > 0 && (
            <div className="mt-8">
              <h2 className="text-lg font-bold text-slate-900">Qué incluye la descarga</h2>
              <ul className="mt-3 space-y-2">
                {product.includes.map((inc, i) => (
                  <li key={i} className="flex items-start gap-2 text-slate-600">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                    {inc}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Requisitos */}
          {product.requirements && product.requirements.length > 0 && (
            <div className="mt-8">
              <h2 className="text-lg font-bold text-slate-900">Requisitos</h2>
              <ul className="mt-3 space-y-2">
                {product.requirements.map((req, i) => (
                  <li key={i} className="flex items-start gap-2 text-slate-600">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                    {req}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Licencia */}
          <div className="mt-8 rounded-2xl border border-brand-100 bg-brand-50/60 p-5">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <ShieldCheck className="h-5 w-5 text-brand-600" /> Licencia
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              <strong>{product.license}.</strong> {product.downloads.toLocaleString('es')} descargas realizadas hasta ahora.
            </p>
          </div>
        </div>
      </div>

      {/* Reseñas */}
      <section className="mt-16" aria-label={t('product.reviews')}>
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">{t('product.reviews')}</h2>

        {/* Formulario de reseña */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          {user ? (
            <form onSubmit={submitReview} noValidate>
              <h3 className="flex items-center gap-2 font-bold text-slate-900">
                <MessageSquare className="h-5 w-5 text-brand-600" /> {t('review.write')}
              </h3>
              <div className="mt-3 flex items-center gap-1" role="radiogroup" aria-label={t('review.needRating')}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={myRating === n}
                    aria-label={`${n} / 5`}
                    onClick={() => setMyRating(n)}
                    className="rounded p-0.5 transition-transform hover:scale-110"
                  >
                    <Star className={cn('h-6 w-6', n <= myRating ? 'fill-amber-400 text-amber-400' : 'text-slate-300')} />
                  </button>
                ))}
              </div>
              {reviewErrors.rating && <p className="mt-1 text-xs text-red-500">{reviewErrors.rating}</p>}
              <textarea
                value={myText}
                onChange={(e) => { setMyText(e.target.value); setReviewErrors((x) => ({ ...x, content: '' })) }}
                rows={3}
                placeholder={t('review.placeholder')}
                aria-label={t('review.placeholder')}
                className={cn(
                  'mt-3 w-full rounded-xl border bg-slate-50 px-4 py-3 text-sm outline-none transition-colors focus:border-brand-400 focus:bg-white',
                  reviewErrors.content ? 'border-red-300' : 'border-slate-200',
                )}
              />
              {reviewErrors.content && <p className="mt-1 text-xs text-red-500">{reviewErrors.content}</p>}
              <div className="mt-3">
                <ImageUpload value={myImage} onChange={setMyImage} placeholder="Añade una foto de tu compra (opcional)" />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <Button type="submit" loading={savingReview}>
                  <Send className="h-4 w-4" /> {t('review.submit')}
                </Button>
                {reviews.some((r) => r.userId === user.id) && (
                  <button type="button" onClick={() => void removeMyReview()} className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-500 hover:underline">
                    <Trash2 className="h-4 w-4" /> {t('review.delete')}
                  </button>
                )}
              </div>
            </form>
          ) : (
            <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
              <p className="text-slate-500">{t('review.login')}</p>
              <Link to="/login" className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800">
                {t('chat.signIn')}
              </Link>
            </div>
          )}
        </div>

        {/* Lista de reseñas */}
        {reviewsLoading ? (
          <div className="mt-6 space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-2xl border border-slate-200 bg-white p-6">
                <div className="h-4 w-40 rounded bg-slate-100" />
                <div className="mt-3 h-3 w-full rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : reviews.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
            {t('review.empty')}
          </div>
        ) : (
          <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {reviews.map((r) => (
              <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex items-center justify-between">
                  <Rating value={r.rating} showCount={false} size="sm" />
                  <span className="text-xs text-slate-400">{formatDate(r.createdAt.slice(0, 10))}</span>
                </div>
                <p className="mt-3 text-slate-600">"{r.content}"</p>
                {r.imageUrl && (
                  <img src={r.imageUrl} alt="Foto de la reseña" className="mt-3 max-h-40 w-full rounded-xl object-cover" loading="lazy" />
                )}
                <div className="mt-3 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                    {r.userName.charAt(0).toUpperCase()}
                  </span>
                  <p className="text-sm font-semibold text-slate-900">{r.userName}</p>
                  {r.verifiedPurchase && (
                    <span title="Compra verificada" aria-label="Compra verificada" className="inline-flex items-center gap-0.5 rounded-full bg-green-100 px-1.5 text-[10px] font-bold text-green-700">✓ Compra verificada</span>
                  )}
                  {r.userVerified && (
                    <span title="Usuario verificado" aria-label="Usuario verificado" className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[9px] font-black leading-none text-white">✓</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Relacionados */}
      {related.length > 0 && (
        <section className="mt-16" aria-label="Productos relacionados">
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">También te puede gustar</h2>
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
