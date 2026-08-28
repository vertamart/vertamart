/**
 * Sistema de pagos.
 *
 * La app paga a través de la interfaz `PaymentProvider`. Por defecto usa
 * `MockPaymentProvider` (demo): simula la aprobación sin procesar datos
 * reales de tarjeta. En producción se selecciona un proveedor real con
 * `VITE_PAYMENT_PROVIDER` (stripe | webpay) y se implementa su integración
 * (normalmente con un backend que guarde el secreto).
 */

export type PaymentMethod = 'card' | 'webpay' | 'transfer'

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
}

export type PaymentStatus = 'approved' | 'pending' | 'declined' | 'error'

export interface PaymentResult {
  status: PaymentStatus
  transactionId?: string
  message?: string
}

export interface PaymentProvider {
  processPayment(request: PaymentRequest): Promise<PaymentResult>
}

/** Proveedor simulado (demo): aprueba el pago tras una breve demora. No guarda nada. */
class MockPaymentProvider implements PaymentProvider {
  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    await new Promise((resolve) => setTimeout(resolve, 1600))
    const transactionId = `VT${Date.now().toString(36).toUpperCase()}`
    if (request.method === 'transfer') {
      return { status: 'pending', transactionId, message: 'Transferencia en revisión (demo)' }
    }
    return { status: 'approved', transactionId, message: 'Pago aprobado (demo)' }
  }
}

/** Placeholder para integrar Stripe (PaymentIntent vía backend). */
class StripePaymentProvider implements PaymentProvider {
  async processPayment(_request: PaymentRequest): Promise<PaymentResult> {
    throw new Error('Stripe no está configurado: implementa la integración en src/api/payments.ts')
  }
}

/** Placeholder para integrar Transbank Webpay (requiere credenciales de comercio). */
class WebpayPaymentProvider implements PaymentProvider {
  async processPayment(_request: PaymentRequest): Promise<PaymentResult> {
    throw new Error('Webpay no está configurado: implementa la integración en src/api/payments.ts')
  }
}

function resolvePaymentProvider(): PaymentProvider {
  switch (import.meta.env.VITE_PAYMENT_PROVIDER) {
    case 'stripe':
      return new StripePaymentProvider()
    case 'webpay':
      return new WebpayPaymentProvider()
    default:
      return new MockPaymentProvider()
  }
}

/** Proveedor de pagos activo, derivado del entorno. */
export const paymentsProvider: PaymentProvider = resolvePaymentProvider()
