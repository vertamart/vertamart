import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'

export type ThemeId = 'default' | 'light' | 'dark' | 'blue' | 'purple' | 'rose'
export type AccentId = 'green' | 'blue' | 'purple' | 'rose'

export interface ThemeMeta {
  id: ThemeId
  label: string
  desc: string
  accent: AccentId
  /** Solo disponible para suscriptores premium. */
  premium: boolean
  swatch: string[]
}

export const THEMES: ThemeMeta[] = [
  { id: 'default', label: 'Predeterminado', desc: 'El diseño verde actual', accent: 'green', premium: false, swatch: ['#16a34a', '#f0fdf4'] },
  { id: 'light', label: 'Claro', desc: 'Blanco puro, más limpio y luminoso', accent: 'green', premium: false, swatch: ['#ffffff', '#f1f5f9'] },
  { id: 'dark', label: 'Oscuro', desc: 'Gris oscuro, ideal de noche', accent: 'green', premium: false, swatch: ['#0f172a', '#f8fafc'] },
  { id: 'blue', label: 'Azul Pro', desc: 'Acento azul eléctrico', accent: 'blue', premium: true, swatch: ['#2563eb', '#eff6ff'] },
  { id: 'purple', label: 'Violeta Pro', desc: 'Acento púrpura premium', accent: 'purple', premium: true, swatch: ['#7c3aed', '#f5f3ff'] },
  { id: 'rose', label: 'Coral Pro', desc: 'Acento coral vibrante', accent: 'rose', premium: true, swatch: ['#f43f5e', '#fff1f2'] },
]

// Los temas premium requieren suscripción; el resto es gratis.
export const FREE_THEMES = THEMES.filter((t) => !t.premium).map((t) => t.id)

interface ThemeContextValue {
  theme: ThemeId
  meta: ThemeMeta
  isDark: boolean
  setTheme: (t: ThemeId) => void
  canUse: (t: ThemeId) => boolean
  isPremium: boolean
}

const STORAGE_KEY = 'verta.theme'
const DEFAULT_THEME: ThemeId = 'default'

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  // La suscripción premium la aporta el usuario autenticado.
  const { user } = useAuth()
  const isPremium = !!user?.isPremium
  // La preferencia se lee una vez al montar para evitar parpadeos.
  const [theme, setThemeState] = useState<ThemeId>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ThemeId | null
      if (saved && THEMES.some((t) => t.id === saved)) return saved
    } catch { /* sin almacenamiento */ }
    return DEFAULT_THEME
  })

  // Si el tema guardado es premium pero el usuario ya no tiene suscripción, vuelve al predeterminado.
  useEffect(() => {
    if (!isPremium) {
      const meta = THEMES.find((t) => t.id === theme)
      if (meta?.premium) setThemeState('default')
    }
  }, [isPremium, theme])

  // Aplica data-theme (superficie) y data-accent (color de marca) al <html>.
  useEffect(() => {
    const meta = THEMES.find((t) => t.id === theme) ?? THEMES[0]
    const root = document.documentElement
    root.setAttribute('data-theme', theme === 'dark' ? 'dark' : theme === 'light' ? 'light' : 'default')
    root.setAttribute('data-accent', meta.accent)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch { /* sin almacenamiento */ }
  }, [theme])

  const setTheme = useCallback((t: ThemeId) => {
    const meta = THEMES.find((x) => x.id === t)
    if (!meta) return
    // Bloquea los temas premium si no hay suscripción.
    if (meta.premium && !isPremium) {
      setThemeState('default')
      return
    }
    setThemeState(t)
  }, [isPremium])

  const canUse = useCallback((t: ThemeId) => {
    const meta = THEMES.find((x) => x.id === t)
    if (!meta) return false
    return !meta.premium || isPremium
  }, [isPremium])

  const meta = useMemo(() => THEMES.find((t) => t.id === theme) ?? THEMES[0], [theme])

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, meta, isDark: theme === 'dark', setTheme, canUse, isPremium }),
    [theme, meta, setTheme, canUse, isPremium],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme debe usarse dentro de ThemeProvider')
  return ctx
}