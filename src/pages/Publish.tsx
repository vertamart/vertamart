import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, PackagePlus, User as UserIcon } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useRegion } from '../context/RegionContext'
import { useCatalog } from '../context/CatalogContext'
import { formatPrice } from '../lib/currency'
import { CATEGORIES } from '../data/products'
import { storeService } from '../api/services/store'
import { ApiRequestError } from '../api/client'
import { Button } from '../components/ui/Button'
import { ImageUpload } from '../components/ui/ImageUpload'
import { cn } from '../lib/cn'

const BADGES = [
  { value: '', label: 'Sin etiqueta' },
  { value: 'nuevo', label: 'Nuevo' },
  { value: 'popular', label: 'Popular' },
  { value: 'top', label: 'Top ventas' },
]

export function Publish() {
  const { user, status } = useAuth()
  const { region } = useRegion()
  const { refresh } = useCatalog()

  const [name, setName] = useState('')
  const [category, setCategory] = useState<string>(CATEGORIES[0].id)
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [oldPrice, setOldPrice] = useState('')
  const [stock, setStock] = useState('10')
  const [image, setImage] = useState('')
  const [features, setFeatures] = useState('')
  const [badge, setBadge] = useState('')
  const [warranty, setWarranty] = useState('')
  const [shipDays, setShipDays] = useState('2')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  if (status === 'loading') {
    return <div className="mx-auto max-w-2xl px-4 py-24 text-center text-slate-400">Cargando…</div>
  }

  if (!user) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50">
          <UserIcon className="h-8 w-8 text-brand-600" />
        </div>
        <h1 className="mt-4 text-2xl font-extrabold text-slate-900">Inicia sesión para publicar</h1>
        <p className="mt-2 text-slate-500">Solo los usuarios con cuenta pueden publicar productos en la tienda.</p>
        <Link to="/login" className="mt-6 rounded-xl bg-brand-600 px-7 py-3.5 font-bold text-white hover:bg-brand-700">
          Iniciar sesión
        </Link>
      </div>
    )
  }

  if (done) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-24 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-100">
          <CheckCircle2 className="h-10 w-10 text-brand-600" />
        </div>
        <h1 className="mt-6 text-3xl font-extrabold text-slate-900">¡Publicado!</h1>
        <p className="mt-3 text-slate-500">Tu producto ya está visible en el catálogo de la tienda.</p>
        <div className="mt-8 flex gap-3">
          <Link to="/productos" className="rounded-xl bg-brand-600 px-6 py-3 font-bold text-white hover:bg-brand-700">Ver catálogo</Link>
          <Link to="/cuenta" className="rounded-xl border border-slate-200 px-6 py-3 font-bold text-slate-700 hover:border-brand-400">Ir a mi cuenta</Link>
        </div>
      </div>
    )
  }

  const priceClp = price ? Math.round(Number(price) / region.rate) : 0
  const oldPriceClp = oldPrice ? Math.round(Number(oldPrice) / region.rate) : undefined

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const er: Record<string, string> = {}
    if (name.trim().length < 3) er.name = 'El nombre debe tener al menos 3 caracteres'
    if (description.trim().length < 10) er.description = 'Describe tu producto (mínimo 10 caracteres)'
    const numPrice = Number(price)
    if (!Number.isFinite(numPrice) || numPrice <= 0) er.price = 'Ingresa un precio válido'
    const numStock = Number(stock)
    if (!Number.isInteger(numStock) || numStock < 0) er.stock = 'Stock no válido'
    if (image && !/^(https?:\/\/|data:image\/)/.test(image)) er.image = 'La imagen debe ser una URL o una foto válida'
    const numShip = Number(shipDays)
    if (!Number.isInteger(numShip) || numShip < 0 || numShip > 90) er.shipDays = 'Días de envío entre 0 y 90'
    if (warranty.trim().length > 80) er.warranty = 'La garantía es demasiado larga'
    setErrors(er)
    if (Object.keys(er).length > 0) return

    setSaving(true)
    setServerError('')
    try {
      await storeService.createProduct({
        name: name.trim(),
        description: description.trim(),
        category,
        price: priceClp,
        oldPrice: oldPriceClp,
        stock: numStock,
        image: image.trim(),
        features: features.split('\n').map((f) => f.trim()).filter(Boolean),
        badge: badge || undefined,
        warranty: warranty.trim() || undefined,
        shipDays: numShip,
      })
      refresh() // el catálogo se recarga y el producto aparece sin recargar la página
      setDone(true)
    } catch (err) {
      setServerError(err instanceof ApiRequestError ? err.message : 'No se pudo publicar. ¿Está corriendo el backend? (npm run server)')
    } finally {
      setSaving(false)
    }
  }

  const field = (key: string, label: string, el: React.ReactNode) => (
    <div>
      <label htmlFor={`p-${key}`} className="text-sm font-medium text-slate-600">{label}</label>
      {el}
      {errors[key] && <p className="mt-1 text-xs text-red-500">{errors[key]}</p>}
    </div>
  )

  const inputCls = (key: string) =>
    cn('mt-1 h-11 w-full rounded-xl border bg-white px-3.5 text-sm outline-none transition-colors focus:border-brand-400', errors[key] ? 'border-red-300' : 'border-slate-200')

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Publicar un producto</h1>
      <p className="mt-1 text-slate-500">
        Tu publicación aparecerá en el catálogo con tu nombre de vendedor.
      </p>

      <form onSubmit={submit} noValidate className="mt-8 space-y-6 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {field('name', 'Nombre del producto', (
            <input id="p-name" value={name} onChange={(e) => { setName(e.target.value); setErrors((x) => ({ ...x, name: '' })) }} placeholder="Ej: Soporte de laptop Verta" className={inputCls('name')} />
          ))}
          {field('category', 'Categoría', (
            <select id="p-category" value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls('')}>
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          ))}
        </div>

        {field('description', 'Descripción', (
          <textarea id="p-description" value={description} onChange={(e) => { setDescription(e.target.value); setErrors((x) => ({ ...x, description: '' })) }} rows={4} placeholder="Cuenta qué es y qué lo hace especial…" className={cn(inputCls('description'), 'h-auto py-3')} />
        ))}

        <div className="grid gap-4 sm:grid-cols-3">
          {field('price', `Precio (${region.symbol})`, (
            <input id="p-price" type="number" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={region.code === 'CL' ? '59990' : '66'} className={inputCls('price')} />
          ))}
          {field('oldPrice', 'Precio anterior (opcional)', (
            <input id="p-oldPrice" type="number" min="0" step="any" value={oldPrice} onChange={(e) => setOldPrice(e.target.value)} placeholder={region.code === 'CL' ? '79990' : '88'} className={inputCls('')} />
          ))}
          {field('stock', 'Stock disponible', (
            <input id="p-stock" type="number" min="0" value={stock} onChange={(e) => setStock(e.target.value)} className={inputCls('stock')} />
          ))}
        </div>
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Se guarda como {formatPrice(priceClp)} (precio base CLP) y se convierte automáticamente para cada país.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {field('image', 'Imagen del producto', (
            <ImageUpload
              value={image}
              onChange={(v) => { setImage(v); setErrors((x) => ({ ...x, image: '' })) }}
              placeholder="https://… o sube una foto desde tu dispositivo"
            />
          ))}
          {field('badge', 'Etiqueta', (
            <select id="p-badge" value={badge} onChange={(e) => setBadge(e.target.value)} className={inputCls('')}>
              {BADGES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          ))}
        </div>

        {field('features', 'Características (una por línea)', (
          <textarea id="p-features" value={features} onChange={(e) => setFeatures(e.target.value)} rows={3} placeholder={'Batería de 20 h\nResistente al agua\nConexión Bluetooth'} className={cn(inputCls(''), 'h-auto py-3')} />
        ))}

        <div className="grid gap-4 sm:grid-cols-2">
          {field('warranty', 'Garantía (duración personalizada)', (
            <div>
              <input id="p-warranty" value={warranty} onChange={(e) => { setWarranty(e.target.value); setErrors((x) => ({ ...x, warranty: '' })) }} placeholder="Ej: 12 meses · 2 años · Garantía de por vida" className={inputCls('warranty')} />
              <p className="mt-1 text-xs text-slate-400">Cuánto cubre la garantía de tu producto.</p>
            </div>
          ))}
          {field('shipDays', 'Tiempo normal de envío (días)', (
            <div>
              <input id="p-shipDays" type="number" min="0" max="90" value={shipDays} onChange={(e) => { setShipDays(e.target.value); setErrors((x) => ({ ...x, shipDays: '' })) }} className={inputCls('shipDays')} />
              <p className="mt-1 text-xs text-slate-400">En cuántos días hábiles llega normalmente.</p>
            </div>
          ))}
        </div>

        {serverError && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{serverError}</p>}

        <Button type="submit" size="lg" loading={saving} className="w-full">
          <PackagePlus className="h-5 w-5" /> Publicar producto
        </Button>
      </form>
    </div>
  )
}
