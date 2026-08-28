import { formatPrice } from '../../lib/currency'
import { useRegion } from '../../context/RegionContext'
import { cn } from '../../lib/cn'

export function Price({
  price,
  oldPrice,
  size = 'md',
  className,
}: {
  price: number
  oldPrice?: number
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const { region } = useRegion()
  const sizeClass = size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-2xl' : 'text-lg'
  return (
    <div className={cn('flex flex-wrap items-baseline gap-2', className)}>
      <span className={cn('font-bold text-slate-900', sizeClass)}>{formatPrice(price, region)}</span>
      {oldPrice && oldPrice > price && (
        <span className={cn(size === 'sm' ? 'text-xs' : 'text-sm', 'text-slate-400 line-through')}>
          {formatPrice(oldPrice, region)}
        </span>
      )}
    </div>
  )
}
