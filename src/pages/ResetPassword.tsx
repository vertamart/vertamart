import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, KeyRound, Lock, XCircle } from 'lucide-react'
import { authService } from '../api/services/auth'
import { ApiRequestError } from '../api/client'
import { Button } from '../components/ui/Button'
import { cn } from '../lib/cn'

/** Página de restablecimiento de contraseña: /recuperar?token=... */
export function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''

  const [checking, setChecking] = useState(true)
  const [valid, setValid] = useState(false)
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!/^[a-f0-9]{64}$/.test(token)) {
      setValid(false)
      setChecking(false)
      return
    }
    let cancelled = false
    authService
      .verifyResetToken(token)
      .then((res) => { if (!cancelled) setValid(res.valid) })
      .catch(() => { if (!cancelled) setValid(false) })
      .finally(() => { if (!cancelled) setChecking(false) })
    return () => { cancelled = true }
  }, [token])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const er: Record<string, string> = {}
    if (pass.length < 6) er.pass = 'Mínimo 6 caracteres'
    if (pass2 !== pass) er.pass2 = 'Las contraseñas no coinciden'
    setErrors(er)
    if (Object.keys(er).length > 0) return
    setLoading(true)
    setServerError('')
    try {
      await authService.resetPassword(token, pass)
      setDone(true)
    } catch (err) {
      setServerError(err instanceof ApiRequestError ? err.message : 'No se pudo actualizar la contraseña')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <KeyRound className="h-7 w-7" />
        </div>
        <h1 className="mt-5 text-center text-2xl font-extrabold text-slate-900">Nueva contraseña</h1>
        <p className="mt-1 text-center text-sm text-slate-500">Crea una contraseña nueva para tu cuenta de Vertamart.</p>

        {checking && (
          <p className="mt-8 text-center text-sm text-slate-400">Verificando el enlace…</p>
        )}

        {!checking && !valid && (
          <div className="mt-8 text-center">
            <XCircle className="mx-auto h-10 w-10 text-red-400" />
            <p className="mt-3 text-sm font-semibold text-slate-700">Este enlace no es válido o ha caducado.</p>
            <p className="mt-1 text-sm text-slate-500">Los enlaces de recuperación duran 1 hora y solo se usan una vez.</p>
            <Link to="/login" className="mt-6 inline-block rounded-xl bg-brand-600 px-6 py-3 font-bold text-white hover:bg-brand-700">
              Volver a iniciar sesión
            </Link>
          </div>
        )}

        {!checking && valid && done && (
          <div className="mt-8 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-green-500" />
            <p className="mt-3 text-sm font-semibold text-slate-700">Contraseña actualizada correctamente.</p>
            <p className="mt-1 text-sm text-slate-500">Por seguridad se cerraron todas tus sesiones abiertas.</p>
            <Link to="/login" className="mt-6 inline-block rounded-xl bg-brand-600 px-6 py-3 font-bold text-white hover:bg-brand-700">
              Iniciar sesión
            </Link>
          </div>
        )}

        {!checking && valid && !done && (
          <form onSubmit={submit} noValidate className="mt-8 space-y-4">
            <div>
              <label htmlFor="rp-pass" className="text-sm font-medium text-slate-600">Contraseña nueva</label>
              <div className="relative mt-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Lock className="h-4 w-4" /></span>
                <input
                  id="rp-pass"
                  type="password"
                  value={pass}
                  onChange={(e) => { setPass(e.target.value); setErrors((x) => ({ ...x, pass: '' })) }}
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password"
                  className={cn('h-11 w-full rounded-xl border bg-white pl-9 pr-3 text-sm outline-none transition-colors focus:border-brand-400', errors.pass ? 'border-red-300' : 'border-slate-200')}
                />
              </div>
              {errors.pass && <p className="mt-1 text-xs text-red-500">{errors.pass}</p>}
            </div>
            <div>
              <label htmlFor="rp-pass2" className="text-sm font-medium text-slate-600">Repetir contraseña</label>
              <div className="relative mt-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Lock className="h-4 w-4" /></span>
                <input
                  id="rp-pass2"
                  type="password"
                  value={pass2}
                  onChange={(e) => { setPass2(e.target.value); setErrors((x) => ({ ...x, pass2: '' })) }}
                  placeholder="Repite la contraseña"
                  autoComplete="new-password"
                  className={cn('h-11 w-full rounded-xl border bg-white pl-9 pr-3 text-sm outline-none transition-colors focus:border-brand-400', errors.pass2 ? 'border-red-300' : 'border-slate-200')}
                />
              </div>
              {errors.pass2 && <p className="mt-1 text-xs text-red-500">{errors.pass2}</p>}
            </div>

            {serverError && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{serverError}</p>}

            <Button type="submit" size="lg" loading={loading} className="w-full">
              Guardar contraseña
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-xs text-slate-400">
          <Link to="/login" className="hover:text-brand-700">← Volver a iniciar sesión</Link>
        </p>
      </div>
    </div>
  )
}
