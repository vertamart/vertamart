import { useState, type FormEvent } from 'react'
import { Clock, Mail, MapPin, MessageCircle, Phone, Send } from 'lucide-react'
import { useStore } from '../context/StoreContext'
import { cn } from '../lib/cn'

export function Contact() {
  const { notify } = useStore()
  const [form, setForm] = useState({ nombre: '', email: '', mensaje: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const er: Record<string, string> = {}
    if (form.nombre.trim().length < 3) er.nombre = 'Ingresa tu nombre'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) er.email = 'Correo no válido'
    if (form.mensaje.trim().length < 10) er.mensaje = 'Cuéntanos un poco más (mín. 10 caracteres)'
    setErrors(er)
    if (Object.keys(er).length > 0) return
    setForm({ nombre: '', email: '', mensaje: '' })
    notify('Mensaje enviado. Te responderemos pronto.')
  }

  const set = (k: 'nombre' | 'email' | 'mensaje') => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setErrors((er) => ({ ...er, [k]: '' }))
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <header className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">Contacto</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">¿Cómo podemos ayudarte?</h1>
        <p className="mt-3 text-slate-500">Escríbenos y te responderemos en menos de 24 horas hábiles.</p>
      </header>

      <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_380px]">
        <form onSubmit={submit} noValidate className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="c-nombre" className="text-sm font-medium text-slate-600">Nombre</label>
              <input id="c-nombre" value={form.nombre} onChange={set('nombre')} placeholder="Tu nombre"
                className={cn('mt-1 h-11 w-full rounded-xl border bg-white px-3.5 text-sm outline-none focus:border-brand-400', errors.nombre ? 'border-red-300' : 'border-slate-200')} />
              {errors.nombre && <p className="mt-1 text-xs text-red-500">{errors.nombre}</p>}
            </div>
            <div>
              <label htmlFor="c-email" className="text-sm font-medium text-slate-600">Correo</label>
              <input id="c-email" type="email" value={form.email} onChange={set('email')} placeholder="tu@correo.com"
                className={cn('mt-1 h-11 w-full rounded-xl border bg-white px-3.5 text-sm outline-none focus:border-brand-400', errors.email ? 'border-red-300' : 'border-slate-200')} />
              {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="c-msg" className="text-sm font-medium text-slate-600">Mensaje</label>
              <textarea id="c-msg" value={form.mensaje} onChange={set('mensaje')} rows={5} placeholder="Escribe tu consulta..."
                className={cn('mt-1 w-full rounded-xl border bg-white p-3.5 text-sm outline-none focus:border-brand-400', errors.mensaje ? 'border-red-300' : 'border-slate-200')} />
              {errors.mensaje && <p className="mt-1 text-xs text-red-500">{errors.mensaje}</p>}
            </div>
          </div>
          <button type="submit" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-7 py-3.5 font-bold text-white transition-colors hover:bg-brand-700">
            <Send className="h-4 w-4" /> Enviar mensaje
          </button>
        </form>

        <aside className="space-y-4">
          {[
            { icon: Mail, title: 'Correo', text: 'hola@vertamart.es' },
            { icon: Phone, title: 'Teléfono', text: '+34 910 234 567' },
            { icon: MapPin, title: 'Dirección', text: 'Calle de la Princesa 24, Madrid' },
            { icon: Clock, title: 'Horario', text: 'Lun a Dom, 9:00 – 20:00' },
            { icon: MessageCircle, title: 'Chat en vivo', text: 'Disponible desde la app' },
          ].map((c, i) => (
            <div key={i} className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <c.icon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-bold text-slate-900">{c.title}</h2>
                <p className="text-sm text-slate-500">{c.text}</p>
              </div>
            </div>
          ))}
        </aside>
      </div>
    </div>
  )
}