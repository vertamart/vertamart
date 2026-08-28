import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, KeyRound, Lock, LogIn, Mail, User as UserIcon, UserPlus } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { authService } from '../api/services/auth'
import { ApiRequestError, API_BASE_URL } from '../api/client'
import { Button } from '../components/ui/Button'
import { cn } from '../lib/cn'

type Mode = 'login' | 'register'

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
    <path fill="#EA4335" d="M12 5.3c1.7 0 3.2.6 4.4 1.7l3.3-3.3C17.6 1.9 15 1 12 1 7.7 1 4 3.4 2.2 7l3.9 3C7 7.2 9.3 5.3 12 5.3z" />
    <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.4c-.3 1.5-1.1 2.7-2.4 3.6l3.8 2.9c2.2-2 3.7-5 3.7-8.7z" />
    <path fill="#FBBC05" d="M6.1 14.3a7 7 0 0 1 0-4.6l-3.9-3a11.6 11.6 0 0 0 0 10.6l3.9-3z" />
    <path fill="#34A853" d="M12 23c3 0 5.6-1 7.4-2.7l-3.8-2.9c-1 .7-2.3 1.1-3.6 1.1-2.7 0-5-1.8-5.9-4.2l-3.9 3C4 21.1 7.7 23 12 23z" />
  </svg>
)
const AppleIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
    <path d="M16.7 12.9c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.9-1.6 0-3.1 1-4 2.4-1.7 2.9-.4 7.3 1.2 9.7.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.2-.8 1.5 0 1.9.8 3.2.8 1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8 0 0-2.5-1-2.6-3.7zM14.4 5.6c.7-.8 1.1-1.9 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4z" />
  </svg>
)

export function Login() {
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState('')
  const [emailCheck, setEmailCheck] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
  const [loading, setLoading] = useState(false)
  const [params] = useSearchParams()
  const oauthNotice = params.get('oauth')
  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotMsg, setForgotMsg] = useState('')
  const [forgotPath, setForgotPath] = useState('')
  const [forgotError, setForgotError] = useState('')

  const submitForgot = async (e: FormEvent) => {
    e.preventDefault()
    setForgotMsg(''); setForgotPath(''); setForgotError('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forgotEmail.trim())) {
      setForgotError('Ingresa un correo válido')
      return
    }
    setForgotLoading(true)
    try {
      const res = await authService.forgotPassword(forgotEmail.trim())
      setForgotMsg(res.message)
      if (res.resetUrl) {
        const u = new URL(res.resetUrl)
        setForgotPath(`${u.pathname}${u.search}`)
      }
    } catch (err) {
      setForgotError(err instanceof ApiRequestError ? err.message : 'No se pudo procesar la solicitud')
    } finally {
      setForgotLoading(false)
    }
  }

  useEffect(() => {
    if (mode !== 'register' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailCheck('idle')
      return
    }
    setEmailCheck('checking')
    const timer = window.setTimeout(() => {
      authService.checkEmail(email)
        .then((result) => setEmailCheck(result.available ? 'available' : 'taken'))
        .catch(() => setEmailCheck('idle'))
    }, 400)
    return () => window.clearTimeout(timer)
  }, [email, mode])

  const switchMode = (m: Mode) => {
    setMode(m)
    setErrors({})
    setServerError('')
  }

  const validate = (): boolean => {
    const er: Record<string, string> = {}
    if (mode === 'register' && name.trim().length < 2) er.name = 'Ingresa tu nombre'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) er.email = 'Correo no válido'
    if (mode === 'register' && emailCheck === 'taken') er.email = 'Este correo ya está en uso'
    if (pass.length < 6) er.pass = 'Mínimo 6 caracteres'
    setErrors(er)
    return Object.keys(er).length === 0
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setServerError('')
    if (!validate()) return
    setLoading(true)
    try {
      if (mode === 'login') {
        await login(email, pass)
      } else {
        await register(name, email, pass)
      }
      navigate('/')
    } catch (err) {
      setServerError(
        err instanceof ApiRequestError
          ? err.message
          : 'No se pudo conectar con el servidor. Asegúrate de que el backend esté corriendo (npm run server).',
      )
    } finally {
      setLoading(false)
    }
  }

  const input = (key: string, type: string, value: string, placeholder: string, icon: React.ReactNode, onChange: (v: string) => void, opts?: { autoComplete?: string }) => (
    <div>
      <div className="relative mt-1">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>
        <input
          id={key}
          type={type}
          value={value}
          onChange={(e) => { onChange(e.target.value); setErrors((x) => ({ ...x, [key]: '' })) }}
          placeholder={placeholder}
          autoComplete={opts?.autoComplete}
          className={cn('h-11 w-full rounded-xl border bg-white pl-9 pr-10 text-sm outline-none transition-colors focus:border-brand-400', errors[key] ? 'border-red-300' : 'border-slate-200')}
        />
      </div>
      {errors[key] && <p className="mt-1 text-xs text-red-500">{errors[key]}</p>}
    </div>
  )

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          {mode === 'login' ? <LogIn className="h-7 w-7" /> : <UserPlus className="h-7 w-7" />}
        </div>
        <h1 className="mt-5 text-center text-2xl font-extrabold text-slate-900">
          {mode === 'login' ? 'Bienvenido de vuelta' : 'Crea tu cuenta'}
        </h1>
        <p className="mt-1 text-center text-sm text-slate-500">
          {mode === 'login' ? 'Ingresa para guardar tus datos y pedidos' : 'Regístrate en menos de un minuto'}
        </p>

        {/* Tabs login / registro */}
        <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={cn('rounded-lg py-2 text-sm font-semibold transition-colors', mode === 'login' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700')}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            onClick={() => switchMode('register')}
            className={cn('rounded-lg py-2 text-sm font-semibold transition-colors', mode === 'register' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700')}
          >
            Crear cuenta
          </button>
        </div>

        <form onSubmit={submit} noValidate className="mt-6 space-y-4">
          {mode === 'register' && (
            <div>
              <label htmlFor="a-name" className="text-sm font-medium text-slate-600">Nombre completo</label>
              {input('name', 'text', name, 'Juan Pérez', <UserIcon className="h-4 w-4" />, setName, { autoComplete: 'name' })}
            </div>
          )}

          <div>
            <label htmlFor="a-email" className="text-sm font-medium text-slate-600">Correo electrónico</label>
            {input('email', 'email', email, 'tu@correo.com', <Mail className="h-4 w-4" />, setEmail, { autoComplete: 'email' })}
            {mode === 'register' && emailCheck === 'checking' && <p className="mt-1 text-xs text-slate-400">Comprobando disponibilidad…</p>}
            {mode === 'register' && emailCheck === 'available' && <p className="mt-1 text-xs text-brand-600">Correo disponible</p>}
            {mode === 'register' && emailCheck === 'taken' && <p className="mt-1 text-xs text-red-500">Este correo ya está en uso</p>}
          </div>

          <div>
            <label htmlFor="a-pass" className="text-sm font-medium text-slate-600">Contraseña</label>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Lock className="h-4 w-4" /></span>
              <input
                id="a-pass"
                type={showPass ? 'text' : 'password'}
                value={pass}
                onChange={(e) => { setPass(e.target.value); setErrors((x) => ({ ...x, pass: '' })) }}
                placeholder="Mínimo 6 caracteres"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className={cn('h-11 w-full rounded-xl border bg-white pl-9 pr-10 text-sm outline-none transition-colors focus:border-brand-400', errors.pass ? 'border-red-300' : 'border-slate-200')}
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.pass && <p className="mt-1 text-xs text-red-500">{errors.pass}</p>}
          </div>

          {mode === 'login' && (
            <button
              type="button"
              onClick={() => { setForgotOpen((v) => !v); setForgotMsg(''); setForgotPath(''); setForgotError('') }}
              className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
            >
              <KeyRound className="h-3.5 w-3.5" /> ¿Olvidaste tu contraseña?
            </button>
          )}

          {serverError && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{serverError}</p>
          )}

          <Button type="submit" size="lg" loading={loading} className="w-full">
            {loading ? 'Procesando...' : mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
          </Button>
        </form>

        {forgotOpen && (
          <form onSubmit={submitForgot} noValidate className="mt-4 space-y-3 rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-slate-800"><KeyRound className="h-4 w-4 text-brand-600" /> Recuperar contraseña</p>
            <p className="text-xs text-slate-500">Ingresa tu correo y te enviaremos un enlace para crear una nueva. Caduca en 1 hora.</p>
            <input
              type="email"
              value={forgotEmail}
              onChange={(e) => { setForgotEmail(e.target.value); setForgotError('') }}
              placeholder="tu@correo.com"
              autoComplete="email"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm outline-none focus:border-brand-400"
            />
            {forgotError && <p className="text-xs text-red-500">{forgotError}</p>}
            <Button type="submit" size="sm" loading={forgotLoading} className="w-full">
              <Mail className="h-4 w-4" /> Enviar enlace de recuperación
            </Button>
            {forgotMsg && <p className="rounded-lg bg-white px-3 py-2 text-xs text-slate-600">{forgotMsg}</p>}
            {forgotPath && (
              <p className="rounded-lg bg-amber-100/70 px-3 py-2 text-xs text-amber-800">
                No se pudo enviar el correo automáticamente (el destinatario no está autorizado sin dominio verificado en Resend). Enlace temporal:{' '}
                <Link to={forgotPath} className="font-bold underline">restablecer contraseña</Link>
              </p>
            )}
          </form>
        )}

        {oauthNotice && (
          <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
            {oauthNotice === 'no_configurado'
              ? 'El inicio de sesión con Google/Apple aún no está activado: faltan las claves del proveedor.'
              : 'No se pudo completar el inicio de sesión con Google/Apple. Inténtalo de nuevo o usa tu correo.'}
          </p>
        )}

        {/* Acceso con Google / Apple */}
        <div className="mt-6">
          <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <span className="h-px flex-1 bg-slate-200" /> o continúa con <span className="h-px flex-1 bg-slate-200" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <a
              href={`${API_BASE_URL}/auth/google`}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              <GoogleIcon /> Google
            </a>
            <a
              href={`${API_BASE_URL}/auth/apple`}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              <AppleIcon /> Apple
            </a>
          </div>
          <p className="mt-2 text-center text-[11px] text-slate-400">Se abrirá la ventana del proveedor y volverás aquí automáticamente.</p>
        </div>

        <p className="mt-4 text-center text-sm text-slate-500">
          {mode === 'login' ? (
            <>¿Sin cuenta?{' '}
              <button type="button" onClick={() => switchMode('register')} className="font-semibold text-brand-700 hover:underline">
                Regístrate gratis
              </button>
            </>
          ) : (
            <>¿Ya tienes cuenta?{' '}
              <button type="button" onClick={() => switchMode('login')} className="font-semibold text-brand-700 hover:underline">
                Inicia sesión
              </button>
            </>
          )}
        </p>

        <p className="mt-6 rounded-xl bg-brand-50 px-4 py-3 text-center text-xs text-brand-700">
          Cuentas reales guardadas en la base de datos de Vertamart (Cloudflare). Las contraseñas se almacenan cifradas (bcrypt).
        </p>
        <p className="mt-2 text-center text-xs text-slate-400">
          <Link to="/productos" className="hover:text-brand-700">← Volver a la tienda</Link>
        </p>
      </div>
    </div>
  )
}
