import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Cookie } from 'lucide-react'
import { useI18n } from '../../context/I18nContext'
import { Button } from './Button'

const CONSENT_KEY = 'verta.cookieConsent'

function readConsent(): 'accepted' | 'rejected' | 'pending' {
  try {
    const v = localStorage.getItem(CONSENT_KEY)
    if (v === 'accepted' || v === 'rejected') return v
  } catch { /* sin almacenamiento */ }
  return 'pending'
}

/**
 * Aviso de cookies estilo "uso como las demás webs": pregunta al visitante al
 * entrar y guarda la elección. También marca que la sesión usa cookies.
 */
export function CookieBanner() {
  const { t } = useI18n()
  const [choice, setChoice] = useState<typeof readConsent extends () => infer R ? R : never>(() => readConsent())

  useEffect(() => {
    // Avisa que la app ya utiliza almacenamiento (localStorage / cookies) para
    // carrito, favoritos, idioma, tema y sesión.
    if (choice !== 'pending' && !document.cookie.includes('verta_consent=')) {
      try {
        document.cookie = `verta_consent=${choice};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`
      } catch { /* navegador bloqueó cookies */ }
    }
  }, [choice])

  if (choice !== 'pending') return null

  const decide = (v: 'accepted' | 'rejected') => {
    try { localStorage.setItem(CONSENT_KEY, v) } catch { /* sin almacenamiento */ }
    try { document.cookie = `verta_consent=${v};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax` } catch { /* */ }
    setChoice(v)
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 sm:p-5" role="dialog" aria-label={t('cookie.title')}>
      <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl ring-1 ring-black/5 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex shrink-0 items-center justify-center rounded-xl bg-brand-50 p-2 text-brand-600">
          <Cookie className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-bold text-slate-900">{t('cookie.title')}</p>
          <p className="mt-0.5 text-slate-600">{t('cookie.body')}</p>
          <p className="mt-1 text-xs text-slate-400">
            {t('cookie.seeMore')}{' '}
            <Link to="/privacidad" className="font-semibold text-brand-700 hover:underline">{t('cookie.privacy')}</Link>
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <Button onClick={() => decide('accepted')} className="whitespace-nowrap">{t('cookie.accept')}</Button>
          <Button variant="outline" onClick={() => decide('rejected')} className="whitespace-nowrap">{t('cookie.reject')}</Button>
        </div>
      </div>
    </div>
  )
}