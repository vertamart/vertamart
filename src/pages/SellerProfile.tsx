import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, MessageCircle, UserCheck, UserPlus } from 'lucide-react'
import { storeService, type StoredProduct, type UserProfile } from '../api/services/store'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { useI18n } from '../context/I18nContext'
import { ProductCard } from '../components/ui/ProductCard'
import { CatalogSkeleton } from '../components/ui/CatalogState'
import { getRegion } from '../lib/currency'
import { formatDate } from '../lib/format'
import { cn } from '../lib/cn'

export function SellerProfile() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { notify } = useStore()
  const { t } = useI18n()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [products, setProducts] = useState<StoredProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const sellerId = Number(id)

  const load = useCallback(async () => {
    if (!Number.isFinite(sellerId)) {
      setError('NOT_FOUND')
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [prof, prod] = await Promise.all([
        storeService.getUserProfile(sellerId),
        storeService.getUserProducts(sellerId),
      ])
      setProfile(prof)
      setProducts(prod.items)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'NOT_FOUND')
    } finally {
      setLoading(false)
    }
  }, [sellerId])

  useEffect(() => {
    void load()
  }, [load])

  const toggleFollow = async () => {
    if (!profile || !user) return
    setBusy(true)
    try {
      const updated = profile.isFollowing
        ? await storeService.unfollowUser(profile.id)
        : await storeService.followUser(profile.id)
      setProfile(updated)
      notify(updated.isFollowing ? t('seller.followDone', { name: updated.name }) : t('seller.unfollowDone', { name: updated.name }))
    } catch {
      notify(t('chat.error'), 'info')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="animate-pulse rounded-3xl border border-slate-200 bg-white p-8">
          <div className="h-14 w-14 rounded-full bg-slate-100" />
          <div className="mt-4 h-6 w-48 rounded bg-slate-100" />
          <div className="mt-2 h-4 w-32 rounded bg-slate-100" />
        </div>
        <div className="mt-8"><CatalogSkeleton cards={4} /></div>
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col items-center px-4 py-24 text-center">
        <h1 className="text-2xl font-extrabold text-slate-900">{t('seller.notFound')}</h1>
        <p className="mt-2 text-slate-500">{t('seller.noProducts')}</p>
        <Link to="/productos" className="mt-6 rounded-xl bg-brand-600 px-6 py-3 font-bold text-white hover:bg-brand-700">
          {t('cat.allProducts')}
        </Link>
      </div>
    )
  }

  const region = getRegion(profile.country)
  const isSupport = profile.role === 'support'
  const initials = profile.name
    .split(' ')
    .map((w) => w.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Link to="/productos" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition-colors hover:text-brand-700">
        <ArrowLeft className="h-4 w-4" /> {t('cat.allProducts')}
      </Link>

      {/* Cabecera del perfil */}
      <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className={cn('h-24 bg-gradient-to-r', isSupport ? 'from-slate-900 via-brand-800 to-slate-900' : 'from-brand-700 via-brand-600 to-brand-800')} />
        <div className="flex flex-col gap-5 px-6 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-end gap-4">
            <span className={cn('-mt-10 flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border-4 border-white text-2xl font-extrabold text-white shadow-lg', isSupport ? 'bg-slate-900' : 'bg-brand-600')}>
              {isSupport ? '✓' : initials}
            </span>
            <div className="pb-1">
              <h1 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold tracking-tight text-slate-900">
                {profile.name}
                {profile.verified && <span title="Usuario verificado" aria-label="Usuario verificado" className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-xs font-black text-white">✓</span>}
                {isSupport && <span className="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-bold text-brand-700">Soporte oficial</span>}
              </h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true">{region.flag}</span> {region.name}
                </span>
                <span className="text-slate-300">·</span>
                <span>{t('seller.joined', { date: formatDate(profile.createdAt.slice(0, 10)) })}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {profile.isSelf ? (
              <span className="rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-bold text-slate-500">{t('seller.you')}</span>
            ) : isSupport && user ? (
              <Link to={`/chat?user=${profile.id}`} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-slate-800">
                <MessageCircle className="h-4 w-4" /> Abrir chat de soporte
              </Link>
            ) : user ? (
              <>
                <button
                  onClick={() => void toggleFollow()}
                  disabled={busy}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-colors disabled:opacity-60',
                    profile.isFollowing
                      ? 'border border-brand-300 bg-white text-brand-700 hover:bg-brand-50'
                      : 'bg-brand-600 text-white hover:bg-brand-700',
                  )}
                >
                  {profile.isFollowing ? <UserCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                  {profile.isFollowing ? t('seller.followingBtn') : t('seller.follow')}
                </button>
                {profile.isFollowing && (
                  <Link
                    to={`/chat?user=${profile.id}`}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-slate-800"
                  >
                    <MessageCircle className="h-4 w-4" /> {t('seller.chat')}
                  </Link>
                )}
              </>
            ) : (
              <Link
                to="/login"
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-700"
              >
                <UserPlus className="h-4 w-4" /> {t('seller.loginToFollow')}
              </Link>
            )}
          </div>
        </div>

        {isSupport && (
          <div className="border-t border-slate-100 bg-slate-50/60 px-6 py-5">
            <p className="text-sm leading-relaxed text-slate-600">Estamos aquí para ayudarte con pedidos, publicaciones, pagos, cuentas y cualquier incidencia de la tienda. Escríbenos desde el chat y revisaremos tu caso.</p>
            <p className="mt-2 text-xs font-semibold text-brand-700">Horario de atención: todos los días, 09:00–20:00</p>
          </div>
        )}

        {/* Estadísticas */}
        <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100 bg-slate-50/60 text-center">
          <div className="px-4 py-4">
            <p className="text-xl font-extrabold text-slate-900">{profile.productsCount}</p>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('seller.products', { n: profile.productsCount })}</p>
          </div>
          <div className="px-4 py-4">
            <p className="text-xl font-extrabold text-slate-900">{profile.followersCount}</p>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('seller.followers', { n: profile.followersCount })}</p>
          </div>
          <div className="px-4 py-4">
            <p className="text-xl font-extrabold text-slate-900">{profile.followingCount}</p>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('seller.followingCount', { n: profile.followingCount })}</p>
          </div>
        </div>
      </div>

      {/* Productos del vendedor */}
      <section className="mt-10" aria-label={t('seller.products', { n: products.length })}>
        <h2 className="text-xl font-extrabold tracking-tight text-slate-900">
          {t('seller.products', { n: products.length })}
        </h2>
        {products.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
            {t('seller.noProducts')}
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
