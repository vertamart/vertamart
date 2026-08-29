import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownToLine, ArrowUpFromLine, Landmark, MessageSquare, Send, Wallet } from 'lucide-react'
import { storeService, type PayoutAccount } from '../../../api/services/store'
import { useAdmin } from '../context'
import { Field, inputCls, StatusBadge } from '../ui'
import { cn } from '../../../lib/cn'

export function SettingsTab() {
  const { payout, setPayout, notify, t } = useAdmin()
  const [payoutForm, setPayoutForm] = useState<PayoutAccount>({
    provider: payout?.provider ?? 'paypal',
    label: payout?.label ?? '',
    accountRef: payout?.accountRef ?? '',
    paypalEmail: payout?.paypalEmail ?? '',
  })
  const [payoutSaving, setPayoutSaving] = useState(false)
  const [pushForm, setPushForm] = useState({ title: 'Vertamart', message: '', url: '/' })
  const [pushSending, setPushSending] = useState(false)
  const [busyTx, setBusyTx] = useState<number | null>(null)

  const savePayout = async (e: FormEvent) => {
    e.preventDefault()
    if (payoutForm.label.trim().length < 2 || payoutForm.accountRef.trim().length < 3) { notify('La cuenta receptora necesita nombre y datos (cuenta o PayPal)'); return }
    if (payoutForm.provider === 'paypal' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payoutForm.accountRef.trim())) { notify('Si el proveedor es PayPal, el campo cuenta debe ser un correo válido', 'info'); return }
    setPayoutSaving(true)
    try {
      await storeService.savePayoutAccount({ ...payoutForm, accountRef: payoutForm.accountRef.trim() })
      const full = await storeService.getPayoutAccount()
      setPayout(full)
      notify(t('panel.payoutSaved'))
    } catch (err) { notify(err instanceof Error ? err.message : 'No se pudo guardar', 'info') } finally { setPayoutSaving(false) }
  }

  const confirmTx = async (id: number) => {
    setBusyTx(id)
    try {
      await storeService.confirmPayoutTransaction(id)
      setPayout(await storeService.getPayoutAccount())
      notify('Dinero acreditado a la cuenta receptora')
    } catch (err) { notify(err instanceof Error ? err.message : 'No se pudo confirmar', 'info') } finally { setBusyTx(null) }
  }

  const refundTx = async (id: number) => {
    setBusyTx(id)
    try {
      await storeService.refundPayoutTransaction(id)
      setPayout(await storeService.getPayoutAccount())
      notify('Transacción revertida', 'info')
    } catch (err) { notify(err instanceof Error ? err.message : 'No se pudo revertir', 'info') } finally { setBusyTx(null) }
  }

  const sendPush = async (e: FormEvent) => {
    e.preventDefault()
    if (!pushForm.message.trim()) { notify('Escribe el mensaje de la notificación', 'info'); return }
    setPushSending(true)
    try {
      const res = await storeService.adminSendPush(pushForm.message.trim(), { title: pushForm.title.trim() || 'Vertamart', url: pushForm.url.trim() || '/' })
      notify(res.sent > 0 ? `Notificación enviada a ${res.sent} dispositivo(s)` : 'No hay suscripciones push registradas aún', 'info')
    } catch (err) { notify(err instanceof Error ? err.message : 'No se pudo enviar la notificación', 'info') } finally { setPushSending(false) }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Cuenta receptora */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-600"><Landmark className="h-5 w-5" /></span>
          <div>
            <h2 className="font-bold text-slate-900">Cuenta receptora de dinero</h2>
            <p className="text-sm text-slate-500">Aquí llegan los ingresos de ventas y suscripciones.</p>
          </div>
        </div>
        <form onSubmit={savePayout} className="mt-5 grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Proveedor">
              <select className={inputCls} value={payoutForm.provider} onChange={(e) => setPayoutForm({ ...payoutForm, provider: e.target.value as PayoutAccount['provider'] })}>
                <option value="paypal">PayPal</option>
                <option value="bank">Banco</option>
                <option value="stripe">Stripe</option>
              </select>
            </Field>
            <Field label="Nombre de la cuenta"><input className={inputCls} value={payoutForm.label} onChange={(e) => setPayoutForm({ ...payoutForm, label: e.target.value })} /></Field>
          </div>
          <Field label={t('panel.accountRef')}><input className={inputCls} value={payoutForm.accountRef} onChange={(e) => setPayoutForm({ ...payoutForm, accountRef: e.target.value })} /></Field>
          <Field label="Email de PayPal (opcional)"><input className={inputCls} value={payoutForm.paypalEmail ?? ''} onChange={(e) => setPayoutForm({ ...payoutForm, paypalEmail: e.target.value })} /></Field>
          <div className="flex justify-end">
            <button type="submit" disabled={payoutSaving} className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50">
              {payoutSaving ? 'Guardando…' : 'Guardar cuenta'}
            </button>
          </div>
        </form>
        <p className="mt-3 text-xs text-slate-400">{t('panel.paypalNote')}</p>

        {payout && (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-green-50 p-4">
                <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-green-700"><Wallet className="h-3.5 w-3.5" /> Dinero recibido</p>
                <p className="mt-1 text-2xl font-extrabold text-green-900">${(payout.balance ?? 0).toFixed(2)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4 sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cuenta activa</p>
                <p className="mt-1 text-sm text-slate-700">{payout.label} · {payout.accountRef} · <strong>{payout.provider}</strong></p>
              </div>
            </div>

            <h3 className="mt-5 font-bold text-slate-900">Transacciones de dinero</h3>
            <div className="mt-2 overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase text-slate-400">
                    <th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Pagador</th><th className="px-3 py-2">Monto</th>
                    <th className="px-3 py-2">Estado</th><th className="px-3 py-2">Fecha</th><th className="px-3 py-2 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {(payout.transactions ?? []).length === 0 ? (
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">Sin movimientos todavía.</td></tr>
                  ) : payout.transactions?.map((tx) => (
                    <tr key={tx.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-3 py-2 capitalize text-slate-600">{tx.type}</td>
                      <td className="px-3 py-2">{tx.userName}</td>
                      <td className="px-3 py-2 font-semibold">${tx.amount.toFixed(2)} {tx.currency}</td>
                      <td className="px-3 py-2"><StatusBadge status={tx.status} label={tx.status} /></td>
                      <td className="px-3 py-2 text-xs text-slate-400">{new Date(tx.createdAt).toLocaleDateString('es-ES')}</td>
                      <td className="px-3 py-2 text-right">
                        {tx.status === 'pending' && (
                          <button onClick={() => void confirmTx(tx.id)} disabled={busyTx === tx.id} className="text-xs font-bold text-brand-700 hover:underline disabled:opacity-40">
                            <ArrowDownToLine className="mr-1 inline h-3.5 w-3.5" />Confirmar
                          </button>
                        )}
                        {tx.status === 'received' && (
                          <button onClick={() => void refundTx(tx.id)} disabled={busyTx === tx.id} className="text-xs font-bold text-red-500 hover:underline disabled:opacity-40">
                            <ArrowUpFromLine className="mr-1 inline h-3.5 w-3.5" />Revertir
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <div className="space-y-6">
        {/* Push */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Send className="h-5 w-5" /></span>
            <div>
              <h2 className="font-bold text-slate-900">Notificación push</h2>
              <p className="text-sm text-slate-500">Avisa a los clientes con la web instalada (escritorio, móvil o Android).</p>
            </div>
          </div>
          <form onSubmit={sendPush} className="mt-5 grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={pushForm.title} onChange={(e) => setPushForm({ ...pushForm, title: e.target.value })} placeholder="Título" className={inputCls} />
              <input value={pushForm.url} onChange={(e) => setPushForm({ ...pushForm, url: e.target.value })} placeholder="Enlace (ej. /ofertas)" className={inputCls} />
            </div>
            <textarea rows={2} value={pushForm.message} onChange={(e) => setPushForm({ ...pushForm, message: e.target.value })} required placeholder="Mensaje" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <div className="flex justify-end">
              <button type="submit" disabled={pushSending} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                <Send className="h-4 w-4" /> {pushSending ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
          </form>
        </section>

        {/* Soporte */}
        <Link to="/soporte" className={cn('flex items-center justify-between rounded-2xl border border-brand-200 bg-brand-50/60 p-5 shadow-sm transition-colors hover:border-brand-400 hover:bg-brand-50')}>
          <span className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-brand-300"><MessageSquare className="h-5 w-5" /></span>
            <span>
              <strong className="block text-sm text-slate-900">Acceso a soporte</strong>
              <span className="text-xs text-slate-500">Abrir el chat con la cuenta de soporte oficial</span>
            </span>
          </span>
          <span className="text-sm font-bold text-brand-700">Entrar →</span>
        </Link>
      </div>
    </div>
  )
}
