import { apiFetch } from '../client'

export interface AuthUser {
  id: number
  name: string
  email: string
  role: 'customer' | 'admin' | 'support' | string
  country: string
  isPremium?: boolean
  createdAt?: string
  verified?: boolean
}

export interface VerificationChecks {
  email: boolean
  profile: boolean
  activity: boolean
}

export interface AuthResponse {
  token: string
  user: AuthUser
}

export const TOKEN_KEY = 'verta.token'

export const getToken = () => localStorage.getItem(TOKEN_KEY) ?? ''

/** Endpoints de autenticación (backend local en server/, ver docs/API.md). */
export const authService = {
  register(name: string, email: string, password: string) {
    return apiFetch<AuthResponse>('/auth/register', { method: 'POST', body: { name, email, password } })
  },

  login(email: string, password: string) {
    return apiFetch<AuthResponse>('/auth/login', { method: 'POST', body: { email, password } })
  },

  supportLogin(password: string) {
    return apiFetch<AuthResponse>('/auth/support/login', { method: 'POST', body: { password } })
  },

  checkEmail(email: string) {
    return apiFetch<{ valid: boolean; available: boolean }>('/auth/email-availability', { query: { email } })
  },

  /** Solicita el enlace de restablecimiento. Sin proveedor de correo devuelve resetUrl (modo demo). */
  forgotPassword(email: string) {
    return apiFetch<{ message: string; emailSent: boolean; resetUrl?: string; demo?: boolean }>('/auth/forgot-password', {
      method: 'POST',
      body: { email },
    })
  },

  verifyResetToken(token: string) {
    return apiFetch<{ valid: boolean }>('/auth/reset-password/verify', { query: { token } })
  },

  resetPassword(token: string, password: string) {
    return apiFetch<{ message: string }>('/auth/reset-password', { method: 'POST', body: { token, password } })
  },

  me() {
    return apiFetch<{ user: AuthUser; verification?: VerificationChecks }>('/auth/me', { headers: { Authorization: `Bearer ${getToken()}` } })
  },

  verification() {
    return apiFetch<{ verified: boolean; checks: VerificationChecks }>('/auth/verification', { headers: { Authorization: `Bearer ${getToken()}` } })
  },

  updateProfile(patch: { name?: string; country?: string }) {
    return apiFetch<{ user: AuthUser }>('/auth/me', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: patch,
    })
  },

  logout() {
    return apiFetch<void>('/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` } })
  },

  subscribe() {
    return apiFetch<{ user: AuthUser }>('/auth/subscribe', { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` } })
  },
  unsubscribe() {
    return apiFetch<{ user: AuthUser }>('/auth/unsubscribe', { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` } })
  },
  getSubscription() {
    return apiFetch<{
      isPremium: boolean
      plan: string
      price: number
      currency: string
      interval: string
      payoutConfigured: boolean
      payout?: { provider: string; label: string; maskedRef: string } | null
      pending?: { id: number; amount: number; currency: string; method: string; status: string; createdAt: string } | null
    }>('/auth/subscription', { headers: { Authorization: `Bearer ${getToken()}` } })
  },
  paySubscription(input: { method: string; card?: { number: string; expiry: string; cvv: string; holder: string } }) {
    return apiFetch<{
      status: string
      transactionId: string
      reference: string
      isPremium: boolean
      creditedTo?: { provider: string; label: string }
      message: string
    }>('/subscription/pay', { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: input })
  },
}
