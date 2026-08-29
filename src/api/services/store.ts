import { apiFetch, API_BASE_URL, ApiRequestError } from '../client'
import type { Product } from '../../data/products'
import { getToken } from './auth'

export interface SellerInfo {
  id: number
  name: string
  role?: string
  verified?: boolean
}

/** Producto guardado en la BD (incluye campos extra del backend). */
export interface StoredProduct extends Product {
  productCode?: string | null
  status?: 'active' | 'hidden'
  ownerId?: number | null
  ownerName?: string | null
  owner?: SellerInfo & { verified?: boolean } | null
}

export interface UserProfile {
  id: number
  name: string
  email: string
  role: string
  country: string
  createdAt: string
  productsCount: number
  followersCount: number
  followingCount: number
  isFollowing: boolean
  isSelf: boolean
  verified?: boolean
  verification?: { email: boolean; profile: boolean; activity: boolean }
}

export interface Conversation {
  userId: number
  name: string
  role?: string
  country: string
  verified?: boolean
  lastMessage: string | null
  lastAt: string | null
  unreadCount: number
}

export interface ChatMessage {
  id: number
  senderId: number
  receiverId: number
  content: string
  imageUrl?: string | null
  editedAt?: string | null
  deletedAt?: string | null
  isRead: number
  createdAt: string
}

export interface FeedPost {
  id: number
  userId: number
  userName: string
  userVerified?: boolean
  productId: string | null
  productCode: string | null
  productName: string | null
  title: string
  description: string
  videoUrl: string
  likesCount: number
  liked: boolean
  commentsCount: number
  createdAt: string
}

export interface FeedComment {
  id: string
  postId: number
  userId: number
  userName: string
  userVerified?: boolean
  content: string
  createdAt: string
}

export interface ModerationPost {
  id: number
  userId: number
  userName: string
  userVerified?: boolean
  title: string
  description: string
  videoUrl: string
  createdAt: string
  commentsCount: number
}

export interface ModerationMessage {
  id: number
  senderId: number
  senderName: string
  receiverId: number
  receiverName: string
  content: string
  imageUrl?: string | null
  createdAt: string
}

export interface PromoCode {
  id: number
  code: string
  type: 'percent' | 'fixed'
  percent: number
  value: number
  minAmount: number
  startsAt: string | null
  expiresAt: string | null
  maxUses: number | null
  usedCount: number
  active: number
  createdAt: string
}

export interface AdminCategory {
  id: number
  key: string
  name: string
  tagline: string | null
  active: number
  sortOrder: number
  productCount: number
  createdAt: string
}

export interface ProductReview {
  id: number
  productId: string
  userId: number
  userName: string
  userVerified?: boolean
  verifiedPurchase?: boolean
  rating: number
  content: string
  imageUrl?: string | null
  createdAt: string
}

export interface ProductInput {
  name: string
  description: string
  category: string
  price: number
  oldPrice?: number
  stock: number
  image: string
  features: string[]
  badge?: string
  warranty?: string
  shipDays?: number
  fileType?: string
  fileSize?: string
  compatibility?: string
  license?: string
}

export interface OrderInput {
  items: { productId: string; name: string; price: number; qty: number }[]
  subtotal: number
  discount: number
  shipping: number
  total: number
  method: string
  transactionId?: string
  installments?: number
  paymentStatus: string
  customerName: string
  customerEmail: string
  customerPhone?: string
  address?: string
  city?: string
  region?: string
  postalCode?: string
  estimatedDelivery?: string
  redeemPoints?: number
  promoCode?: string
}

export interface Order {
  id: number
  customerName: string
  customerEmail: string
  customerPhone?: string
  address?: string
  city?: string
  region?: string
  postalCode?: string
  subtotal: number
  discount: number
  shipping: number
  total: number
  status: string
  itemsCount: number
  paymentMethod?: string | null
  paymentStatus?: string | null
  estimatedDelivery?: string | null
  trackingNumber?: string | null
  refundStatus?: 'none' | 'partial' | 'full'
  refundAmount?: number
  refundReason?: string | null
  pointsEarned?: number
  createdAt: string
}

/** Producto digital comprado por el usuario (biblioteca / Mis descargas). */
export interface LibraryItem {
  id: string
  name: string
  slug: string
  brand: string
  category: string
  price: number
  image: string
  fileType: string
  fileSize: string
  compatibility: string
  license: string
  downloads: number
  includes: string[]
  requirements: string[]
  updates: string
  support: string
  orderId: number
  purchasedAt: string
}

export interface PayoutTransaction {
  id: number
  userId?: number | null
  userName: string
  type: string
  amount: number
  currency: string
  method: string
  reference?: string | null
  status: string
  createdAt: string
}

export interface PayoutAccount {
  id?: number
  provider: 'paypal' | 'bank' | 'stripe'
  label: string
  accountRef: string
  paypalEmail?: string | null
  isActive?: number
  createdAt?: string
  balance?: number
  transactions?: PayoutTransaction[]
}

export interface Payment {
  id: number
  orderId: number
  amount: number
  method: string
  transactionId?: string
  installments?: number
  status: string
  createdAt: string
}

export interface AdminUser {
  id: number
  name: string
  email: string
  role: string
  country: string
  isSuspended?: boolean
  createdAt: string
}

const authHeaders = () => ({ Authorization: `Bearer ${getToken()}` })

/** Servicios de la tienda: publicaciones de usuarios, pedidos y panel admin. */
export const storeService = {
  /* ------------------- Productos (catálogo + usuarios) ------------------- */
  listProducts() {
    return apiFetch<{ items: StoredProduct[]; total: number }>('/products')
  },
  myProducts() {
    return apiFetch<{ items: StoredProduct[]; total: number }>('/products/mine', { headers: authHeaders() })
  },
  createProduct(input: ProductInput) {
    return apiFetch<StoredProduct>('/products', { method: 'POST', headers: authHeaders(), body: input })
  },
  updateProduct(id: string, patch: Partial<ProductInput> & { status?: string; downloads?: number; updates?: string; support?: string; includes?: string[]; requirements?: string[] }) {
    return apiFetch<StoredProduct>(`/products/${id}`, { method: 'PATCH', headers: authHeaders(), body: patch })
  },
  deleteProduct(id: string) {
    return apiFetch<void>(`/products/${id}`, { method: 'DELETE', headers: authHeaders() })
  },

  /* ------------------------------- Pedidos ------------------------------- */
  paypalCreateOrder(total: number) {
    return apiFetch<{ id: string; status: string; links: { href: string; rel: string }[] }>('/payments/paypal/orders', {
      method: 'POST',
      body: { total },
    })
  },
  paypalCaptureOrder(id: string) {
    return apiFetch<{ id: string; status: string }>(`/payments/paypal/orders/${encodeURIComponent(id)}/capture`, {
      method: 'POST',
    })
  },
  createOrder(input: OrderInput) {
    return apiFetch<{ id: number; trackingUrl?: string; emailSent?: boolean }>('/orders', {
      method: 'POST',
      headers: authHeaders(),
      body: input,
    })
  },

  /* ------------------- Biblioteca digital (Mis descargas) ------------------- */
  myLibrary() {
    return apiFetch<{ items: LibraryItem[] }>('/me/library', { headers: authHeaders() })
  },
  /** Descarga un producto comprado (requiere sesión): devuelve el blob del archivo. */
  async downloadProduct(id: string) {
    const res = await fetch(`${API_BASE_URL}/me/library/${encodeURIComponent(id)}/download`, {
      headers: authHeaders(),
    })
    if (!res.ok) throw new ApiRequestError({ status: res.status, message: 'No tienes acceso a este archivo' })
    return res.blob()
  },

  /* -------------------- Perfiles, seguir y chat -------------------- */
  getUserProfile(id: number) {
    return apiFetch<UserProfile>(`/users/${id}`, { headers: authHeaders() })
  },
  getUserProducts(id: number) {
    return apiFetch<{ items: StoredProduct[]; total: number }>(`/users/${id}/products`)
  },
  followUser(id: number) {
    return apiFetch<UserProfile>(`/users/${id}/follow`, { method: 'POST', headers: authHeaders() })
  },
  unfollowUser(id: number) {
    return apiFetch<UserProfile>(`/users/${id}/follow`, { method: 'DELETE', headers: authHeaders() })
  },
  getFollowing() {
    return apiFetch<{ items: { id: number; name: string; country: string; followedAt: string }[] }>('/me/following', {
      headers: authHeaders(),
    })
  },
  getConversations() {
    return apiFetch<{ items: Conversation[] }>('/conversations', { headers: authHeaders() })
  },
  getMessages(userId: number) {
    return apiFetch<{ items: ChatMessage[] }>(`/conversations/${userId}/messages`, { headers: authHeaders() })
  },
  sendMessage(userId: number, content: string, imageUrl?: string) {
    return apiFetch<ChatMessage>(`/conversations/${userId}/messages`, {
      method: 'POST',
      headers: authHeaders(),
      body: { content, imageUrl },
    })
  },
  editMessage(id: number, content: string) {
    return apiFetch<ChatMessage>(`/messages/${id}`, { method: 'PATCH', headers: authHeaders(), body: { content } })
  },
  deleteMessage(id: number) {
    return apiFetch<void>(`/messages/${id}`, { method: 'DELETE', headers: authHeaders() })
  },
  blockUser(id: number) {
    return apiFetch<{ blocked: boolean; userId: number }>(`/users/${id}/block`, { method: 'POST', headers: authHeaders() })
  },
  unblockUser(id: number) {
    return apiFetch<{ blocked: boolean; userId: number }>(`/users/${id}/block`, { method: 'DELETE', headers: authHeaders() })
  },
  removeContact(id: number) {
    return apiFetch<void>(`/contacts/${id}`, { method: 'DELETE', headers: authHeaders() })
  },

  /* ------------------------------- Reseñas ------------------------------- */
  getReviews(productId: string) {
    return apiFetch<{ items: ProductReview[]; total: number }>(`/products/${productId}/reviews`)
  },
  addReview(productId: string, rating: number, content: string, imageUrl?: string) {
    return apiFetch<ProductReview>(`/products/${productId}/reviews`, {
      method: 'POST',
      headers: authHeaders(),
      body: { rating, content, imageUrl },
    })
  },
  deleteMyReview(productId: string) {
    return apiFetch<void>(`/products/${productId}/reviews`, { method: 'DELETE', headers: authHeaders() })
  },

  getFeed() {
    return apiFetch<{ items: FeedPost[]; total: number }>('/feed', { headers: authHeaders() })
  },
  myFeedPosts() {
    return apiFetch<{ items: FeedPost[]; total: number }>('/feed/mine', { headers: authHeaders() })
  },
  createFeedPost(input: { title: string; description: string; videoUrl?: string; productCode?: string }) {
    return apiFetch<FeedPost>('/feed', { method: 'POST', headers: authHeaders(), body: input })
  },
  updateFeedPost(id: number, input: { title?: string; description?: string; videoUrl?: string; productCode?: string }) {
    return apiFetch<FeedPost>(`/feed/${id}`, { method: 'PATCH', headers: authHeaders(), body: input })
  },
  deleteFeedPost(id: number) {
    return apiFetch<void>(`/feed/${id}`, { method: 'DELETE', headers: authHeaders() })
  },
  likeFeedPost(id: number) {
    return apiFetch<{ liked: boolean; likesCount: number }>(`/feed/${id}/like`, { method: 'POST', headers: authHeaders() })
  },
  getFeedComments(id: number) {
    return apiFetch<{ items: FeedComment[] }>(`/feed/${id}/comments`)
  },
  addFeedComment(id: number, content: string) {
    return apiFetch<FeedComment>(`/feed/${id}/comments`, { method: 'POST', headers: authHeaders(), body: { content } })
  },
  deleteFeedComment(id: string) {
    return apiFetch<void>(`/feed/comments/${encodeURIComponent(id)}`, { method: 'DELETE', headers: authHeaders() })
  },
  shareFeedPost(id: number, receiverId: number) {
    return apiFetch<{ messageId: number }>(`/feed/${id}/share`, { method: 'POST', headers: authHeaders(), body: { receiverId } })
  },

  /* ----------------------------- Panel admin ----------------------------- */
  adminListProducts() {
    return apiFetch<{ items: StoredProduct[]; total: number }>('/admin/products', { headers: authHeaders() })
  },
  adminListOrders() {
    return apiFetch<{ items: Order[]; total: number }>('/admin/orders', { headers: authHeaders() })
  },
  adminOrderItems(id: number) {
    return apiFetch<{ items: { id: number; product_id: string; name: string; price: number; qty: number }[] }>(`/admin/orders/${id}/items`, { headers: authHeaders() })
  },
  adminApproveOrder(id: number) {
    return apiFetch<{ id: number; status: string; paymentStatus: string }>(`/admin/orders/${id}/approve`, {
      method: 'POST',
      headers: authHeaders(),
    })
  },
  adminUpdateOrderStatus(id: number, status: string) {
    return apiFetch<{ id: number; status: string }>(`/admin/orders/${id}/status`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: { status },
    })
  },
  adminListPayments() {
    return apiFetch<{ items: Payment[]; total: number }>('/admin/payments', { headers: authHeaders() })
  },
  adminDeletePayment(id: number) {
    return apiFetch<void>(`/admin/payments/${id}`, { method: 'DELETE', headers: authHeaders() })
  },
  adminListPromoCodes() {
    return apiFetch<{ items: PromoCode[]; total: number }>('/admin/promo-codes', { headers: authHeaders() })
  },
  adminCreatePromoCode(input: { code: string; type?: 'percent' | 'fixed'; percent?: number; value?: number; minAmount?: number; startsAt?: string; expiresAt?: string; maxUses?: number }) {
    return apiFetch<PromoCode>('/admin/promo-codes', { method: 'POST', headers: authHeaders(), body: input })
  },
  adminUpdatePromoCode(id: number, input: Partial<{ code: string; type: 'percent' | 'fixed'; percent: number; value: number; minAmount: number; startsAt: string | null; expiresAt: string | null; maxUses: number | null; usedCount: number; active: number }>) {
    return apiFetch<PromoCode>(`/admin/promo-codes/${id}`, { method: 'PATCH', headers: authHeaders(), body: input })
  },
  adminDeletePromoCode(id: number) {
    return apiFetch<void>(`/admin/promo-codes/${id}`, { method: 'DELETE', headers: authHeaders() })
  },
  adminListCategories() {
    return apiFetch<{ items: AdminCategory[]; total: number }>('/admin/categories', { headers: authHeaders() })
  },
  adminCreateCategory(input: { key: string; name: string; tagline?: string; active?: boolean; sortOrder?: number }) {
    return apiFetch<AdminCategory>('/admin/categories', { method: 'POST', headers: authHeaders(), body: input })
  },
  adminUpdateCategory(id: number, input: Partial<{ key: string; name: string; tagline: string | null; active: boolean; sortOrder: number }>) {
    return apiFetch<AdminCategory>(`/admin/categories/${id}`, { method: 'PATCH', headers: authHeaders(), body: input })
  },
  adminDeleteCategory(id: number) {
    return apiFetch<void>(`/admin/categories/${id}`, { method: 'DELETE', headers: authHeaders() })
  },
  adminUpdateDelivery(id: number, estimatedDelivery: string) {
    return apiFetch<{ id: number; estimatedDelivery: string }>(`/admin/orders/${id}/delivery`, { method: 'PATCH', headers: authHeaders(), body: { estimatedDelivery } })
  },
  trackOrder(token: string) {
    return apiFetch<{ id: number; customerName: string; customerEmail: string; status: string; total: number; estimatedDelivery: string | null; trackingNumber: string | null; refund: { status: string; amount: number; reason: string | null }; createdAt: string }>(`/orders/track/${encodeURIComponent(token)}`)
  },
  adminListUsers() {
    return apiFetch<{ items: AdminUser[]; total: number }>('/admin/users', { headers: authHeaders() })
  },
  getPayoutAccount() {
    return apiFetch<PayoutAccount | null>('/admin/payout-account', { headers: authHeaders() })
  },
  /** Datos públicos de la cuenta receptora, para mostrar al pagar por transferencia. */
  payoutInfo() {
    return apiFetch<{ provider: string; label: string; accountRef: string; paypalEmail?: string | null } | null>('/payout-info')
  },
  confirmPayoutTransaction(id: number) {
    return apiFetch<{ id: number; status: string; credited: number; currency: string; premiumActivated: boolean }>(`/admin/payout-transactions/${id}/confirm`, {
      method: 'POST',
      headers: authHeaders(),
    })
  },
  refundPayoutTransaction(id: number) {
    return apiFetch<{ id: number; status: string }>(`/admin/payout-transactions/${id}/refund`, {
      method: 'POST',
      headers: authHeaders(),
    })
  },
  savePayoutAccount(input: Omit<PayoutAccount, 'id' | 'isActive' | 'createdAt'>) {
    return apiFetch<PayoutAccount>('/admin/payout-account', { method: 'PUT', headers: authHeaders(), body: { ...input, accountRef: input.accountRef } })
  },
  adminUpdateUserRole(id: number, role: string) {
    return apiFetch<{ id: number; role: string }>(`/admin/users/${id}/role`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: { role },
    })
  },
  adminDeleteUser(id: number) {
    return apiFetch<void>(`/admin/users/${id}`, { method: 'DELETE', headers: authHeaders() })
  },
  adminListFeedPosts() {
    return apiFetch<{ items: ModerationPost[]; total: number }>('/admin/moderation/feed', { headers: authHeaders() })
  },
  adminDeleteFeedPost(id: number) {
    return apiFetch<void>(`/admin/moderation/feed/${id}`, { method: 'DELETE', headers: authHeaders() })
  },
  adminDeleteFeedComment(id: string) {
    return apiFetch<void>(`/admin/moderation/comments/${encodeURIComponent(id)}`, { method: 'DELETE', headers: authHeaders() })
  },
  adminListMessages() {
    return apiFetch<{ items: ModerationMessage[]; total: number }>('/admin/moderation/messages', { headers: authHeaders() })
  },
  adminDeleteMessage(id: number) {
    return apiFetch<void>(`/admin/moderation/messages/${id}`, { method: 'DELETE', headers: authHeaders() })
  },
  adminSuspendUser(id: number) {
    return apiFetch<{ id: number; isSuspended: boolean }>(`/admin/users/${id}/suspension`, { method: 'PATCH', headers: authHeaders(), body: { suspended: true } })
  },
  adminRestoreUser(id: number) {
    return apiFetch<{ id: number; isSuspended: boolean }>(`/admin/users/${id}/suspension`, { method: 'PATCH', headers: authHeaders(), body: { suspended: false } })
  },

  /* ------------------- Fidelización: puntos del usuario ------------------- */
  myPoints() {
    return apiFetch<{ points: number; history: { id: number; delta: number; reason: string; refType: string; createdAt: string }[] }>('/me/points', { headers: authHeaders() })
  },

  /* ------------------- Panel: herramientas nuevas ------------------- */
  refundOrder(id: number, amount: number, reason: string) {
    return apiFetch<{ id: number; refundStatus: 'none' | 'partial' | 'full'; refundAmount: number; refundReason: string }>(`/admin/orders/${id}/refund`, {
      method: 'POST', headers: authHeaders(), body: { amount, reason },
    })
  },
  setTrackingNumber(id: number, trackingNumber: string) {
    return apiFetch<{ id: number; trackingNumber: string }>(`/admin/orders/${id}/tracking`, {
      method: 'POST', headers: authHeaders(), body: { trackingNumber },
    })
  },
  adminAnalytics() {
    return apiFetch<{
      revenue: number; orders: number; pendingOrders: number; users: number; products: number
      lowStock: { id: string; name: string; stock: number }[]
      soldOut: { id: string; name: string; stock: number }[]
      byDay: { day: string; orders: number; revenue: number }[]
      topProducts: { name: string; qty: number; revenue: number }[]
    }>('/admin/analytics', { headers: authHeaders() })
  },

  /* ------------------- Notificaciones push ------------------- */
  pushSubscribe(subscription: { endpoint: string; keys?: { p256dh: string; auth: string }; category?: string; userAgent?: string }) {
    return apiFetch<{ ok: boolean }>('/push/subscribe', { method: 'POST', headers: authHeaders(), body: subscription })
  },
  pushUnsubscribe(endpoint?: string) {
    return apiFetch<{ ok: boolean }>('/push/unsubscribe', { method: 'POST', headers: authHeaders(), body: { endpoint } })
  },
  adminSendPush(message: string, opts?: { title?: string; url?: string }) {
    return apiFetch<{ ok: boolean; sent: number }>('/admin/push/send', {
      method: 'POST', headers: authHeaders(), body: { message, title: opts?.title, url: opts?.url },
    })
  },
}
