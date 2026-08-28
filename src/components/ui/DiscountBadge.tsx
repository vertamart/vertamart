import { discountPercent } from '../../lib/format'
import { cn } from '../../lib/cn'

export function DiscountBadge({ price, oldPrice, className }: { price: number; oldPrice?: number; className?: string }) {
  const pct = discountPercent(price, oldPrice)
  if (pct === null) return null
  return (
    <span className={cn('inline-flex items-center rounded-full bg-brand-600 px-2 py-0.5 text-xs font-bold text-white shadow-sm', className)}>
      -{pct}%
    </span>
  )
}