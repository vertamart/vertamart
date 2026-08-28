import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiRequestError } from '../api/client'
import { authService, TOKEN_KEY, type AuthUser } from '../api/services/auth'

export type AuthStatus = 'loading' | 'authenticated' | 'guest'

interface AuthContextValue {
  user: AuthUser | null
  status: AuthStatus
  login: (email: string, password: string) => Promise<void>
  supportLogin: (password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  updateProfile: (patch: { name?: string; country?: string }) => Promise<void>
  /** Recarga el perfil del usuario desde el servidor (p. ej. tras activar la suscripción). */
  refreshProfile: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')

  // Restaurar sesión al cargar la app si existe un token guardado
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) {
      setStatus('guest')
      return
    }
    let cancelled = false
    authService
      .me()
      .then(({ user }) => {
        if (cancelled) return
        setUser(user)
        setStatus('authenticated')
      })
      .catch((e) => {
        if (cancelled) return
        if (e instanceof ApiRequestError && e.status === 401) {
          localStorage.removeItem(TOKEN_KEY)
        }
        setUser(null)
        setStatus('guest')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const res = await authService.login(email, password)
    localStorage.setItem(TOKEN_KEY, res.token)
    setUser(res.user)
    setStatus('authenticated')
  }, [])

  const supportLogin = useCallback(async (password: string) => {
    const res = await authService.supportLogin(password)
    localStorage.setItem(TOKEN_KEY, res.token)
    setUser(res.user)
    setStatus('authenticated')
  }, [])

  const register = useCallback(async (name: string, email: string, password: string) => {
    const res = await authService.register(name, email, password)
    localStorage.setItem(TOKEN_KEY, res.token)
    setUser(res.user)
    setStatus('authenticated')
  }, [])

  const updateProfile = useCallback(async (patch: { name?: string; country?: string }) => {
    const res = await authService.updateProfile(patch)
    setUser(res.user)
  }, [])

  const refreshProfile = useCallback(async () => {
    const { user: fresh } = await authService.me()
    setUser(fresh)
    return undefined
  }, [])

  const logout = useCallback(async () => {
    try {
      await authService.logout()
    } catch {
      // La sesión local se limpia igualmente aunque el servidor no responda
    }
    localStorage.removeItem(TOKEN_KEY)
    setUser(null)
    setStatus('guest')
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, supportLogin, register, updateProfile, refreshProfile, logout }),
    [user, status, login, supportLogin, register, updateProfile, refreshProfile, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
