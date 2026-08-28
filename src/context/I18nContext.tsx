import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { detectLang, translate, type Lang } from '../lib/i18n'

const LANG_KEY = 'verta.lang'

interface I18nContextValue {
  lang: Lang
  /** Traduce una clave; acepta variables {n}, {p}, {q}, {total}, etc. */
  t: (key: string, vars?: Record<string, string | number>) => string
  setLang: (lang: Lang) => void
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  // Detección automática según el idioma del dispositivo (navigator.language)
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem(LANG_KEY)
    return saved === 'es' || saved === 'en' ? saved : detectLang()
  })

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback((next: Lang) => {
    localStorage.setItem(LANG_KEY, next)
    setLangState(next)
  }, [])

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  )

  const value = useMemo<I18nContextValue>(() => ({ lang, t, setLang }), [lang, t, setLang])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n debe usarse dentro de I18nProvider')
  return ctx
}
