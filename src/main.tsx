import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import { CatalogProvider } from './context/CatalogContext'
import { AuthProvider } from './context/AuthContext'
import { RegionProvider } from './context/RegionContext'
import { StoreProvider } from './context/StoreContext'
import { I18nProvider } from './context/I18nContext'
import { ThemeProvider } from './context/ThemeContext'
import { VAPID_PUBLIC_KEY } from './lib/push'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <CatalogProvider>
          <AuthProvider>
            <RegionProvider>
              <StoreProvider>
                <ThemeProvider>
                  <App />
                </ThemeProvider>
              </StoreProvider>
            </RegionProvider>
          </AuthProvider>
        </CatalogProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
)

// PWA: registra el service worker (instalación móvil/escritorio) y suscríbete a push.
void (async () => {
  if (!('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
    // Suscripción push opcional (pide permiso solo tras una interacción del usuario).
    if (!(await isRegisteredPush(reg))) {
      await trySubscribePush(reg)
    }
    // Mantener la suscripción sincronizada con el backend.
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      try {
        const { storeService } = await import('./api/services/store')
        const { getToken } = await import('./api/services/auth')
        if (getToken()) {
          const jk = sub.toJSON()
          await storeService.pushSubscribe({
            endpoint: jk.endpoint ?? '',
            keys: { p256dh: jk.keys?.p256dh ?? '', auth: jk.keys?.auth ?? '' },
            category: /iPhone|iPad|Mac|OS X/.test(navigator.userAgent) ? 'apple' : /Android/.test(navigator.userAgent) ? 'android' : 'desktop',
            userAgent: navigator.userAgent,
          })
        }
      } catch { /* sin sesión: se sincroniza al iniciar sesión */ }
    }
  } catch { /* sin soporte SW / privado */ }
})()

async function isRegisteredPush(reg: ServiceWorkerRegistration) {
  const sub = await reg.pushManager.getSubscription()
  return !!sub
}

async function trySubscribePush(reg: ServiceWorkerRegistration) {
  if (Notification.permission === 'denied') return
  const granted = Notification.permission === 'granted'
  // En Chrome la primera llamada debe venir de un gesto del usuario; reservamos.
  if (!granted) return
  try {
    await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: VAPID_PUBLIC_KEY,
    })
  } catch { /* ignorar */ }
}