import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, CreditCard, Download, Landmark, Lock, Package, ShoppingBag, User, Wallet } from 'lucide-react'
import { useStore } from '../context/StoreContext'
import { useCatalog } from '../context/CatalogContext'
import { useAuth } from '../context/AuthContext'
import { paymentsProvider, type PaymentMethod } from '../api/payments'
import { storeService } from '../api/services/store'
import type { Product } from '../data/products'
import { usePersistentState } from '../hooks/usePersistentState'
import { ProductImage } from '../components/ui/ProductImage'
import { Button } from '../components/ui/Button'
import { formatPrice } from '../lib/currency'
import { useRegion } from '../context/RegionContext'
import { cn } from '../lib/cn'

const INSTALLMENTS = [1, 3, 6, 12]

const PAYMENT_METHODS: { id: PaymentMethod; label: string; hint: string }[] = [
  { id: 'card', label: 'Tarjeta de crédito / débito', hint: 'Visa, Mastercard, American Express' },
  { id: 'webpay', label: 'Webpay (Transbank)', hint: 'Redirección segura a tu banco' },
  { id: 'transfer', label: 'Transferencia bancaria', hint: 'Confirmación manual (24-48 h)' },
]

const BANK_DETAILS = {
  bank: 'Banco Estado',
  account: 'Cuenta Vista 123-4567-89',
  rut: '76.123.456-7',
  holder: 'Vertamart SpA',
}

interface FormState {
  nombre: string
  email: string
}

const initialForm: FormState = { nombre: '', email: '' }

/** Validación Luhn para números de tarjeta. */
function luhnValid(digits: string): boolean {
  let sum = 0
  let double = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i])
    if (double) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    double = !double
  }
  return sum % 10 === 0
}

const formatCardNumber = (v: string) => v.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ')
const formatExpiry = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 4)
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d
}

export function Checkout() {
  const { cart, cartSubtotal, clearCart, notify } = useStore()
  const { products, status } = useCatalog()
  const { region } = useRegion()
  const { user } = useAuth()
  const [form, setForm] = useState<FormState>(initialForm)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [coupon] = usePersistentState<{ code: string; percent: number; type?: 'percent' | 'fixed'; value?: number } | null>('verta.coupon', null)
  const [pointsAvailable, setPointsAvailable] = useState(0)
  const [redeemPoints, setRedeemPoints] = useState(0)
  const [orderId] = useState(() => `VT-${Math.floor(100000 + Math.random() * 900000)}`)
  const [method, setMethod] = useState<PaymentMethod>('card')
  const [installments, setInstallments] = useState(1)
  const [card, setCard] = useState({ numero: '', vencimiento: '', cvv: '', titular: '' })
  const [cardErrors, setCardErrors] = useState<Partial<Record<keyof typeof card, string>>>({})
  const [processing, setProcessing] = useState(false)
  const [payError, setPayError] = useState('')
  const [result, setResult] = useState<{ transactionId: string; status: 'approved' | 'pending' } | null>(null)
  const [done, setDone] = useState(false)
  const [tracking, setTracking] = useState<{ url: string; emailSent: boolean } | null>(null)
  const navigate = useNavigate()
  const [payoutInfo, setPayoutInfo] = useState<{ provider: string; label: string; accountRef: string; paypalEmail?: string | null } | null>(null)

  // Datos reales de la cuenta receptora (los del Panel → Cuentas) para pagos por transferencia.
  useEffect(() => {
    storeService.payoutInfo().then(setPayoutInfo).catch(() => setPayoutInfo(null))
  }, [])

  // Puntos de fidelidad del usuario logueado.
  useEffect(() => {
    if (!user) return
    let active = true
    storeService.myPoints().then((p) => { if (active) setPointsAvailable(p.points) }).catch(() => {})
    return () => { active = false }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Items normales del carrito.
  const items: { id: string; qty: number; product: Product }[] = cart.flatMap((i) => {
    const product = products.find((p) => p.id === i.id)
    return product ? [{ ...i, product }] : []
  })
  // Bundles: se expanden en sus productos individuales para el pedido (la biblioteca registra cada uno).
  const bundleExpanded: { product: Product; qty: number }[] = cart.flatMap((i) => {
    if (!i.bundle) return []
    const included = products.filter((p) => i.bundle!.productSlugs.includes(p.slug))
    return included.map((p) => ({ product: p, qty: i.qty }))
  })
  const allItems = [...items, ...bundleExpanded]
  // Suma de precios individuales (sin el descuento del bundle) para el pedido.
  const regularSubtotal = allItems.reduce((sum, { product, qty }) => sum + product.price * qty, 0)
  // Lo que se ahorra por los bundles (regular - precio de pack).
  const bundleSavings = Math.max(0, regularSubtotal - cartSubtotal)
  const discount = coupon
    ? coupon.type === 'fixed'
      ? Math.min(coupon.value ?? 0, cartSubtotal)
      : Math.round(cartSubtotal * (coupon.percent / 100))
    : 0
  const maxRedeem = Math.max(0, Math.min(pointsAvailable, cartSubtotal - discount))
  const pointsDiscount = Math.min(redeemPoints, maxRedeem)
  // Tienda 100% digital: sin gastos de envío.
  const total = Math.max(0, cartSubtotal - discount - pointsDiscount)
  const installmentPrice = installments > 1 ? Math.ceil(total / installments) : total

  if (done) {
    const approved = result?.status === 'approved'
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-24 text-center">
        <div className={cn('flex h-20 w-20 items-center justify-center rounded-full', approved ? 'bg-brand-100' : 'bg-amber-100')}>
          {approved ? <CheckCircle2 className="h-10 w-10 text-brand-600" /> : <ClockIcon />}
        </div>
        <h1 className="mt-6 text-3xl font-extrabold text-slate-900">
          {approved ? '¡Compra completada!' : 'Pedido recibido'}
        </h1>
        <p className="mt-3 text-slate-500">
          Tu pedido digital <strong>{orderId}</strong>{' '}
          {approved ? 'ha sido pagado correctamente. Tus descargas ya están disponibles.' : 'quedó pendiente de confirmación de la transferencia. Se liberarán al aprobarse.'}
        </p>
        {result && (
          <p className="mt-2 rounded-xl bg-slate-100 px-4 py-2 font-mono text-sm text-slate-600">
            Transacción: {result.transactionId}
          </p>
        )}
        {tracking ? (
          tracking.emailSent ? (
            <p className="mt-2 text-sm text-slate-500">Te enviamos un correo con el enlace privado de seguimiento.</p>
          ) : (
            <div className="mt-4 w-full max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left">
              <p className="text-sm font-bold text-amber-800">📧 El correo no se pudo enviar a {form.email}</p>
              <p className="mt-1 text-xs text-amber-700">
                El plan de correo aún no permite enviar a destinatarios fuera del equipo. Guarda este enlace privado para seguir tu pedido:
              </p>
              <a href={tracking.url} className="mt-2 block break-all rounded-lg bg-white px-3 py-2 text-xs font-bold text-brand-700 shadow-sm hover:underline">
                {tracking.url}
              </a>
            </div>
          )
        ) : (
          <p className="mt-2 text-sm text-slate-500">Recibirás un correo con el enlace de tu biblioteca digital.</p>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {user ? (
            <>
              <Link to="/cuenta?tab=descargas" className="rounded-xl bg-brand-600 px-7 py-3.5 font-bold text-white transition-colors hover:bg-brand-700">
                <span className="inline-flex items-center gap-2"><Download className="h-5 w-5" /> Ver mi biblioteca</span>
              </Link>
              <Link to="/cuenta?tab=descargas" className="rounded-xl border-2 border-brand-600 px-7 py-3.5 font-bold text-brand-700 transition-colors hover:bg-brand-50">
                Descargar ahora
              </Link>
            </>
          ) : (
            <Link to="/productos" className="rounded-xl bg-brand-600 px-7 py-3.5 font-bold text-white hover:bg-brand-700">
              Seguir comprando
            </Link>
          )}
        </div>
        {approved && (
          <p className="mt-3 max-w-md text-sm text-slate-500">
            Tu producto ya está disponible en tu biblioteca con su <strong>licencia única</strong>. Podrás descargarlo siempre que quieras y recibir actualizaciones según la licencia.
          </p>
        )}
        <p className="mt-2 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-700">
          Pago de demostración: no se realizó ningún cargo real ni se almacenaron datos de tarjeta. El producto entregado es real y descargable.
        </p>
      </div>
    )
  }

  if (status === 'loading' && allItems.length === 0) {
    return <div className="mx-auto max-w-7xl px-4 py-24 text-center text-slate-400">Cargando tu pedido…</div>
  }

  if (allItems.length === 0) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col items-center px-4 py-24 text-center">
        <ShoppingBag className="h-12 w-12 text-slate-300" />
        <h1 className="mt-4 text-2xl font-extrabold text-slate-900">No hay productos para pagar</h1>
        <Link to="/productos" className="mt-6 rounded-xl bg-brand-600 px-6 py-3 font-bold text-white hover:bg-brand-700">Ir al catálogo</Link>
      </div>
    )
  }

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setErrors((er) => ({ ...er, [k]: undefined }))
  }

  const setCardField = (k: keyof typeof card) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    const value = k === 'numero' ? formatCardNumber(raw) : k === 'vencimiento' ? formatExpiry(raw) : k === 'cvv' ? raw.replace(/\D/g, '').slice(0, 4) : raw
    setCard((c) => ({ ...c, [k]: value }))
    setCardErrors((er) => ({ ...er, [k]: undefined }))
  }

  const validate = (): boolean => {
    const er: Partial<Record<keyof FormState, string>> = {}
    if (form.nombre.trim().length < 3) er.nombre = 'Ingresa tu nombre completo'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) er.email = 'Correo no válido'
    setErrors(er)
    return Object.keys(er).length === 0
  }

  const validateCard = (): boolean => {
    const digits = card.numero.replace(/\s/g, '')
    const er: Partial<Record<keyof typeof card, string>> = {}
    if (!/^\d{16}$/.test(digits)) {
      er.numero = 'La tarjeta debe tener 16 dígitos'
    } else if (!luhnValid(digits)) {
      er.numero = 'Número de tarjeta no válido'
    }
    if (!/^\d{2}\/\d{2}$/.test(card.vencimiento)) {
      er.vencimiento = 'Formato MM/AA'
    } else {
      const [m, y] = card.vencimiento.split('/').map(Number)
      if (m < 1 || m > 12) {
        er.vencimiento = 'Mes no válido'
      } else {
        const expiry = new Date(2000 + y, m, 0, 23, 59, 59)
        if (expiry < new Date()) er.vencimiento = 'Tarjeta vencida'
      }
    }
    if (!/^\d{3,4}$/.test(card.cvv)) er.cvv = 'CVV no válido'
    if (card.titular.trim().length < 3) er.titular = 'Ingresa el titular de la tarjeta'
    setCardErrors(er)
    return Object.keys(er).length === 0
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!validate()) {
      notify('Revisa los campos marcados', 'info')
      return
    }
    if (method === 'card' && !validateCard()) {
      notify('Revisa los datos de la tarjeta', 'info')
      return
    }
    setPayError('')
    setProcessing(true)
    try {
      const res = await paymentsProvider.processPayment({
        orderId,
        amount: total,
        method,
        installments: method === 'card' ? installments : undefined,
        card: method === 'card'
          ? { number: card.numero.replace(/\s/g, ''), expiry: card.vencimiento, cvv: card.cvv, holder: card.titular }
          : undefined,
        customer: { name: form.nombre, email: form.email },
      })
      if (res.status === 'approved' || res.status === 'pending') {
        setResult({ transactionId: res.transactionId ?? orderId, status: res.status })
        // Guardar el pedido primero: devuelve el enlace privado del correo.
        void storeService
          .createOrder({
            items: allItems.map(({ product, qty }) => ({ productId: product.id, name: product.name, price: product.price, qty })),
            subtotal: regularSubtotal,
            discount: discount + bundleSavings,
            shipping: 0,
            total,
            method,
            transactionId: res.transactionId,
            installments: method === 'card' ? installments : undefined,
            paymentStatus: res.status,
            customerName: form.nombre,
            customerEmail: form.email,
            redeemPoints: pointsDiscount,
            promoCode: coupon?.code,
          })
          .then((saved) => {
            clearCart()
            setDone(true)
            if (saved.trackingUrl) {
              setTracking({ url: saved.trackingUrl, emailSent: !!saved.emailSent })
              notify(saved.emailSent ? `Seguimiento enviado a ${form.email}` : 'Pedido creado. Guarda el enlace de seguimiento', 'info')
            }
          })
          .catch(() => {
            clearCart()
            setDone(true)
            notify('Pedido creado localmente; no se pudo enviar el correo', 'info')
          })
      } else {
        setPayError(res.message ?? 'El pago no pudo completarse. Intenta de nuevo.')
      }
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Error al procesar el pago')
    } finally {
      setProcessing(false)
    }
  }

  const field = (k: keyof FormState, label: string, placeholder: string, extra?: { type?: string; className?: string }) => (
    <div className={extra?.className}>
      <label htmlFor={`f-${k}`} className="text-sm font-medium text-slate-600">{label}</label>
      <input
        id={`f-${k}`}
        type={extra?.type ?? 'text'}
        value={form[k]}
        onChange={set(k)}
        placeholder={placeholder}
        className={cn('mt-1 h-11 w-full rounded-xl border bg-white px-3.5 text-sm outline-none transition-colors focus:border-brand-400', errors[k] ? 'border-red-300' : 'border-slate-200')}
      />
      {errors[k] && <p className="mt-1 text-xs text-red-500">{errors[k]}</p>}
    </div>
  )

  const cardField = (k: keyof typeof card, label: string, placeholder: string, extra?: { type?: string; maxLength?: number; className?: string; inputMode?: React.InputHTMLAttributes<HTMLInputElement>['inputMode'] }) => (
    <div className={extra?.className}>
      <label htmlFor={`c-${k}`} className="text-sm font-medium text-slate-600">{label}</label>
      <input
        id={`c-${k}`}
        type={extra?.type ?? 'text'}
        inputMode={extra?.inputMode}
        value={card[k]}
        onChange={setCardField(k)}
        placeholder={placeholder}
        maxLength={extra?.maxLength}
        autoComplete="off"
        className={cn('mt-1 h-11 w-full rounded-xl border bg-white px-3.5 text-sm outline-none transition-colors focus:border-brand-400', cardErrors[k] ? 'border-red-300' : 'border-slate-200')}
      />
      {cardErrors[k] && <p className="mt-1 text-xs text-red-500">{cardErrors[k]}</p>}
    </div>
  )

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Finalizar compra</h1>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
          <Lock className="h-3.5 w-3.5" /> Pago simulado (demo)
        </span>
      </div>

      <form onSubmit={submit} noValidate className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {/* Entrega digital */}
          <section className="rounded-2xl border border-brand-100 bg-brand-50/60 p-6">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <Download className="h-5 w-5 text-brand-600" /> Entrega digital
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              No hay envíos ni direcciones: en cuanto se confirme tu pago, tus productos digitales se liberan al instante en tu <strong>biblioteca (Mis descargas)</strong> con su licencia incluida.
            </p>
          </section>

          {/* Datos personales */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><User className="h-5 w-5 text-brand-600" /> Datos personales</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {field('nombre', 'Nombre completo', 'Juan Pérez')}
              {field('email', 'Correo electrónico', 'juan@correo.com', { type: 'email' })}
            </div>
            <p className="mt-3 text-xs text-slate-400">A este correo enviaremos la confirmación y el enlace privado de seguimiento.</p>
          </section>

          {/* Método de pago */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><CreditCard className="h-5 w-5 text-brand-600" /> Método de pago</h2>
            <p className="mt-1 text-xs text-slate-400">Demo: no se procesan pagos reales ni se almacenan datos de tarjeta.</p>

            <div className="mt-4 space-y-3">
              {PAYMENT_METHODS.map((m) => (
                <label key={m.id} className={cn('flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors', method === m.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-brand-300')}>
                  <input type="radio" name="payment" value={m.id} checked={method === m.id} onChange={() => setMethod(m.id)} className="h-4 w-4 accent-brand-600" />
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 shadow-sm">
                    {m.id === 'card' && <CreditCard className="h-5 w-5" />}
                    {m.id === 'webpay' && <Landmark className="h-5 w-5" />}
                    {m.id === 'transfer' && <Wallet className="h-5 w-5" />}
                  </span>
                  <span className="flex-1">
                    <span className="block font-semibold text-slate-800">{m.label}</span>
                    <span className="block text-sm text-slate-500">{m.hint}</span>
                  </span>
                </label>
              ))}
            </div>

            {method === 'card' && (
              <div className="mt-5 rounded-xl bg-slate-50 p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  {cardField('numero', 'Número de tarjeta', '4111 1111 1111 1111', { inputMode: 'numeric', maxLength: 19, className: 'sm:col-span-2' })}
                  {cardField('vencimiento', 'Vencimiento (MM/AA)', '12/28', { inputMode: 'numeric', maxLength: 5 })}
                  {cardField('cvv', 'CVV', '123', { inputMode: 'numeric', maxLength: 4 })}
                  {cardField('titular', 'Titular de la tarjeta', 'JUAN PEREZ', { className: 'sm:col-span-2' })}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <label htmlFor="installments" className="text-sm font-medium text-slate-600">Cuotas:</label>
                  <select
                    id="installments"
                    value={installments}
                    onChange={(e) => setInstallments(Number(e.target.value))}
                    className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-brand-400"
                  >
                    {INSTALLMENTS.map((n) => (
                      <option key={n} value={n}>{n === 1 ? 'Pago único' : `${n} cuotas`}</option>
                    ))}
                  </select>
                  {installments > 1 && (
                    <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
                      Sin interés: {installments} cuotas de {formatPrice(installmentPrice, region)}
                    </span>
                  )}
                </div>
              </div>
            )}

            {method === 'webpay' && (
              <div className="mt-5 flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                <Landmark className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
                <p>Serás redirigido al portal de <strong>Webpay (Transbank)</strong> para autorizar el pago con tu banco. En esta demo la redirección se simula y el pago se aprueba al instante.</p>
              </div>
            )}

            {method === 'transfer' && (
              <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                <p className="font-semibold text-slate-800">Datos para transferir</p>
                {payoutInfo ? (
                  <dl className="mt-2 space-y-1 font-mono text-xs">
                    <div><dt className="inline text-slate-400">Beneficiario: </dt><dd className="inline">{payoutInfo.label}</dd></div>
                    {payoutInfo.provider === 'paypal' ? (
                      <div><dt className="inline text-slate-400">PayPal: </dt><dd className="inline">{payoutInfo.accountRef}</dd></div>
                    ) : (
                      <div><dt className="inline text-slate-400">Cuenta: </dt><dd className="inline">{payoutInfo.accountRef}</dd></div>
                    )}
                    {payoutInfo.provider !== 'paypal' && payoutInfo.paypalEmail && (
                      <div><dt className="inline text-slate-400">PayPal: </dt><dd className="inline">{payoutInfo.paypalEmail}</dd></div>
                    )}
                    <div><dt className="inline text-slate-400">Referencia: </dt><dd className="inline font-bold">{orderId}</dd></div>
                  </dl>
                ) : (
                  <dl className="mt-2 space-y-1 font-mono text-xs">
                    <div><dt className="inline text-slate-400">Banco: </dt><dd className="inline">{BANK_DETAILS.bank}</dd></div>
                    <div><dt className="inline text-slate-400">Cuenta: </dt><dd className="inline">{BANK_DETAILS.account}</dd></div>
                    <div><dt className="inline text-slate-400">RUT: </dt><dd className="inline">{BANK_DETAILS.rut}</dd></div>
                    <div><dt className="inline text-slate-400">Titular: </dt><dd className="inline">{BANK_DETAILS.holder}</dd></div>
                    <div><dt className="inline text-slate-400">Referencia: </dt><dd className="inline font-bold">{orderId}</dd></div>
                  </dl>
                )}
                <p className="mt-3 text-xs">El pedido quedará <strong>pendiente</strong> hasta confirmar la transferencia (24-48 h hábiles). Cuando el dinero llegue, el administrador lo aprueba y recibirás un correo con tus descargas.</p>
              </div>
            )}

            {payError && (
              <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{payError}</p>
            )}
          </section>
        </div>

        {/* Resumen */}
        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-6 lg:sticky lg:top-24">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Package className="h-5 w-5 text-brand-600" /> Resumen</h2>
          <ul className="mt-4 space-y-3">
            {cart.map((item) => {
              if (item.bundle) {
                const bundle = item.bundle
                const included = products.filter((p) => bundle.productSlugs.includes(p.slug))
                return (
                  <li key={item.id} className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                    <div className="flex items-center gap-3">
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-50">
                        <ProductImage src={bundle.image} fallback="monitor" name={bundle.name} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-bold text-slate-800">
                          <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white">Bundle</span>
                          {bundle.name}
                        </p>
                        <p className="text-xs text-slate-500">{included.length} productos · × {item.qty}</p>
                      </div>
                      <span className="text-sm font-bold">{formatPrice(bundle.price * item.qty, region)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {included.map((p) => (
                        <span key={p.slug} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" /> {p.name}
                        </span>
                      ))}
                    </div>
                  </li>
                )
              }
              const product = products.find((p) => p.id === item.id)
              if (!product) return null
              return (
                <li key={item.id} className="flex items-center gap-3">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-50">
                    <ProductImage src={product.image} fallback={product.category} name={product.name} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{product.name}</p>
                    <p className="text-xs text-slate-400">× {item.qty}</p>
                  </div>
                  <span className="text-sm font-bold">{formatPrice(product.price * item.qty, region)}</span>
                </li>
              )
            })}
          </ul>

          <dl className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Productos</dt><dd className="font-semibold">{formatPrice(cartSubtotal, region)}</dd></div>
            {discount > 0 && <div className="flex justify-between text-brand-700"><dt>Cupón {coupon?.code}</dt><dd className="font-semibold">-{formatPrice(discount, region)}</dd></div>}
            {user && pointsAvailable > 0 && (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-green-50 px-3 py-2">
                <label className="flex items-center gap-2 text-sm text-slate-700"><span className="font-bold text-green-700">{pointsAvailable} pts</span> disponibles <span className="text-slate-400">(1 pt = {formatPrice(1, region)})</span></label>
                <input
                  type="number"
                  min="0"
                  max={maxRedeem}
                  value={redeemPoints}
                  onChange={(e) => setRedeemPoints(Math.max(0, Math.min(Number(e.target.value) || 0, maxRedeem)))}
                  className="h-8 w-20 rounded-lg border border-green-300 bg-white px-2 text-right text-sm"
                  aria-label="Puntos a canjear"
                />
              </div>
            )}
            {pointsDiscount > 0 && <div className="flex justify-between text-green-700"><dt>Puntos canjeados</dt><dd className="font-semibold">-{formatPrice(pointsDiscount, region)}</dd></div>}
            <div className="flex justify-between border-t border-slate-100 pt-3 text-lg"><dt className="font-bold">Total</dt><dd className="font-extrabold">{formatPrice(total, region)}</dd></div>
            {method === 'card' && installments > 1 && (
              <div className="flex justify-between text-xs text-slate-500"><dt>{installments} cuotas sin interés</dt><dd>{formatPrice(installmentPrice, region)}/mes</dd></div>
            )}
          </dl>

          <div className="mt-4 flex items-start gap-2 rounded-xl bg-green-50 px-3 py-2.5 text-xs text-green-700">
            <Download className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Entrega <strong>100% digital</strong>: descargas inmediatas con licencia, sin envíos ni costes de transporte.</p>
          </div>

          <Button type="submit" size="lg" loading={processing} className="mt-5 w-full" disabled={processing}>
            {processing ? 'Procesando pago...' : method === 'transfer' ? `Confirmar pedido` : `Pagar ${formatPrice(total, region)}`}
          </Button>
          <button type="button" onClick={() => navigate('/carrito')} className="mt-3 w-full text-center text-sm text-slate-400 hover:text-slate-600">
            ← Volver al carrito
          </button>
          <p className="mt-3 text-center text-xs text-slate-400">Compra protegida · Pago 100% simulado</p>
        </aside>
      </form>
    </div>
  )
}

/** Icono de reloj para el estado "pendiente" de la confirmación. */
function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-10 w-10 text-amber-600" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}
