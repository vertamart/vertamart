import { useCallback, useEffect, useState } from 'react'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import { CardElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js'
import { CreditCard, Plus, Star, Trash2, X } from 'lucide-react'
import { storeService } from '../../api/services/store'
import { Button } from './Button'
import { cn } from '../../lib/cn'

interface SavedMethod {
  id: string
  brand: string
  last4: string
  expMonth: number | null
  expYear: number | null
  isDefault: boolean
}

/** Modal que recoge la tarjeta con Stripe Elements y la guarda en el cliente Stripe. */
function AddCardForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!stripe || !elements) return
    setSaving(true)
    setError('')
    try {
      const { clientSecret } = await storeService.createPaymentSetup()
      const res = await stripe.confirmCardSetup(clientSecret, {
        payment_method: { card: elements.getElement(CardElement)! },
      })
      if (res.error) {
        setError(res.error.message ?? 'No se pudo guardar la tarjeta')
      } else {
        // La marca como predeterminada si es la primera tarjeta.
        await storeService.setDefaultPaymentMethod(res.setupIntent.payment_method as string).catch(() => 0)
        onDone()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la tarjeta')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Añadir tarjeta</h3>
          <button onClick={onCancel} aria-label="Cerrar" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <p className="mt-1 text-xs text-slate-500">Los datos van cifrados y directos a Stripe (PCI-DSS). No los almacenamos.</p>
        <div className="mt-4 rounded-xl border border-slate-200 p-4">
          <CardElement options={{ style: { base: { fontSize: '16px', color: '#0f172a' } } }} />
        </div>
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex gap-3">
          <Button onClick={() => void save()} loading={saving} className="flex-1"><CreditCard className="h-4 w-4" /> Guardar tarjeta</Button>
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        </div>
      </div>
    </div>
  )
}

export function PaymentMethods() {
  const [stripe, setStripe] = useState<Stripe | null>(null)
  const [methods, setMethods] = useState<SavedMethod[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    storeService.paymentMethods()
      .then((r) => { setMethods(r.items); setLoading(false) })
      .catch(() => { setMethods([]); setLoading(false) })
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    let active = true
    loadStripe((import.meta as any).env?.VITE_STRIPE_PUBLISHABLE_KEY || '')
      .then((s) => { if (active && s) setStripe(s) })
      .catch(() => 0)
    return () => { active = false }
  }, [])

  const setDefault = async (id: string) => {
    setBusy(id)
    await storeService.setDefaultPaymentMethod(id).catch(() => 0)
    setBusy(null)
    void load()
  }
  const remove = async (id: string) => {
    if (!window.confirm('¿Eliminar este método de pago?')) return
    setBusy(id)
    await storeService.deletePaymentMethod(id).catch(() => 0)
    setBusy(null)
    void load()
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-900"><CreditCard className="h-5 w-5 text-brand-600" /> Métodos de pago</h3>
        <Button size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Añadir</Button>
      </div>
      <p className="mt-1 text-sm text-slate-500">Tarjetas y métodos guardados de forma segura en Stripe. Solo vemos la marca y los últimos 4 dígitos.</p>

      {loading ? (
        <p className="mt-3 text-sm text-slate-400">Cargando métodos guardados…</p>
      ) : methods.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">
          Aún no tienes métodos guardados. Añade una tarjeta para pagar más rápido.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {methods.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
                <CreditCard className="h-5 w-5 text-slate-500" />
              </span>
              <span className="flex-1">
                <span className="block font-semibold text-slate-800 capitalize">{m.brand} •••• {m.last4}</span>
                <span className="block text-xs text-slate-400">
                  {m.expMonth && m.expYear ? `Caduca ${String(m.expMonth).padStart(2, '0')}/${m.expYear}` : '—'}
                  {m.isDefault && <span className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700"><Star className="h-3 w-3" /> Predeterminada</span>}
                </span>
              </span>
              {!m.isDefault && (
                <button onClick={() => void setDefault(m.id)} disabled={busy === m.id} className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50')}>
                  Predeterminar
                </button>
              )}
              <button onClick={() => void remove(m.id)} disabled={busy === m.id} aria-label="Eliminar método" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && stripe && (
        <Elements stripe={stripe}>
          <AddCardForm onDone={() => { setAdding(false); void load() }} onCancel={() => setAdding(false)} />
        </Elements>
      )}
    </div>
  )
}
