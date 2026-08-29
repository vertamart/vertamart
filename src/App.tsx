import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { Home } from './pages/Home'

// Code-splitting: cada página se carga bajo demanda (mejor rendimiento inicial).
const ProductCatalog = lazy(() => import('./pages/ProductCatalog').then((m) => ({ default: m.ProductCatalog })))
const ProductDetail = lazy(() => import('./pages/ProductDetail').then((m) => ({ default: m.ProductDetail })))
const Cart = lazy(() => import('./pages/Cart').then((m) => ({ default: m.Cart })))
const Checkout = lazy(() => import('./pages/Checkout').then((m) => ({ default: m.Checkout })))
const PaymentResult = lazy(() => import('./pages/PaymentResult').then((m) => ({ default: m.PaymentResult })))
const Favorites = lazy(() => import('./pages/Favorites').then((m) => ({ default: m.Favorites })))
const Categories = lazy(() => import('./pages/Categories').then((m) => ({ default: m.Categories })))
const Sale = lazy(() => import('./pages/Sale').then((m) => ({ default: m.Sale })))
const Bundles = lazy(() => import('./pages/Bundles').then((m) => ({ default: m.Bundles })))
const BundleDetail = lazy(() => import('./pages/BundleDetail').then((m) => ({ default: m.BundleDetail })))
const About = lazy(() => import('./pages/About').then((m) => ({ default: m.About })))
const Contact = lazy(() => import('./pages/Contact').then((m) => ({ default: m.Contact })))
const Install = lazy(() => import('./pages/Install').then((m) => ({ default: m.Install })))
const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })))
const ResetPassword = lazy(() => import('./pages/ResetPassword').then((m) => ({ default: m.ResetPassword })))
const OAuthCallback = lazy(() => import('./pages/OAuthCallback').then((m) => ({ default: m.OAuthCallback })))
const Account = lazy(() => import('./pages/Account').then((m) => ({ default: m.Account })))
const Publish = lazy(() => import('./pages/Publish').then((m) => ({ default: m.Publish })))
const AdminPanel = lazy(() => import('./pages/AdminPanel').then((m) => ({ default: m.AdminPanel })))
const SellerProfile = lazy(() => import('./pages/SellerProfile').then((m) => ({ default: m.SellerProfile })))
const Chat = lazy(() => import('./pages/Chat').then((m) => ({ default: m.Chat })))
const SupportAccess = lazy(() => import('./pages/SupportAccess').then((m) => ({ default: m.SupportAccess })))
const OrderTracking = lazy(() => import('./pages/OrderTracking').then((m) => ({ default: m.OrderTracking })))
const Feed = lazy(() => import('./pages/Feed').then((m) => ({ default: m.Feed })))
const Terms = lazy(() => import('./pages/Legal').then((m) => ({ default: m.Terms })))
const Privacy = lazy(() => import('./pages/Legal').then((m) => ({ default: m.Privacy })))
const NotFound = lazy(() => import('./pages/NotFound').then((m) => ({ default: m.NotFound })))

/** Fallback de carga para cada ruta: mantiene la altura y evita saltos de scroll. */
function PageFallback() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-7xl items-center justify-center px-4">
      <div className="flex flex-col items-center gap-3">
        <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-200 border-t-brand-600" aria-hidden="true" />
        <span className="text-sm text-slate-400">Cargando…</span>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Layout>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/productos" element={<ProductCatalog />} />
          <Route path="/producto/:slug" element={<ProductDetail />} />
          <Route path="/carrito" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/pago/exito" element={<PaymentResult />} />
          <Route path="/pago/cancelado" element={<PaymentResult />} />
          <Route path="/favoritos" element={<Favorites />} />
          <Route path="/categorias" element={<Categories />} />
          <Route path="/ofertas" element={<Sale />} />
          <Route path="/bundles" element={<Bundles />} />
          <Route path="/bundle/:slug" element={<BundleDetail />} />
          <Route path="/nosotros" element={<About />} />
          <Route path="/contacto" element={<Contact />} />
          <Route path="/instalar" element={<Install />} />
          <Route path="/login" element={<Login />} />
          <Route path="/recuperar" element={<ResetPassword />} />
          <Route path="/auth/callback" element={<OAuthCallback />} />
          <Route path="/cuenta" element={<Account />} />
          <Route path="/publicar" element={<Publish />} />
          <Route path="/panel" element={<AdminPanel />} />
          <Route path="/vendedor/:id" element={<SellerProfile />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/soporte" element={<SupportAccess />} />
          <Route path="/pedido/:token" element={<OrderTracking />} />
          <Route path="/feed" element={<Feed />} />
          <Route path="/terminos" element={<Terms />} />
          <Route path="/privacidad" element={<Privacy />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Layout>
  )
}