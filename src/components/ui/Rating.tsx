import { cn } from '../../lib/cn'

export function Rating({
  value,
  count,
  size = 'md',
  showCount = true,
  className,
}: {
  value: number
  count?: number
  size?: 'sm' | 'md' | 'lg'
  showCount?: boolean
  className?: string
}) {
  const sizeClass = size === 'sm' ? 'h-3.5 w-3.5' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'
  return (
    <div className={cn('flex items-center gap-1.5', className)} aria-label={`Calificación ${value} de 5`}>
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => {
          const filled = value >= i - 0.25
          const half = !filled && value >= i - 0.75
          const pct = half ? 50 : filled ? 100 : 0
          return (
            <span key={i} className="relative inline-block" aria-hidden="true">
              <StarOutline className={sizeClass} fill="#e2e8f0" />
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${pct}%` }}>
                <StarOutline className={sizeClass} fill="#fbbf24" />
              </span>
            </span>
          )
        })}
      </div>
      <span className="text-sm font-medium text-slate-700">{value.toFixed(1)}</span>
      {showCount && typeof count === 'number' && <span className="text-sm text-slate-400">({count.toLocaleString('es-CL')})</span>}
    </div>
  )
}

function StarOutline({ className, fill }: { className: string; fill: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill={fill} aria-hidden="true">
      <path d="M12 17.3l-5.2 3.1 1.4-5.6L3.6 10l5.7-.5L12 4.3l2.7 5.2 5.7.5-4.6 4.8 1.4 5.6z" />
    </svg>
  )
}