import { useEffect } from 'react'
import { KeyRound } from 'lucide-react'
import { TOKEN_KEY } from '../api/services/auth'

/**
 * Vuelta de Google/Apple: el Worker redirige aquí con el token de sesión
 * en el fragmento (#token=...), que nunca llega al servidor ni a logs.
 */
export function OAuthCallback() {
  useEffect(() => {
    const match = window.location.hash.match(/token=([a-f0-9]+)/)
    if (match) {
      localStorage.setItem(TOKEN_KEY, match[1])
      // Recarga completa para que AuthContext restaure la sesión desde el token.
      window.location.replace('/')
    } else {
      window.location.replace('/login?oauth=error')
    }
  }, [])

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        <KeyRound className="h-7 w-7 animate-pulse" />
      </div>
      <p className="mt-5 text-sm font-semibold text-slate-700">Completando el acceso con tu cuenta…</p>
      <p className="mt-1 text-sm text-slate-400">Serás redirigido en un momento.</p>
    </div>
  )
}
