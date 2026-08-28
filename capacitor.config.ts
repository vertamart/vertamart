import type { CapacitorConfig } from '@capacitor/cli'

// App Android de Vertamart: carga la web pública y la API online (sin backend local).
const config: CapacitorConfig = {
  appId: 'es.vertamart.shop.android',
  appName: 'Vertamart',
  webDir: 'dist',

  // La app es una ventana a la web pública, no una SPA embebida estática.
  server: {
    url: process.env.VERTAMART_PUBLIC_URL || 'https://vertamart.pages.dev',
    cleartext: false,
  },

  android: {
    allowMixedContent: false,
  },

  plugins: {
    // Icono y notificaciones: Capacitor usa las notificaciones del sistema (push opcional).
    CapacitorHttp: { enabled: true },
    PushNotifications: { // sirve para notificaciones locales; el push remoto se gestiona desde la web/PWA
      presentationOptions: ['alert', 'sound', 'badge'],
    },
  },
}

export default config