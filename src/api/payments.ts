/**
 * Sistema de pagos.
 *
 * La app paga a través de la interfaz `PaymentProvider`.
 *
 * - `StripePaymentProvider`: pago REAL. Crea una sesión de Checkout alojada
 *   por Stripe en el backend (que calcula el precio desde la BD y verifica
 *   el pago por webhook). La tarjeta nunca pasa por nuestro servidor ni por
 *   el navegador → PCI-DSS gestionado por Stripe.
 * - `MockPaymentProvider`: pago SIMULADO. Solo disponible para usuarios con
 *   rol administrador y solo si el panel tiene activado "Compra simulada".
 */

export type PaymentMethod = 'stripe' | 'card' | 'webpay' | 'transfer'

export interface CardDetails {
  number: string
  expiry: string // MM/AA
  cvv: string
  holder: string
}

export interface PaymentRequest {
  orderId: string
  amount: number
  method: PaymentMethod
  installments?: number
  card?: CardDetails
  customer: { name: string; email: string }
  /** Items reales del carrito (el backend recalcula el precio). */
  items: { productId: string; name: string; price: number; qty: number }[]
  /** Código promocional aplicado (el backend lo valida de nuevo). */
  promoCode?: string
  /** Puntos a canjear (el backend lo valida). */
  redeemPoints?: number
}

export type PaymentStatus = 'approved' | 'pending' | 'declined' | 'error' | 'redirect'

export interface PaymentResult {
  status: PaymentStatus
  transactionId?: string
  message?: string
  /** URL del checkout alojado (Stripe) cuando status === 'redirect'. */
  redirectUrl?: string
  orderId?: number
}

export interface PaymentProvider {
  processPayment(request: PaymentRequest): Promise<PaymentResult>
}

/** Pago real vía Stripe Checkout (backend calcula precios y webhook confirma). */
class StripePaymentProvider implements PaymentProvider {
  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    const { storeService } = await import('./services/store')
    const res = await storeService.createStripeCheckout({
      items: request.items,
      promoCode: request.promoCode,
    })
    if (!res.url) return { status: 'error', message: 'Stripe no devolvió una URL de pago' }
    return { status: 'redirect', redirectUrl: res.url, orderId: res.orderId }
  }
}

/** Pago simulado (demo): solo administradores con "Compra simulada" activada. */
class MockPaymentProvider implements PaymentProvider {
  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    await new Promise((resolve) => setTimeout(resolve, 1200))
    const transactionId = `VT${Date.now().toString(36).toUpperCase()}`
    if (request.method === 'transfer') {
      return { status: 'pending', transactionId, message: 'Transferencia en revisión (demo)' }
    }
    return { status: 'approved', transactionId, message: 'Pago aprobado (demo)' }
  }
}

const stripeProvider = new StripePaymentProvider()
const mockProvider = new MockPaymentProvider()

/**
 * Proveedor activo: el método 'stripe' usa el pago REAL; los métodos
 * 'card' / 'webpay' / 'transfer' solo existen en modo demo (admin).
 */
export const paymentsProvider: PaymentProvider = {
  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    if (request.method === 'stripe') {
      return stripeProvider.processPayment(request)
    }
    return mockProvider.processPayment(request)
  },
}
