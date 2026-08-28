import { useEffect, useState, type FormEvent } from 'react'
import { Headphones, LockKeyhole, MessageCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function SupportAccess() {
  const { user, status, supportLogin } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (status === 'authenticated' && user?.role === 'support') navigate('/chat', { replace: true })
  }, [status, user, navigate])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!password || loading) return
    setLoading(true)
    setError('')
    try {
      await supportLogin(password)
      navigate('/chat', { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo iniciar el acceso de soporte')
    } finally {
      setLoading(false)
    }
  }

  if (status === 'loading') return <div className="mx-auto max-w-md px-4 py-24 text-center text-slate-400">Cargando…</div>

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center sm:py-24">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-900 text-brand-300 shadow-xl">
        <Headphones className="h-10 w-10" />
      </div>
      <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-brand-600">Área interna</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">Acceso a soporte</h1>
      <p className="mt-3 text-slate-500">Accede al centro de mensajes para ayudar a los usuarios de Vertamart.</p>
      <form onSubmit={submit} className="mt-8 w-full rounded-3xl border border-slate-200 bg-white p-6 text-left shadow-sm">
        <label htmlFor="support-password" className="text-sm font-semibold text-slate-700">Contraseña de soporte</label>
        <div className="relative mt-2">
          <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input id="support-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 outline-none focus:border-brand-400 focus:bg-white" placeholder="Introduce la contraseña" />
        </div>
        {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={!password || loading} className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
          <MessageCircle className="h-4 w-4" /> {loading ? 'Comprobando…' : 'Entrar al chat de soporte'}
        </button>
      </form>
      <p className="mt-4 text-xs text-slate-400">El soporte solo tiene acceso a conversaciones. No puede comprar, publicar ni administrar la tienda.</p>
    </div>
  )
}
