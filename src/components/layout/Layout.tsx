import { useEffect, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Navbar } from './Navbar'
import { Footer } from './Footer'
import { Toasts } from '../ui/Toasts'
import { WhatsAppButton } from '../ui/WhatsAppButton'
import { CookieBanner } from '../ui/CookieBanner'

export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname])

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <Toasts />
      {/* La clave (key) reinicia la animación de entrada en cada cambio de ruta. */}
      <main key={pathname} className="animate-page-in flex-1">{children}</main>
      <Footer />
      <WhatsAppButton />
      <CookieBanner />
    </div>
  )
}