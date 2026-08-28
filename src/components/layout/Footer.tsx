import { Link } from 'react-router-dom'
import { Mail, Phone, MapPin } from 'lucide-react'
import { useI18n } from '../../context/I18nContext'

const SOCIALS = [
  { name: 'Facebook', path: 'M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z' },
  { name: 'Instagram', path: 'M16 3H8a5 5 0 0 0-5 5v8a5 5 0 0 0 5 5h8a5 5 0 0 0 5-5V8a5 5 0 0 0-5-5zm-4 12.5A3.5 3.5 0 1 1 15.5 12 3.5 3.5 0 0 1 12 15.5zM17.5 6.5a1 1 0 1 1-1-1 1 1 0 0 1 1 1z' },
  { name: 'X', path: 'M4 4l7.2 9.3L4.4 20h2.5l5.4-5.4L16.8 20H20l-7.5-9.7L18.9 4h-2.5l-4.7 4.7L8.2 4H4z' },
  { name: 'YouTube', path: 'M22.5 7.2a2.8 2.8 0 0 0-2-2C18.9 4.8 12 4.8 12 4.8s-6.9 0-8.5.4a2.8 2.8 0 0 0-2 2A29 29 0 0 0 1.1 12a29 29 0 0 0 .4 4.8 2.8 2.8 0 0 0 2 2c1.6.4 8.5.4 8.5.4s6.9 0 8.5-.4a2.8 2.8 0 0 0 2-2 29 29 0 0 0 .4-4.8 29 29 0 0 0-.4-4.8zM9.8 15.1V8.9L15.4 12z' },
]

export function Footer() {
  const { t } = useI18n()
  const year = new Date().getFullYear()
  return (
    <footer className="border-t border-slate-800 bg-brand-950 text-slate-300">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          {/* Marca */}
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-white">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3c2 0 3.5 1 4.5 3l4 10-3-1-1.5-4H8l-1.5 4-3 1 4-10C8.5 4 10 3 12 3z" />
                </svg>
              </span>
              <span className="text-xl font-extrabold text-white">Vertamart</span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-slate-400">
              {t('footer.tagline')}
            </p>
            <div className="mt-5 flex gap-2">
              {SOCIALS.map((s) => (
                <a key={s.name} href="#" aria-label={s.name} className="rounded-lg bg-white/5 p-2 text-slate-300 transition-colors hover:bg-brand-500 hover:text-white">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true"><path d={s.path} /></svg>
                </a>
              ))}
            </div>
          </div>

          {/* Tienda */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">{t('footer.store')}</h3>
            <ul className="mt-4 space-y-2 text-sm">
              <li><Link to="/productos" className="hover:text-brand-300">{t('footer.allProducts')}</Link></li>
              <li><Link to="/categorias" className="hover:text-brand-300">{t('footer.categories')}</Link></li>
              <li><Link to="/ofertas" className="hover:text-brand-300">{t('footer.offers')}</Link></li>
              <li><Link to="/favoritos" className="hover:text-brand-300">{t('footer.favorites')}</Link></li>
            </ul>
          </div>

          {/* Ayuda */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">{t('footer.help')}</h3>
            <ul className="mt-4 space-y-2 text-sm">
              <li><Link to="/nosotros" className="hover:text-brand-300">{t('footer.about')}</Link></li>
              <li><Link to="/contacto" className="hover:text-brand-300">{t('footer.contact')}</Link></li>
              <li><a href="#" className="hover:text-brand-300">{t('footer.shipping')}</a></li>
              <li><a href="#" className="hover:text-brand-300">{t('footer.faq')}</a></li>
            </ul>
          </div>

          {/* Contacto */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">{t('footer.contactTitle')}</h3>
            <ul className="mt-4 space-y-3 text-sm">
              <li className="flex gap-2"><Mail className="h-4 w-4 shrink-0 text-brand-400" /> hola@vertamart.es</li>
              <li className="flex gap-2"><Phone className="h-4 w-4 shrink-0 text-brand-400" /> +34 910 234 567</li>
              <li className="flex gap-2"><MapPin className="h-4 w-4 shrink-0 text-brand-400" /> Madrid, España</li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-slate-500 sm:flex-row">
          <p>© {year} Vertamart. {t('footer.legal')}</p>
          <div className="flex gap-4">
            <Link to="/terminos" className="hover:text-slate-300">{t('footer.terms')}</Link>
            <Link to="/privacidad" className="hover:text-slate-300">{t('footer.privacy')}</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
