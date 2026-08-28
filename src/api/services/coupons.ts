import { apiFetch } from '../client'
import type { CouponValidationResponse } from '../types'

/** Endpoints de cupones (contrato documentado en docs/API.md). */
export const couponsService = {
  /** Valida un código de cupón en el servidor. */
  validate(code: string) {
    return apiFetch<CouponValidationResponse>('/coupons/validate', {
      method: 'POST',
      body: { code },
    })
  },
}
