import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { BadgeCheck, Check, Coins, Crown, Download, Globe, Lock, Package, Pencil, Save, Sparkles, Trash2, X, User as UserIcon, UserPlus, Video } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { THEMES, useTheme } from '../context/ThemeContext'
import { useRegion } from '../context/RegionContext'
import { useCatalog } from '../context/CatalogContext'
import { formatPrice, REGIONS } from '../lib/currency'
import { useStore } from '../context/StoreContext'
import { storeService, type FeedPost, type StoredProduct } from '../api/services/store'
import { ApiRequestError } from '../api/client'
import { CATEGORIES } from '../data/products'
import { Button } from '../components/ui/Button'
import { ProductImage } from '../components/ui/ProductImage'
import { ImageUpload } from '../components/ui/ImageUpload'
import { authService, type VerificationChecks } from '../api/services/auth'
import { formatDate } from '../lib/format'
import { cn } from '../lib/cn'

const BADGES = [
  { value: '', label: 'Sin etiqueta' },
  { value: 'nuevo', label: 'Nuevo' },
  { value: 'popular', label: 'Popular' },
  { value: 'top', label: 'Top ventas' },
]

interface EditState {
  id: string
  name: string
  category: string
  description: string
  price: string
  oldPrice: string
  stock: string
  image: string
  features: string
  badge: string
}

export function Account() {
  const { user, status, updateProfile, refreshProfile, logout } = useAuth()
  const { region, setRegion } = useRegion()
  const { refresh } = useCatalog()
  const { notify } = useStore()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [nameError, setNameError] = useState('')
  const [mine, setMine] = useState<StoredProduct[]>([])
  const [loadingMine, setLoadingMine] = useState(false)
  const [myPosts, setMyPosts] = useState<FeedPost[]>([])
  const [loadingMyPosts, setLoadingMyPosts] = useState(false)
  const [points, setPoints] = useState<{ points: number; history: { id: number; delta: number; reason: string; refType: string; createdAt: string }[] }>({ points: 0, history: [] })
  const [postEdit, setPostEdit] = useState<FeedPost | null>(null)
  const [savingPost, setSavingPost] = useState(false)
  const [postError, setPostError] = useState('')
  const [edit, setEdit] = useState<EditState | null>(null)
  const [editErrors, setEditErrors] = useState<Record<string, string>>({})
  const [editServerError, setEditServerError] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const { theme, setTheme, canUse } = useTheme()
  const [subState, setSubState] = useState<{ payoutConfigured: boolean; payout?: { label: string; provider: string } | null; pending?: { id: number; method: string } | null } | null>(null)
  const [subMethod, setSubMethod] = useState<'card' | 'webpay' | 'transfer'>('card')
  const [card, setCard] = useState({ numero: '', vencimiento: '', cvv: '', titular: '' })
  const [subProcessing, setSubProcessing] = useState(false)
  const [subError, setSubError] = useState('')
  const [subInfo, setSubInfo] = useState('')
  const [subCardError, setSubCardError] = useState('')
  const [verification, setVerification] = useState<{ verified: boolean; checks: VerificationChecks } | null>(null)
  const [payoutInfo, setPayoutInfo] = useState<{ provider: string; label: string; accountRef: string; paypalEmail?: string | null } | null>(null)
  const [library, setLibrary] = useState<import('../api/services/store').LibraryItem[]>([])
  const [loadingLibrary, setLoadingLibrary] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [versionLog, setVersionLog] = useState<{ productId: string; items: { version: string; notes: string; createdAt: string }[] } | null>(null)

  const showVersionLog = async (item: import('../api/services/store').LibraryItem) => {
    try {
      const r = await storeService.productVersions(item.id)
      setVersionLog({ productId: item.id, items: r.items })
    } catch {
      notify('No se pudo cargar el historial de versiones', 'info')
    }
  }

  useEffect(() => {
    if (!user) return
    authService.verification().then(setVerification).catch(() => setVerification(null))
  }, [user?.id, user?.name, user?.country]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    storeService.payoutInfo().then(setPayoutInfo).catch(() => setPayoutInfo(null))
  }, [])

  useEffect(() => {
    if (!user) return
    authService.getSubscription().then((s) => setSubState(s)).catch(() => setSubState(null))
  }, [user?.id, user?.isPremium]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return
    storeService.myPoints().then(setPoints).catch(() => setPoints({ points: 0, history: [] }))
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Si venimos del checkout (?tab=descargas), baja hasta la biblioteca.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('tab') === 'descargas') {
      // Espera a que la biblioteca esté cargada para hacer scroll.
      const t = setTimeout(() => {
        document.querySelector('#mis-descargas')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 350)
      return () => clearTimeout(t)
    }
  }, [library.length])

  // Biblioteca digital: productos comprados (Mis descargas).
  useEffect(() => {
    if (!user) return
    setLoadingLibrary(true)
    storeService.myLibrary().then((r) => setLibrary(r.items)).catch(() => setLibrary([])).finally(() => setLoadingLibrary(false))
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const downloadFromLibrary = async (item: import('../api/services/store').LibraryItem) => {
    setDownloading(item.id)
    try {
      const { blob, filename } = await storeService.downloadProduct(item.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      notify(`Descarga iniciada: ${item.name}`, 'info')
      // Actualiza el contador local de descargas.
      setLibrary((prev) => prev.map((it) => (it.id === item.id ? { ...it, downloads: it.downloads + 1 } : it)))
    } catch {
      notify('No tienes acceso a este archivo o hubo un error', 'info')
    } finally {
      setDownloading(null)
    }
  }

  const applyCardFormat = (k: 'numero' | 'vencimiento' | 'cvv') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    const v = k === 'numero' ? raw.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ') : k === 'vencimiento' ? (() => { const d = raw.replace(/\D/g, '').slice(0, 4); return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d })() : raw.replace(/\D/g, '').slice(0, 4)
    setCard((c) => ({ ...c, [k]: v }))
    setSubCardError('')
  }

  const payPremium = async (e: FormEvent) => {
    e.preventDefault()
    setSubError('')
    setSubInfo('')
    if (!subState?.payoutConfigured) {
      setSubError('Aún no hay una cuenta receptora configurada. El administrador debe configurarla en el Panel → Cuentas.')
      return
    }
    if (subMethod === 'card') {
      // Validación Luhn (igual que el checkout).
      const digits = card.numero.replace(/\s/g, '')
      let sum = 0, double = false
      for (let i = digits.length - 1; i >= 0; i--) { let d = Number(digits[i]); if (double) { d *= 2; if (d > 9) d -= 9 } sum += d; double = !double }
      if (!/^\d{16}$/.test(digits) || sum % 10 !== 0) { setSubCardError('Número de tarjeta no válido'); return }
      if (!/^\d{2}\/\d{2}$/.test(card.vencimiento)) { setSubCardError('Vencimiento en formato MM/AA'); return }
      if (!/^\d{3,4}$/.test(card.cvv)) { setSubCardError('CVV no válido'); return }
      if (card.titular.trim().length < 3) { setSubCardError('Ingresa el titular de la tarjeta'); return }
    }
    setSubProcessing(true)
    try {
      const res = await authService.paySubscription({
        method: subMethod,
        card: subMethod === 'card' ? { number: card.numero, expiry: card.vencimiento, cvv: card.cvv, holder: card.titular } : undefined,
      })
      await refreshProfile()
      setSubInfo(res.message)
      if (res.isPremium) notify('¡Premium activado!')
      else notify('Pago pendiente de confirmación', 'info')
    } catch (err) {
      setSubError(err instanceof ApiRequestError ? err.message : 'No se pudo procesar el pago')
    } finally {
      setSubProcessing(false)
    }
  }

  const cancelPremium = async () => {
    setSubProcessing(true)
    setSubError('')
    try {
      await authService.unsubscribe()
      await refreshProfile()
      setSubInfo('Suscripción cancelada')
      notify('Suscripción cancelada', 'info')
    } catch (err) {
      setSubError(err instanceof ApiRequestError ? err.message : 'No se pudo cancelar')
    } finally {
      setSubProcessing(false)
    }
  }

  useEffect(() => {
    if (user) setName(user.name)
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadMine = async () => {
    setLoadingMine(true)
    try {
      const res = await storeService.myProducts()
      setMine(res.items)
    } catch {
      setMine([])
    } finally {
      setLoadingMine(false)
    }
  }

  useEffect(() => {
    if (user) void loadMine()
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadMyPosts = async () => {
    setLoadingMyPosts(true)
    try {
      const res = await storeService.myFeedPosts()
      setMyPosts(res.items)
    } catch {
      setMyPosts([])
    } finally {
      setLoadingMyPosts(false)
    }
  }

  useEffect(() => {
    if (user) void loadMyPosts()
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const savePostEdit = async (event: FormEvent) => {
    event.preventDefault()
    if (!postEdit) return
    if (postEdit.title.trim().length < 3 || postEdit.description.trim().length < 3) {
      setPostError('El título y la descripción deben tener al menos 3 caracteres')
      return
    }
    setSavingPost(true)
    setPostError('')
    try {
      const updated = await storeService.updateFeedPost(postEdit.id, {
        title: postEdit.title.trim(),
        description: postEdit.description.trim(),
        videoUrl: postEdit.videoUrl,
        productCode: postEdit.productCode ?? undefined,
      })
      setMyPosts((current) => current.map((post) => post.id === updated.id ? updated : post))
      setPostEdit(null)
      notify('Publicación actualizada')
    } catch (err) {
      setPostError(err instanceof ApiRequestError ? err.message : 'No se pudo actualizar la publicación')
    } finally {
      setSavingPost(false)
    }
  }

  const removePost = async (id: number) => {
    try {
      await storeService.deleteFeedPost(id)
      setMyPosts((current) => current.filter((post) => post.id !== id))
      notify('Publicación eliminada', 'info')
    } catch (err) {
      notify(err instanceof ApiRequestError ? err.message : 'No se pudo eliminar la publicación', 'info')
    }
  }

  if (status === 'loading') {
    return <div className="mx-auto max-w-3xl px-4 py-24 text-center text-slate-400">Cargando tu cuenta…</div>
  }

  if (!user) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50">
          <UserIcon className="h-8 w-8 text-brand-600" />
        </div>
        <h1 className="mt-4 text-2xl font-extrabold text-slate-900">Necesitas iniciar sesión</h1>
        <p className="mt-2 text-slate-500">Inicia sesión para configurar tu cuenta, tu país y tus publicaciones.</p>
        <Link to="/login" className="mt-6 rounded-xl bg-brand-600 px-7 py-3.5 font-bold text-white hover:bg-brand-700">
          Iniciar sesión
        </Link>
      </div>
    )
  }

  const saveName = async (e: FormEvent) => {
    e.preventDefault()
    if (name.trim().length < 2) {
      setNameError('El nombre debe tener al menos 2 caracteres')
      return
    }
    setSaving(true)
    try {
      await updateProfile({ name: name.trim() })
      notify('Perfil actualizado')
    } catch (err) {
      setNameError(err instanceof ApiRequestError ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const changeCountry = async (code: string) => {
    setRegion(code)
    try {
      await updateProfile({ country: code })
      notify(`País actualizado a ${REGIONS.find((r) => r.code === code)?.name ?? code}`)
    } catch {
      notify('País actualizado (local). No se pudo guardar en tu cuenta', 'info')
    }
  }

  const removeProduct = async (id: string) => {
    try {
      await storeService.deleteProduct(id)
      setMine((prev) => prev.filter((p) => p.id !== id))
      refresh() // quita el producto del catálogo visible
      notify('Publicación eliminada', 'info')
    } catch (err) {
      notify(err instanceof ApiRequestError ? err.message : 'No se pudo eliminar', 'info')
    }
  }

  const openEdit = (p: StoredProduct) => {
    setEditErrors({})
    setEditServerError('')
    setEdit({
      id: p.id,
      name: p.name,
      category: p.category,
      description: p.description,
      price: String(Math.round(p.price * region.rate)),
      oldPrice: p.oldPrice ? String(Math.round(p.oldPrice * region.rate)) : '',
      stock: String(p.stock),
      image: p.image,
      features: p.features.join('\n'),
      badge: p.badge ?? '',
    })
  }

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault()
    if (!edit) return
    const er: Record<string, string> = {}
    if (edit.name.trim().length < 3) er.name = 'El nombre debe tener al menos 3 caracteres'
    if (edit.description.trim().length < 10) er.description = 'Describe tu producto (mínimo 10 caracteres)'
    const numPrice = Number(edit.price)
    if (!Number.isFinite(numPrice) || numPrice <= 0) er.price = 'Ingresa un precio válido'
    const numStock = Number(edit.stock)
    if (!Number.isInteger(numStock) || numStock < 0) er.stock = 'Stock no válido'
    if (edit.image && !/^(https?:\/\/|data:image\/)/.test(edit.image)) er.image = 'La imagen debe ser una URL o una foto válida'
    setEditErrors(er)
    if (Object.keys(er).length > 0) return

    setSavingEdit(true)
    setEditServerError('')
    try {
      await storeService.updateProduct(edit.id, {
        name: edit.name.trim(),
        description: edit.description.trim(),
        category: edit.category,
        price: Math.round(numPrice / region.rate), // vuelve a CLP base
        oldPrice: edit.oldPrice ? Math.round(Number(edit.oldPrice) / region.rate) : undefined,
        stock: numStock,
        image: edit.image.trim(),
        features: edit.features.split('\n').map((f) => f.trim()).filter(Boolean),
        badge: edit.badge || undefined,
      })
      await loadMine()
      refresh() // el catálogo se actualiza al momento
      notify('Publicación actualizada')
      setEdit(null)
    } catch (err) {
      setEditServerError(err instanceof ApiRequestError ? err.message : 'No se pudo guardar la publicación')
    } finally {
      setSavingEdit(false)
    }
  }

  const samplePrice = 59990

  const editField = (key: string, label: string, el: React.ReactNode) => (
    <div>
      <label htmlFor={`e-${key}`} className="text-sm font-medium text-slate-600">{label}</label>
      {el}
      {editErrors[key] && <p className="mt-1 text-xs text-red-500">{editErrors[key]}</p>}
    </div>
  )

  const editInputCls = (key: string) =>
    cn('mt-1 h-11 w-full rounded-xl border bg-white px-3.5 text-sm outline-none transition-colors focus:border-brand-400', editErrors[key] ? 'border-red-300' : 'border-slate-200')

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Configuración de la cuenta</h1>
      <p className="mt-1 text-slate-500">Administra tu perfil, tu país y tus publicaciones.</p>

      <div className="mt-8 space-y-6">
        {/* Perfil */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><UserIcon className="h-5 w-5 text-brand-600" /> Perfil</h2>
          <form onSubmit={saveName} noValidate className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto]">
            <div>
              <label htmlFor="acc-name" className="text-sm font-medium text-slate-600">Nombre completo</label>
              <input
                id="acc-name"
                value={name}
                onChange={(e) => { setName(e.target.value); setNameError('') }}
                className={cn('mt-1 h-11 w-full rounded-xl border bg-white px-3.5 text-sm outline-none focus:border-brand-400', nameError ? 'border-red-300' : 'border-slate-200')}
              />
              {nameError && <p className="mt-1 text-xs text-red-500">{nameError}</p>}
            </div>
            <div className="flex items-end">
              <Button type="submit" loading={saving} className="h-11">
                <Save className="h-4 w-4" /> Guardar
              </Button>
            </div>
          </form>
          <p className="mt-4 text-sm text-slate-500">
            Correo: <strong>{user.email}</strong>
          </p>
          <button onClick={() => void logout()} className="mt-2 text-sm font-semibold text-red-500 hover:underline">
            Cerrar sesión
          </button>
        </section>

        {/* Verificación */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><BadgeCheck className="h-5 w-5 text-blue-500" /> Verificación</h2>
            {verification?.verified ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-600">
                <BadgeCheck className="h-4 w-4" /> Cuenta verificada
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">Sin verificar</span>
            )}
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Completa los requisitos para obtener la insignia azul junto a tu nombre en productos, publicaciones y chat.
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            <li className="flex items-center gap-2">
              {verification?.checks.email ? <Check className="h-4 w-4 shrink-0 text-green-600" /> : <X className="h-4 w-4 shrink-0 text-slate-300" />}
              <span className={verification?.checks.email ? 'text-slate-700' : 'text-slate-400'}>Correo electrónico válido</span>
            </li>
            <li className="flex items-center gap-2">
              {verification?.checks.profile ? <Check className="h-4 w-4 shrink-0 text-green-600" /> : <X className="h-4 w-4 shrink-0 text-slate-300" />}
              <span className={verification?.checks.profile ? 'text-slate-700' : 'text-slate-400'}>Perfil completo (nombre y país)</span>
            </li>
            <li className="flex items-center gap-2">
              {verification?.checks.activity ? <Check className="h-4 w-4 shrink-0 text-green-600" /> : <X className="h-4 w-4 shrink-0 text-slate-300" />}
              <span className={verification?.checks.activity ? 'text-slate-700' : 'text-slate-400'}>
                Actividad real: publica un producto o una publicación en Comunidad
              </span>
            </li>
          </ul>
          {!verification?.verified && (
            <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
              La insignia se concede automáticamente en cuanto cumplas los tres requisitos.
            </p>
          )}
        </section>

        {/* País y moneda */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Globe className="h-5 w-5 text-brand-600" /> País y moneda</h2>
          <p className="mt-1 text-sm text-slate-500">
            Elige tu país y todos los precios se mostrarán en tu moneda local.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="acc-country" className="text-sm font-medium text-slate-600">País</label>
              <select
                id="acc-country"
                value={region.code}
                onChange={(e) => void changeCountry(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-400"
              >
                {REGIONS.map((r) => (
                  <option key={r.code} value={r.code}>{r.flag} {r.name} · {r.currency}</option>
                ))}
              </select>
            </div>
            <div className="rounded-xl bg-brand-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Tu moneda</p>
              <p className="mt-1 text-lg font-extrabold text-slate-900">
                {region.flag} {region.symbol} · {region.currency}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Ejemplo: un producto de $59.990 CLP se muestra como{' '}
                <strong>{formatPrice(samplePrice, region)}</strong>
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Las tasas de conversión son indicativas y se ajustan en <code className="rounded bg-slate-100 px-1">src/lib/currency.ts</code>.
          </p>
        </section>

        {/* Suscripción Premium */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              {user?.isPremium ? <Crown className="h-5 w-5 text-amber-500" /> : <Lock className="h-5 w-5 text-brand-600" />}
              {user?.isPremium ? 'Suscripción Premium' : 'Hazte Premium ($1,99/mes)'}
            </h2>
            <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold', user?.isPremium ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500')}>
              {user?.isPremium ? '✓ Activa' : 'Plan gratis'}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-500">Suscríbete por <strong>$1,99 USD/mes</strong> (demo, sin cargo real) y desbloquea ventajas.</p>
          <ul className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
            <li className="flex items-center gap-2"><Crown className="h-4 w-4 shrink-0 text-amber-500" /> 3 temas de color premium (Azul, Violeta, Coral)</li>
            <li className="flex items-center gap-2"><Crown className="h-4 w-4 shrink-0 text-amber-500" /> Insignia de vendedor verificada junto a tus publicaciones</li>
            <li className="flex items-center gap-2"><Crown className="h-4 w-4 shrink-0 text-amber-500" /> Prioridad: tus productos destacan en el feed</li>
            <li className="flex items-center gap-2"><Crown className="h-4 w-4 shrink-0 text-amber-500" /> Soporte prioritario por mensajes</li>
          </ul>
          {subInfo && <p className="mt-3 rounded-xl bg-green-50 px-4 py-2.5 text-sm text-green-700">{subInfo}</p>}
          {subError && <p className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{subError}</p>}

          {user?.isPremium ? (
            <div className="mt-4">
              <p className="text-sm text-slate-500">Tu suscripción está activa. El dinero de tu pago se acredita a la cuenta receptora de la tienda.</p>
              <Button variant="outline" onClick={() => void cancelPremium()} loading={subProcessing} className="mt-3">Cancelar suscripción</Button>
            </div>
          ) : (
            <form onSubmit={payPremium} noValidate className="mt-4 space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-700">Total a pagar: <strong>US$1,99</strong> /mes</p>
                {subState?.pending && (
                  <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">Tienes una transferencia pendiente de confirmar (#{subState.pending.id}). Se activará cuando el administrador la apruebe.</p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {(['card', 'webpay', 'transfer'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSubMethod(m)}
                    className={cn('rounded-xl border px-3 py-2 text-sm font-semibold transition-colors', subMethod === m ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:border-brand-300')}
                  >
                    {m === 'card' ? 'Tarjeta' : m === 'webpay' ? 'Webpay' : 'Transferencia'}
                  </button>
                ))}
              </div>

              {subMethod === 'card' && (
                <div className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-slate-500">Número de tarjeta</label>
                    <input value={card.numero} onChange={applyCardFormat('numero')} placeholder="4111 1111 1111 1111" inputMode="numeric" maxLength={19} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-brand-400" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500">Vencimiento (MM/AA)</label>
                    <input value={card.vencimiento} onChange={applyCardFormat('vencimiento')} placeholder="12/28" inputMode="numeric" maxLength={5} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-brand-400" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500">CVV</label>
                    <input value={card.cvv} onChange={applyCardFormat('cvv')} placeholder="123" inputMode="numeric" maxLength={4} className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-brand-400" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-slate-500">Titular de la tarjeta</label>
                    <input value={card.titular} onChange={(e) => setCard((c) => ({ ...c, titular: e.target.value }))} placeholder="JUAN PEREZ" className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm focus:border-brand-400" />
                  </div>
                  {subCardError && <p className="text-xs text-red-500 sm:col-span-2">{subCardError}</p>}
                </div>
              )}

              {subMethod === 'transfer' && (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  {payoutInfo ? (
                    <>Haz una transferencia por <strong>US$1,99</strong> a <strong>{payoutInfo.label}</strong> · <span className="font-mono">{payoutInfo.accountRef}</span>{payoutInfo.provider !== 'paypal' && payoutInfo.paypalEmail && <> · PayPal: <span className="font-mono">{payoutInfo.paypalEmail}</span></>}. Tu suscripción se activará cuando el administrador confirme el ingreso.</>
                  ) : (
                    <>Se generará una transferencia por <strong>US$1,99</strong>. Tu suscripción se activará cuando el administrador confirme el ingreso en la cuenta receptora.</>
                  )}
                </p>
              )}

              <Button type="submit" loading={subProcessing} className="w-full">
                <Crown className="h-4 w-4" /> {subMethod === 'transfer' ? 'Generar transferencia por $1,99' : `Pagar $1,99/mes`}
              </Button>
              <p className="text-center text-[11px] text-slate-400">Pago simulado de demostración · no se cobra ni se guarda tu tarjeta.</p>
            </form>
          )}
        </section>

        {/* Puntos de fidelidad */}
        <section className="rounded-2xl border border-green-200 bg-green-50/40 p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Coins className="h-5 w-5 text-green-600" /> Puntos de fidelidad</h2>
          <p className="mt-1 text-sm text-slate-600">Ganas <strong>1 punto por cada {formatPrice(10, region)}</strong> de compra. Cánjéalos como descuento al pagar.</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="text-3xl font-extrabold text-green-700">{points.points} <span className="text-base font-bold text-green-600">pts</span></p>
            {points.history.length > 0 && (
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500">{points.history.length} movimientos</span>
            )}
          </div>
          {points.history.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {points.history.slice(0, 8).map((h) => (
                <li key={h.id} className="flex items-center justify-between rounded-xl bg-white px-4 py-2 text-sm">
                  <span className="text-slate-700">{h.reason}</span>
                  <span className={cn('font-bold', h.delta >= 0 ? 'text-green-600' : 'text-red-500')}>{h.delta >= 0 ? `+${h.delta}` : h.delta}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-500">Todavía no has acumulado puntos. ¡Haz tu primera compra!</p>
          )}
          <p className="mt-3 text-xs text-slate-400">El saldo de puntos se resta automáticamente al menos una vez por pedido iniciando sesión. Puedes canjearlos desde el carrito.</p>
        </section>

        {/* Apariencia / Tema */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">Apariencia</h2>
          <p className="mt-1 text-sm text-slate-500">Elige el tema de la tienda. Los temas sin candado son gratis; los premium requieren suscripción.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {THEMES.map((t) => {
              const locked = !canUse(t.id)
              const active = theme === t.id
              return (
                <button
                  key={t.id}
                  disabled={locked}
                  onClick={() => setTheme(t.id)}
                  className={cn(
                    'group relative flex flex-col items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all',
                    active ? 'border-brand-600 bg-brand-50/60' : 'border-slate-200 hover:border-brand-300',
                    locked && 'cursor-not-allowed opacity-60',
                  )}
                >
                  <span className="flex gap-1">
                    {t.swatch.map((c) => (
                      <span key={c} className="h-6 w-6 rounded-full ring-1 ring-slate-200" style={{ backgroundColor: c }} />
                    ))}
                  </span>
                  <span className="flex w-full items-center justify-between">
                    <span className="font-bold text-slate-900">{t.label}</span>
                    {t.premium && !active && (
                      <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold', locked ? 'bg-slate-200 text-slate-500' : 'bg-amber-100 text-amber-700')}>
                        <Crown className="h-3 w-3" /> {locked ? 'Premium' : 'Premium'}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-slate-500">{t.desc}</span>
                  {active && <span className="absolute right-3 top-3 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white">Activo</span>}
                </button>
              )
            })}
          </div>
          {!user?.isPremium && (
            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              Los temas de color están bloqueados. Activa la <strong>Suscripción Premium ($1,99/mes)</strong> que aparece arriba para desbloquearlos.
            </p>
          )}
        </section>

        {/* Mis descargas (biblioteca digital) */}
        <section id="mis-descargas" className="rounded-2xl border border-brand-100 bg-brand-50/40 p-6 scroll-mt-24">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Download className="h-5 w-5 text-brand-600" /> Mis Descargas</h2>
          <p className="mt-1 text-sm text-slate-600">Todos tus productos digitales comprados. Descárgalos cuando quieras, con su licencia incluida.</p>
          {loadingLibrary ? (
            <p className="mt-4 text-sm text-slate-400">Cargando tu biblioteca…</p>
          ) : library.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-brand-200 p-8 text-center text-sm text-slate-500">
              Aún no tienes productos en tu biblioteca. <Link to="/productos" className="font-bold text-brand-700 hover:underline">Explora el catálogo digital</Link>.
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {library.map((item) => (
                <div key={item.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-md">
                  <div className="flex items-center gap-3">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-50">
                      <ProductImage src={item.image} fallback={item.category} name={item.name} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link to={`/producto/${item.slug}`} className="block truncate font-semibold text-slate-800 hover:text-brand-700">{item.name}</Link>
                      <p className="text-sm text-slate-500">{item.fileType} · {item.fileSize} · <span className="font-semibold text-slate-600">v{item.version}</span></p>
                      <p className="text-xs text-slate-400">Comprado el {formatDate(item.purchasedAt)}</p>
                    </div>
                  </div>
                  {item.hasUpdate && (
                    <button
                      type="button"
                      onClick={() => void showVersionLog(item)}
                      className="mt-2 flex w-full items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-left text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100"
                    >
                      <Sparkles className="h-3.5 w-3.5 shrink-0" /> Nueva versión disponible (v{item.version}) — ver novedades
                    </button>
                  )}
                  {versionLog && versionLog.productId === item.id && (
                    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="mb-1.5 text-xs font-bold text-slate-700">Historial de versiones</p>
                      {versionLog.items.length === 0 ? (
                        <p className="text-xs text-slate-400">Sin registros.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {versionLog.items.map((v) => (
                            <li key={v.version} className="text-xs text-slate-600">
                              <span className="font-mono font-bold text-brand-700">v{v.version}</span>
                              <span className="text-slate-400"> · {formatDate(v.createdAt)}</span>
                              {v.notes ? <p className="mt-0.5 text-slate-500">{v.notes}</p> : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  {item.licenseKey && (
                    <button
                      type="button"
                      title="Licencia única de esta compra"
                      onClick={() => { navigator.clipboard?.writeText(item.licenseKey!).catch(() => {}); notify('Licencia copiada al portapapeles', 'info') }}
                      className="mt-2 w-fit rounded-md bg-slate-100 px-2 py-1 font-mono text-[11px] font-semibold text-slate-600 hover:bg-brand-50 hover:text-brand-700"
                    >
                      {item.licenseKey} · copiar
                    </button>
                  )}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-bold text-green-700">{item.license}</span>
                      <span className="text-[11px] text-slate-400">{item.downloads} descargas</span>
                    </div>
                    <Button size="sm" onClick={() => void downloadFromLibrary(item)} loading={downloading === item.id}>
                      <Download className="h-4 w-4" /> Descargar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Mis productos */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Package className="h-5 w-5 text-brand-600" /> Mis Productos</h2>
            <Link to="/publicar" className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700">
              <UserPlus className="h-4 w-4" /> Publicar
            </Link>
          </div>
          <p className="mt-1 text-sm text-slate-500">Aquí aparecen los productos que has publicado y que gestionas como vendedor.</p>

          {loadingMine ? (
            <p className="mt-4 text-sm text-slate-400">Cargando…</p>
          ) : mine.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              Aún no tienes productos publicados. ¡Crea tu primer producto!
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {mine.map((p) => (
                <li key={p.id} className="flex items-center gap-4 rounded-xl border border-slate-200 p-3">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-50">
                    <ProductImage src={p.image} fallback={p.category} name={p.name} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link to={`/producto/${p.slug}`} className="block truncate font-semibold text-slate-800 hover:text-brand-700">{p.name}</Link>
                    <p className="text-sm text-slate-500">{formatPrice(p.price, region)} · {p.fileType ?? 'Digital'}</p>
                  </div>
                  <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', p.status === 'hidden' ? 'bg-slate-100 text-slate-500' : 'bg-green-50 text-green-700')}>
                    {p.status === 'hidden' ? 'Oculto' : 'Activo'}
                  </span>
                  <button
                    onClick={() => openEdit(p)}
                    aria-label={`Editar ${p.name}`}
                    className="rounded-lg p-2 text-slate-400 hover:bg-brand-50 hover:text-brand-600"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => void removeProduct(p.id)} aria-label={`Eliminar ${p.name}`} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Mis publicaciones */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Video className="h-5 w-5 text-brand-600" /> Mis Publicaciones</h2>
            <Link to="/feed" className="text-sm font-bold text-brand-700 hover:underline">Ver feed</Link>
          </div>
          <p className="mt-1 text-sm text-slate-500">Aquí aparecen tus vídeos y fotos publicados en la comunidad.</p>
          {loadingMyPosts ? (
            <p className="mt-4 text-sm text-slate-400">Cargando…</p>
          ) : myPosts.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Aún no has publicado vídeos o fotos. <Link to="/feed" className="font-bold text-brand-700 hover:underline">Crear publicación</Link></div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {myPosts.map((post) => (
                <article key={post.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                  <div className="aspect-video bg-slate-950">
                    {post.videoUrl.startsWith('data:image/') ? <img src={post.videoUrl} alt={post.title} className="h-full w-full object-cover" /> : <video src={post.videoUrl} controls preload="metadata" className="h-full w-full object-cover" />}
                  </div>
                  <div className="p-4"><h3 className="truncate font-bold text-slate-900">{post.title}</h3><p className="mt-1 line-clamp-2 text-sm text-slate-500">{post.description}</p><p className="mt-2 text-xs text-slate-400">{new Date(post.createdAt).toLocaleDateString('es-ES')}</p><div className="mt-3 flex gap-2"><button type="button" onClick={() => { setPostError(''); setPostEdit(post) }} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold text-brand-700 hover:bg-brand-100"><Pencil className="h-3.5 w-3.5" /> Editar</button><button type="button" onClick={() => void removePost(post.id)} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /> Borrar</button></div></div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Modal de edición de publicación */}
      {postEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onClick={() => setPostEdit(null)}>
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Editar publicación">
            <div className="flex items-center justify-between"><h2 className="text-xl font-extrabold text-slate-900">Editar publicación</h2><button type="button" onClick={() => setPostEdit(null)} aria-label="Cerrar" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
            <form onSubmit={savePostEdit} className="mt-5 space-y-4">
              <div><label htmlFor="post-title" className="text-sm font-semibold text-slate-600">Título</label><input id="post-title" value={postEdit.title} onChange={(event) => setPostEdit({ ...postEdit, title: event.target.value })} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-brand-400" /></div>
              <div><label htmlFor="post-description" className="text-sm font-semibold text-slate-600">Descripción</label><textarea id="post-description" value={postEdit.description} onChange={(event) => setPostEdit({ ...postEdit, description: event.target.value })} rows={4} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-400" /></div>
              <div><label htmlFor="post-media" className="text-sm font-semibold text-slate-600">Vídeo o foto</label><input id="post-media" value={postEdit.videoUrl} onChange={(event) => setPostEdit({ ...postEdit, videoUrl: event.target.value })} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-brand-400" placeholder="URL o archivo capturado" /><p className="mt-1 text-xs text-slate-400">Conserva el contenido actual o pega una URL multimedia válida.</p></div>
              <div><label htmlFor="post-code" className="text-sm font-semibold text-slate-600">Código de producto (opcional)</label><input id="post-code" value={postEdit.productCode ?? ''} onChange={(event) => setPostEdit({ ...postEdit, productCode: event.target.value.toUpperCase() || null })} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-brand-400" /></div>
              {postError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{postError}</p>}
              <div className="flex gap-3"><Button type="submit" loading={savingPost} className="flex-1"><Save className="h-4 w-4" /> Guardar cambios</Button><Button type="button" variant="outline" onClick={() => setPostEdit(null)}>Cancelar</Button></div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de edición */}
      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onClick={() => setEdit(null)}>
          <div
            className="animate-fade-up max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Editar producto"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-extrabold text-slate-900">Editar publicación</h2>
              <button onClick={() => setEdit(null)} aria-label="Cerrar" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={saveEdit} noValidate className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {editField('name', 'Nombre del producto', (
                  <input id="e-name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={editInputCls('name')} />
                ))}
                {editField('category', 'Categoría', (
                  <select id="e-category" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} className={editInputCls('')}>
                    {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                ))}
              </div>

              {editField('description', 'Descripción', (
                <textarea id="e-description" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} rows={4} className={cn(editInputCls('description'), 'h-auto py-3')} />
              ))}

              <div className="grid gap-4 sm:grid-cols-3">
                {editField('price', `Precio (${region.symbol})`, (
                  <input id="e-price" type="number" min="0" step="any" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} className={editInputCls('price')} />
                ))}
                {editField('oldPrice', 'Precio anterior (opcional)', (
                  <input id="e-oldPrice" type="number" min="0" step="any" value={edit.oldPrice} onChange={(e) => setEdit({ ...edit, oldPrice: e.target.value })} className={editInputCls('')} />
                ))}
                {editField('stock', 'Stock disponible', (
                  <input id="e-stock" type="number" min="0" value={edit.stock} onChange={(e) => setEdit({ ...edit, stock: e.target.value })} className={editInputCls('stock')} />
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {editField('image', 'Imagen del producto', (
                  <ImageUpload
                    value={edit.image}
                    onChange={(v) => setEdit({ ...edit, image: v })}
                    placeholder="https://… o sube una foto"
                  />
                ))}
                {editField('badge', 'Etiqueta', (
                  <select id="e-badge" value={edit.badge} onChange={(e) => setEdit({ ...edit, badge: e.target.value })} className={editInputCls('')}>
                    {BADGES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                  </select>
                ))}
              </div>

              {editField('features', 'Características (una por línea)', (
                <textarea id="e-features" value={edit.features} onChange={(e) => setEdit({ ...edit, features: e.target.value })} rows={3} className={cn(editInputCls(''), 'h-auto py-3')} />
              ))}

              {editServerError && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{editServerError}</p>}

              <div className="flex gap-3">
                <Button type="submit" loading={savingEdit} className="flex-1">
                  <Save className="h-4 w-4" /> Guardar cambios
                </Button>
                <Button type="button" variant="outline" onClick={() => setEdit(null)}>
                  Cancelar
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
