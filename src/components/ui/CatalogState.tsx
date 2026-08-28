import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from './Button'
import { useI18n } from '../../context/I18nContext'

/** Estado de error global del catálogo, con botón de reintentar. */
export function CatalogError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useI18n()
  return (
    <div className="mx-auto flex max-w-7xl flex-col items-center px-4 py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
        <AlertTriangle className="h-8 w-8 text-red-500" />
      </div>
      <h1 className="mt-4 text-xl font-extrabold text-slate-900">{t('cat.loadErrorTitle')}</h1>
      <p className="mt-1 text-sm text-slate-500">{message}</p>
      <Button onClick={onRetry} className="mt-6">
        <RefreshCw className="h-4 w-4" /> {t('cat.retry')}
      </Button>
    </div>
  )
}

/** Esqueleto de carga para grillas de productos. */
export function CatalogSkeleton({ cards = 8 }: { cards?: number }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="skeleton-shimmer aspect-square rounded-xl" />
          <div className="skeleton-shimmer mt-3 h-4 w-2/3 rounded" />
          <div className="skeleton-shimmer mt-2 h-4 w-1/3 rounded" />
        </div>
      ))}
    </div>
  )
}
