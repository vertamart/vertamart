import { Download, MonitorDown, ShieldCheck, Smartphone } from 'lucide-react'
import { useI18n } from '../context/I18nContext'

const VERSION = 'v1.3.0'
const PUBLIC_APP_DOWNLOAD = import.meta.env.VITE_DESKTOP_DOWNLOAD_URL
const PUBLIC_ANDROID_DOWNLOAD = import.meta.env.VITE_ANDROID_DOWNLOAD_URL

export function Install() {
  const { t } = useI18n()
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-brand-950 p-8 text-white shadow-xl sm:p-12">
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-5xl">{t('install.title')}</h1>
        <p className="mt-4 max-w-2xl text-slate-300">{t('install.subtitle')}</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {/* Windows */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center gap-2"><MonitorDown className="h-5 w-5 text-brand-300" /><span className="text-sm font-bold uppercase tracking-wide text-slate-300">Windows · .exe</span></div>
            <p className="mt-1 text-sm text-slate-400">Windows 10 y 11 · 64 bits · Instalador con opciones.</p>
            {PUBLIC_APP_DOWNLOAD ? (
              <a href={PUBLIC_APP_DOWNLOAD} download className="group mt-4 inline-flex w-full items-center justify-between rounded-xl bg-brand-500 px-5 py-3.5 transition-colors hover:bg-brand-400">
                <span><strong className="block text-lg">Descargar Vertamart</strong><span className="mt-0.5 block text-sm text-brand-100">{VERSION} · ~120 MB</span></span>
                <Download className="h-5 w-5 transition-transform group-hover:translate-y-0.5" />
              </a>
            ) : (
              <p className="mt-4 rounded-xl border border-amber-300/30 bg-amber-400/10 p-4 text-sm text-amber-100">{t('install.soon')}</p>
            )}
          </div>

          {/* Android */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center gap-2"><Smartphone className="h-5 w-5 text-brand-300" /><span className="text-sm font-bold uppercase tracking-wide text-slate-300">Android · .apk</span></div>
            <p className="mt-1 text-sm text-slate-400">Instala el .apk y activa “orígenes desconocidos”.</p>
            {PUBLIC_ANDROID_DOWNLOAD ? (
              <a href={PUBLIC_ANDROID_DOWNLOAD} download className="group mt-4 inline-flex w-full items-center justify-between rounded-xl bg-brand-500 px-5 py-3.5 transition-colors hover:bg-brand-400">
                <span><strong className="block text-lg">Descargar Vertamart APK</strong><span className="mt-0.5 block text-sm text-brand-100">{VERSION} · Android</span></span>
                <Download className="h-5 w-5 transition-transform group-hover:translate-y-0.5" />
              </a>
            ) : (
              <p className="mt-4 rounded-xl border border-amber-300/30 bg-amber-400/10 p-4 text-sm text-amber-100">{t('install.soon')}</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5"><ShieldCheck className="h-6 w-6 text-brand-600" /><h2 className="mt-3 font-bold text-slate-900">{t('install.online')}</h2><p className="mt-1 text-sm text-slate-500">{t('install.onlineSub')}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5"><MonitorDown className="h-6 w-6 text-brand-600" /><h2 className="mt-3 font-bold text-slate-900">Windows</h2><p className="mt-1 text-sm text-slate-500">{t('install.winSub')}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5"><Smartphone className="h-6 w-6 text-brand-600" /><h2 className="mt-3 font-bold text-slate-900">Android</h2><p className="mt-1 text-sm text-slate-500">{t('install.androidSub')}</p></div>
      </div>

      <p className="mt-6 text-center text-xs text-slate-400">{t('install.version')} {VERSION} · {t('install.madrid')}</p>
    </div>
  )
}