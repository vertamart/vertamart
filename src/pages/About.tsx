import { Link } from 'react-router-dom'
import { Award, Download, HeartHandshake, Users } from 'lucide-react'

export function About() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <header className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">Sobre nosotros</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          Recursos digitales que <span className="text-brand-600">impulsan</span> tu trabajo
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-slate-600">
          En Vertamart creemos que comprar recursos digitales debería ser tan bueno como usarlos. Cada plantilla, preset, fuente o curso está seleccionado y probado, y se entrega al instante con su licencia.
        </p>
      </header>

      <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Users, title: '+120.000 clientes', text: 'Creadores que confían en nosotros cada día.' },
          { icon: Award, title: 'Selección experta', text: 'Probamos cada recurso antes de venderlo.' },
          { icon: HeartHandshake, title: 'Soporte humano', text: 'Personas reales respondiendo en minutos.' },
          { icon: Download, title: 'Entrega inmediata', text: 'Descargas al instante, sin esperas ni envíos.' },
        ].map((v, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <v.icon className="h-6 w-6" />
            </div>
            <h2 className="mt-4 font-bold text-slate-900">{v.title}</h2>
            <p className="mt-1 text-sm text-slate-500">{v.text}</p>
          </div>
        ))}
      </div>

      <section className="mt-16 overflow-hidden rounded-3xl bg-brand-950 p-10 text-center text-white sm:p-16">
        <h2 className="text-2xl font-extrabold sm:text-3xl">Nuestra promesa</h2>
        <p className="mx-auto mt-3 max-w-2xl text-slate-300">
          Si algo sale mal, lo arreglamos. Licencias claras, actualizaciones incluidas y un equipo que responde. Así de simple.
        </p>
        <Link to="/productos" className="mt-8 inline-block rounded-xl bg-brand-500 px-8 py-3.5 font-bold text-white transition-colors hover:bg-brand-400">
          Conoce nuestros productos
        </Link>
      </section>
    </div>
  )
}
