import { useEffect, useRef, useState } from 'react'
import { RefreshCw, WifiOff } from 'lucide-react'
import { Button } from './Button'

interface SlowConnectionProps {
  /** Operación en curso (fetch/descarga) que puede ir lenta. */
  active: boolean
  /** Tiempo de espera antes de considerar la conexión lenta (ms). */
  timeoutMs?: number
  /** Se llama automáticamente al llegar el contador a 0. */
  onRetry: () => void
  /** Permite "Continuar más tarde" (cancela la operación). */
  onLater?: () => void
  retryCount?: number
}

/**
 * Aviso de conexión lenta con cuenta atrás y reintento automático.
 * Se muestra cuando `active` lleva más de `timeoutMs` sin completarse.
 */
export function SlowConnection({ active, timeoutMs = 12000, onRetry, onLater, retryCount = 5 }: SlowConnectionProps) {
  const [visible, setVisible] = useState(false)
  const [count, setCount] = useState(retryCount)
  const [attempts, setAttempts] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!active) {
      setVisible(false)
      setCount(retryCount)
      return
    }
    const t = setTimeout(() => setVisible(true), timeoutMs)
    return () => clearTimeout(t)
  }, [active, timeoutMs, retryCount])

  // Cuenta atrás cuando el aviso es visible.
  useEffect(() => {
    if (!visible) return
    if (count <= 0) {
      setAttempts((a) => a + 1)
      setCount(retryCount)
      onRetry()
      return
    }
    timer.current = setTimeout(() => setCount((c) => c - 1), 1000)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [visible, count, retryCount, onRetry])

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" role="alert">
      <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
          <WifiOff className="h-7 w-7 text-amber-600" />
        </div>
        <h3 className="mt-4 text-lg font-bold text-slate-900">Conexión lenta detectada</h3>
        <p className="mt-1 text-sm text-slate-500">Estamos intentando completar la operación. Comprobando conexión…</p>
        {attempts > 0 && <p className="mt-1 text-xs font-semibold text-amber-600">Intento {attempts + 1} de la operación</p>}

        <div className="mt-5 flex items-center justify-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-2xl font-extrabold text-brand-700" aria-live="polite">
            {count}
          </div>
          <span className="text-sm font-medium text-slate-600">Reintentando en {count} segundos</span>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button onClick={() => { setCount(0) }}>
            <RefreshCw className="h-4 w-4" /> Reintentar ahora
          </Button>
          {onLater && (
            <Button variant="outline" onClick={onLater}>
              Continuar más tarde
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
