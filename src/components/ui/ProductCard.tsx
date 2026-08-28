import { Link } from 'react-router-dom'
import { Heart, ShoppingCart, Truck, User, Copy } from 'lucide-react'
import { useState } from 'react'
import { useI18n } from '../../context/I18nContext'
import type { Product } from '../../data/products'
import { useStore } from '../../context/StoreContext'
import { ProductImage } from './ProductImage'
import { Price } from './Price'
import { Rating } from './Rating'
import { DiscountBadge } from './DiscountBadge'
import { Button } from './Button'
import { cn } from '../../lib/cn'

export function ProductCard({ product, className }: { product: Product; className?: string }) {
  const { toggleFavorite, isFavorite, addToCart } = useStore()
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const fav = isFavorite(product.id)
  const badgeLabel =
    product.badge === 'nuevo' ? t('product.new') : product.badge === 'top' ? t('product.badgeTop') : product.badge === 'popular' ? t('product.badgePopular') : null
  const copyCode = async () => {
    if (!product.productCode) return
    try {
      await navigator.clipboard.writeText(product.productCode)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* portapapeles no disponible */
    }
  }

  return (
    <article className={cn('group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/70', className)}>
      <Link to={`/producto/${product.slug}`} className="relative block aspect-square overflow-hidden bg-slate-50" aria-label={product.name}>
        <ProductImage src={product.image} fallback={product.category} name={product.name} className="transition-transform duration-500 group-hover:scale-105" />
        <div className="absolute left-3 top-3 flex flex-col gap-2">
          {badgeLabel && <span className="rounded-full bg-brand-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm">{badgeLabel}</span>}
          <DiscountBadge price={product.price} oldPrice={product.oldPrice} />
        </div>
      </Link>

      <button
        onClick={() => toggleFavorite(product.id)}
        aria-label={fav ? 'Quitar de favoritos' : 'Añadir a favoritos'}
        className={cn('absolute right-3 top-3 rounded-full p-2 transition-all duration-200', fav ? 'bg-red-50 text-red-500' : 'bg-white/90 text-slate-400 shadow-sm hover:text-red-500')}
      >
        <Heart className={cn('h-5 w-5', fav && 'fill-current')} />
      </button>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{product.brand}</span>
        <Link to={`/producto/${product.slug}`} className="line-clamp-2 font-semibold text-slate-800 transition-colors hover:text-brand-700">
          {product.name}
        </Link>
        {product.owner && (
          <Link
            to={`/vendedor/${product.owner.id}`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 transition-colors hover:text-brand-800 hover:underline"
          >
            <User className="h-3.5 w-3.5" /> {product.owner.name}
            {product.owner.verified && (
              <span title="Vendedor verificado" aria-label="Vendedor verificado" className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[9px] font-black leading-none text-white">✓</span>
            )}
          </Link>
        )}
        {product.productCode && (
          <button
            onClick={copyCode}
            title="Copiar código de producto"
            className="inline-flex w-fit items-center gap-1 rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700 transition-colors hover:bg-brand-100"
          >
            <Copy className="h-3 w-3" /> {product.productCode}
            {copied && <span className="text-brand-600">· copiado</span>}
          </button>
        )}
        {typeof product.reviews === 'number' && product.reviews > 0 && <Rating value={product.rating} count={product.reviews} size="sm" />}
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <Price price={product.price} oldPrice={product.oldPrice} />
          {product.stock > 0 ? (
            <Button size="sm" onClick={() => addToCart(product.id)} className="shrink-0" aria-label={`Añadir ${product.name} al carrito`}>
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline">Añadir</span>
            </Button>
          ) : (
            <span className="shrink-0 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-400">Agotado</span>
          )}
        </div>
        {product.stock > 0 && product.stock <= 5 && (
          <span className="mt-1 flex items-center gap-1 text-xs font-medium text-orange-600">
            <Truck className="h-3.5 w-3.5" /> Solo {product.stock} en stock
          </span>
        )}
      </div>
    </article>
  )
}