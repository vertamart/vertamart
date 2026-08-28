import { useI18n } from '../context/I18nContext'
import { ShieldCheck, FileText } from 'lucide-react'

interface Section { h: string; p: string[] }
type Doc = { title: string; updated: string; lead: string; sections: Section[] }

const ES_TERMS: Doc = {
  title: 'Términos y Condiciones',
  updated: 'Última actualización: agosto de 2026',
  lead: 'Estos términos regulan el uso de la tienda Vertamart y la compra de productos a través de esta web. Al usar el sitio aceptas estas condiciones.',
  sections: [
    { h: '1. Aceptación', p: ['Al acceder o comprar en Vertamart aceptas cumplir estos Términos y Condiciones. Si no estás de acuerdo, por favor no utilices la plataforma.'] },
    { h: '2. Cuenta y compras', p: ['Para publicar o comprar necesitas una cuenta. Eres responsable de mantener la confidencialidad de tu contraseña. Los precios se muestran en la moneda seleccionada y pueden ajustarse según tu país.'] },
    { h: '3. Pagos', p: ['El pago se procesa a través de los métodos habilitados (tarjeta, Webpay o transferencia) que acreditan el importe a la cuenta receptora de la tienda. Si el pago queda pendiente, se activa al confirmarse. Los datos de tarjeta no se almacenan en nuestra base de datos.'] },
    { h: '4. Envíos y entregas', p: ['Los tiempos de envío son estimados y dependen del método elegido y de la ubicación. Nos esforzamos por cumplirlos, pero pueden variar por causas ajenas (clima, aduana, transportista).'] },
    { h: '5. Devoluciones y garantía', p: ['Dispones de 30 días para devoluciones simples. La garantía puede variar según el producto y se indica en su ficha. Los gastos de devolución pueden correr por cuenta del comprador salvo producto defectuoso.'] },
    { h: '6. Publicaciones y contenido', p: ['Los productos publicados por los usuarios son de su responsabilidad. Está prohibido publicar contenido falso, ilegal o que infrinja derechos de terceros. La tienda puede retirar publicaciones que incumplan estas reglas.'] },
    { h: '7. Finalización del servicio', p: ['Podemos suspender o cancelar cuentas que incumplan estos términos, sin perjuicio de otras acciones legales. Una suscripción premium puede cancelarse desde la configuración de la cuenta.'] },
  ],
}
const EN_TERMS: Doc = {
  title: 'Terms & Conditions',
  updated: 'Last updated: August 2026',
  lead: 'These terms govern your use of the Vertamart store and purchases made through this website. By using the site you accept these conditions.',
  sections: [
    { h: '1. Acceptance', p: ['By accessing or buying on Vertamart you agree to these Terms and Conditions. If you do not agree, please do not use the platform.'] },
    { h: '2. Account & purchases', p: ['You need an account to publish or buy. You are responsible for keeping your password confidential. Prices are shown in the selected currency and may adjust for your country.'] },
    { h: '3. Payments', p: ['Payment is processed through the enabled methods (card, Webpay or transfer) that credit the amount to the store’s receiving account. If payment stays pending, it activates once confirmed. Card details are not stored in our database.'] },
    { h: '4. Shipping & delivery', p: ['Shipping times are estimates and depend on the chosen method and location. We strive to meet them, but they may vary due to external causes (weather, customs, carrier).'] },
    { h: '5. Returns & warranty', p: ['You have 30 days for easy returns. Warranty may vary per product and is shown on its page. Return shipping may be charged to the buyer unless the product is defective.'] },
    { h: '6. Listings & content', p: ['Products published by users are their responsibility. Publishing false, illegal or infringing content is prohibited. The store may remove listings that breach these rules.'] },
    { h: '7. Termination', p: ['We may suspend or cancel accounts that breach these terms, without prejudice to other legal actions. A premium subscription can be cancelled from your account settings.'] },
  ],
}

const ES_PRIVACY: Doc = {
  title: 'Política de Privacidad',
  updated: 'Última actualización: agosto de 2026',
  lead: 'Nos tomamos tu privacidad en serio. Esta política explica qué datos tratamos, para qué y cómo los protegemos.',
  sections: [
    { h: '1. Qué datos recopilamos', p: ['Datos de cuenta (nombre, correo, país), datos de pedido (dirección, teléfono) y, si te suscribes, la referencia del pago. No almacenamos números de tarjeta ni CVV.'] },
    { h: '2. Para qué los usamos', p: ['Gestionar tu cuenta y pedidos, procesar pagos, enviar seguimiento, mostrar precios en tu moneda y mejorar la experiencia.'] },
    { h: '3. Cookies y almacenamiento', p: ['Usamos cookies y almacenamiento local para recordar tu idioma, tema, carrito, favoritos y sesión. Puedes aceptar o rechazar el aviso de cookies y limpiarlas desde tu navegador.'] },
    { h: '4. Con quién los compartimos', p: ['Solo con los proveedores necesarios para el funcionamiento (pago, envío, correo) y siempre bajo las condiciones mínimas. No vendemos tus datos.'] },
    { h: '5. Seguridad', p: ['Generalizamos los datos sensibles y usamos cifrado en las comunicaciones. Las contraseñas se almacenan con hash, nunca en texto plano.'] },
    { h: '6. Tus derechos', p: ['Puedes acceder, corregir o eliminar tus datos. Para ello escribe a hola@vertamart.es o gestiona tu cuenta desde la configuración.'] },
  ],
}
const EN_PRIVACY: Doc = {
  title: 'Privacy Policy',
  updated: 'Last updated: August 2026',
  lead: 'We take your privacy seriously. This policy explains what data we process, why, and how we protect it.',
  sections: [
    { h: '1. What we collect', p: ['Account data (name, email, country), order data (address, phone) and, if you subscribe, the payment reference. We do not store card numbers or CVV.'] },
    { h: '2. How we use it', p: ['To manage your account and orders, process payments, send tracking, show prices in your currency and improve the experience.'] },
    { h: '3. Cookies & storage', p: ['We use cookies and local storage to remember your language, theme, cart, favorites and session. You can accept or reject the cookie notice and clear them from your browser.'] },
    { h: '4. Who we share with', p: ['Only with the providers required for operation (payment, shipping, email) and under minimum conditions. We never sell your data.'] },
    { h: '5. Security', p: ['We anonymise sensitive data and use encryption in transit. Passwords are stored hashed, never in plain text.'] },
    { h: '6. Your rights', p: ['You can access, correct or delete your data. Write to hola@vertamart.es or manage your account from settings.'] },
  ],
}

function RenderDoc({ doc, icon }: { doc: Doc; icon: 'file' | 'shield' }) {
  const Icon = icon === 'file' ? FileText : ShieldCheck
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><Icon className="h-6 w-6" /></span>
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{doc.title}</h1>
          <p className="text-xs text-slate-400">{doc.updated}</p>
        </div>
      </div>
      <p className="mt-4 leading-relaxed text-slate-600">{doc.lead}</p>
      <div className="mt-8 space-y-8">
        {doc.sections.map((s) => (
          <section key={s.h}>
            <h2 className="text-lg font-bold text-slate-900">{s.h}</h2>
            {s.p.map((par, i) => <p key={i} className="mt-2 leading-relaxed text-slate-600">{par}</p>)}
          </section>
        ))}
      </div>
    </div>
  )
}

export function Terms() {
  const { lang } = useI18n()
  return <RenderDoc doc={lang === 'en' ? EN_TERMS : ES_TERMS} icon="file" />
}

export function Privacy() {
  const { lang } = useI18n()
  return <RenderDoc doc={lang === 'en' ? EN_PRIVACY : ES_PRIVACY} icon="shield" />
}