export interface Coupon {
  code: string
  percent: number
  min?: number
}

/** Cupones de demo. En producción vendrían de la API. */
export const COUPONS: Coupon[] = [
  { code: 'VERTA10', percent: 10 },
  { code: 'BIENVENIDA15', percent: 15, min: 49990 },
]

export const getCoupon = (code: string) =>
  COUPONS.find((c) => c.code.toUpperCase() === code.trim().toUpperCase()) ?? null