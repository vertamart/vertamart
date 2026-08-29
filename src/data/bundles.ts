/**
 * Verta Bundles — packs de productos digitales con descuento.
 *
 * Cada bundle referencia productos del catálogo por su `slug`. El precio del
 * bundle es fijo (`bundlePrice`) y el ahorro se calcula automáticamente
 * comparando la suma de los precios individuales con el precio del pack.
 */

export interface Bundle {
  id: string
  slug: string
  name: string
  tagline: string
  description: string
  /** Portada del pack (imagen Pexels única, no repetida con el catálogo). */
  image: string
  /** Slugs de los productos incluidos. */
  productSlugs: string[]
  /** Precio del bundle en CLP (base regional). */
  bundlePrice: number
  /** Destacado en la home de bundles. */
  featured?: boolean
}

const px = (id: number, w = 900) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}`

export const BUNDLES: Bundle[] = [
  {
    id: 'creadores',
    slug: 'pack-para-creadores',
    name: 'Pack para Creadores',
    tagline: 'Todo lo que necesitas para lanzar tu marca digital',
    description:
      'Una selección de recursos esenciales para creadores: portfolio profesional, presets de fotografía, iconos UI, tipografía de marca y mockups para presentar tu trabajo con nivel.',
    image: px(3183150),
    productSlugs: ['plantilla-portfolio-pro', 'presets-lightroom-forest', 'pack-iconos-ui-400', 'fuente-verta-grotesk', 'pack-mockups-branding'],
    bundlePrice: 44990,
    featured: true,
  },
  {
    id: 'gaming',
    slug: 'pack-gaming',
    name: 'Pack Gaming',
    tagline: 'LUTs, sonidos y props para tu setup gamer',
    description:
      'Eleva tus streams y tu setup: presets gaming, LUTs cinematográficos, sonidos de interfaz, props 3D de escritorio y el tema Verta para VS Code.',
    image: px(3184291),
    productSlugs: ['presets-gaming-verde', 'lut-cinematic-verde', 'pack-sonidos-ui', 'modelo-3d-pack-escritorio', 'plugin-vscode-verta-theme'],
    bundlePrice: 29990,
  },
  {
    id: 'diseno',
    slug: 'pack-diseno',
    name: 'Pack Diseño',
    tagline: 'Tipografías, iconos y plugins para diseñadores',
    description:
      'Herramientas de diseño que usas todos los días: display tipográfica, iconos de trazo fino, plugin de AutoLayout para Figma, combo de fuentes e iconos y plantilla de presentación.',
    image: px(3184338),
    productSlugs: ['fuente-verta-display', 'iconos-trazo-fino-vol2', 'plugin-figma-autolayout-kit', 'pack-fuentes-iconos-combo', 'plantilla-presentacion-empresa'],
    bundlePrice: 42990,
  },
  {
    id: 'profesional',
    slug: 'pack-profesional',
    name: 'Pack Profesional',
    tagline: 'Convierte tu negocio en una marca seria',
    description:
      'Para quien vende online: plantilla de tienda, pack social media, curso de branding, kit de marca para Canva y fuente mono para tu documentación.',
    image: px(3184339),
    productSlugs: ['plantilla-tienda-online', 'pack-social-media-500', 'curso-branding-identidad', 'plugin-canva-kit-marca', 'fuente-mono-code'],
    bundlePrice: 75990,
  },
  {
    id: 'mega',
    slug: 'mega-pack',
    name: 'Mega Pack',
    tagline: 'La colección completa de Vertamart',
    description:
      'El pack definitivo: tres cursos completos (UI, Blender e IA), texturas PBR 4K y el modelo 3D de la silla ergonómica. Todo el conocimiento de Vertamart en un solo pack.',
    image: px(3184418),
    productSlugs: ['curso-ui-design-desde-cero', 'curso-blender-principiantes', 'curso-ia-diseno', 'pack-texturas-pbr-4k', 'modelo-3d-silla-ergonomica'],
    bundlePrice: 89990,
    featured: true,
  },
]

/** Busca un bundle por slug. */
export function getBundleBySlug(slug: string): Bundle | undefined {
  return BUNDLES.find((b) => b.slug === slug)
}

/** Suma de precios individuales de los productos del bundle. */
export function bundleRegularTotal(bundle: Bundle, products: { slug: string; price: number }[]): number {
  return bundle.productSlugs.reduce((sum, slug) => {
    const p = products.find((x) => x.slug === slug)
    return sum + (p ? p.price : 0)
  }, 0)
}

/** Precio del bundle (fijo). */
export function bundlePriceOf(bundle: Bundle): number {
  return bundle.bundlePrice
}

/** Cuánto se ahorra comprando el bundle frente a los productos por separado. */
export function bundleSavings(bundle: Bundle, products: { slug: string; price: number }[]): number {
  return Math.max(0, bundleRegularTotal(bundle, products) - bundle.bundlePrice)
}

/** Porcentaje de ahorro del bundle (redondeado al entero). */
export function bundleSavingsPercent(bundle: Bundle, products: { slug: string; price: number }[]): number {
  const regular = bundleRegularTotal(bundle, products)
  if (regular <= 0) return 0
  return Math.round((bundleSavings(bundle, products) / regular) * 100)
}

/** Resuelve los productos del catálogo que pertenecen a un bundle. */
export function bundleProducts<T extends { slug: string }>(bundle: Bundle, products: T[]): T[] {
  return bundle.productSlugs
    .map((slug) => products.find((p) => p.slug === slug))
    .filter((p): p is T => !!p)
}

/* ------------------- Crea tu propio bundle (descuento progresivo) ------------------- */

/**
 * Descuento progresivo según la cantidad de productos seleccionados:
 *   1 → 0% · 2 → 10% · 3 → 15% · 4 → 20% · 5 → 25% · 6-7 → 28-31% · 8+ → 35%
 */
export function customBundleDiscount(count: number): number {
  if (count >= 8) return 35
  if (count === 7) return 31
  if (count === 6) return 28
  if (count === 5) return 25
  if (count === 4) return 20
  if (count === 3) return 15
  if (count === 2) return 10
  return 0
}

/** Precio final de un bundle personalizado: suma de precios con el descuento progresivo aplicado. */
export function customBundlePrice(items: { price: number }[]): number {
  if (items.length === 0) return 0
  const total = items.reduce((s, i) => s + i.price, 0)
  const discount = customBundleDiscount(items.length)
  return Math.round(total * (1 - discount / 100))
}
