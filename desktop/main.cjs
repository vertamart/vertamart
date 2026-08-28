const { app, BrowserWindow, session } = require('electron')
const path = require('path')
const { existsSync } = require('fs')

const PUBLIC_WEB_URL = process.env.VERTAMART_PUBLIC_URL || 'https://vertamart.pages.dev'
// Copia local del sitio (dist) para funcionar sin red y como respaldo si lo público falla.
const LOCAL_DIST = path.join(__dirname, '..', 'dist', 'index.html')

let mainWindow = null
let loadAttempts = 0
const MAX_ATTEMPTS = 2

const BRAND_GREEN = '#16a34a'

function isAllowedUrl(url) {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && (parsed.hostname === 'vertamart.pages.dev' || parsed.hostname.endsWith('.vertamart.pages.dev'))
  } catch {
    return false
  }
}

/** Pantalla de carga inicial (verde con logo) mientras arranca Electron. */
function loadingHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;
      background:linear-gradient(160deg,#0b1220,#0d1b12 55%,#08301c);font-family:Segoe UI,system-ui,sans-serif;color:#fff}
    .logo{width:76px;height:76px;display:flex;align-items:center;justify-content:center;
      border-radius:22px;background:${BRAND_GREEN};box-shadow:0 8px 30px rgba(22,163,74,.45)}
    .mark{width:34px;height:34px;fill:#fff}
    @keyframes spin{to{transform:rotate(360deg)}}
    .ring{width:22px;height:22px;border:3px solid rgba(255,255,255,.25);border-top-color:#fff;border-radius:50%;animation:spin .8s linear infinite;margin-top:22px}
    h1{margin:14px 0 0;font-size:20px;font-weight:600} p{margin:4px 0 0;font-size:13px;opacity:.75}
  </style></head><body>
    <div class="logo"><svg class="mark" viewBox="0 0 24 24"><path d="M12 3c2 0 3.5 1 4.5 3l4 10-3-1-1.5-4H8l-1.5 4-3 1 4-10C8.5 4 10 3 12 3z"/></svg></div>
    <h1>Vertamart</h1><p>Cargando tienda…</p><div class="ring"></div>
  </body></html>`
}

/** Pantalla de error con botón Reintentar (evita la ventana en blanco). */
function errorHtml(detail) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#0b1220;color:#fff;font-family:Segoe UI,system-ui,sans-serif;text-align:center}
    .card{max-width:380px} .emoji{font-size:46px} h1{font-size:20px;margin:12px 0 6px} p{font-size:14px;opacity:.75;margin:0}
    button{margin-top:20px;border:0;border-radius:12px;background:${BRAND_GREEN};color:#fff;font-size:14px;font-weight:600;padding:11px 20px;cursor:pointer}
    button:hover{filter:brightness(1.1)} code{display:block;margin-top:12px;font-size:11px;opacity:.5;word-break:break-all}
  </style></head><body><div class="card">
    <div class="emoji">📡</div><h1>No se pudo conectar con la tienda</h1>
    <p>Comprueba tu conexión a internet y vuelve a intentarlo.</p>
    <button id="r">Reintentar</button><code>${detail || ''}</code>
    <script>
      document.getElementById('r').onclick = function(){ try { location.reload() } catch(e) {} }
    </script>
  </div></body></html>`
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0b1220',
    title: 'Vertamart',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })

  mainWindow.setMenuBarVisibility(false)

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) =>
    isAllowedUrl(url) ? { action: 'allow' } : { action: 'deny' },
  )

  // Carga inicial: splash inmediato para que nunca se vea una ventana en blanco.
  await mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(loadingHtml()))

  await tryLoadPublic()
}

async function loadLocalFallback() {
  if (!existsSync(LOCAL_DIST)) return false
  try {
    await mainWindow.loadFile(LOCAL_DIST)
    return true
  } catch {
    return false
  }
}

async function tryLoadPublic() {
  loadAttempts = 0
  const attempt = () =>
    new Promise((resolve) => {
      let settled = false
      const finish = (ok) => { if (!settled) { settled = true; clearTimeout(timer); resolve(ok) } }
      const timer = setTimeout(() => finish(false), 20000)

      mainWindow.webContents.once('did-finish-load', () => finish(true))
      mainWindow.webContents.once('did-fail-load', (_e, code, desc) => finish(code === -3 /* aborted */ ? undefined : false))

      mainWindow.loadURL(PUBLIC_WEB_URL).catch(() => finish(false))
    })

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const ok = await attempt()
    if (ok === true) return // cargado
  }

  // Intenta el respaldo local (la web empaquetada) para no quedarse en blanco.
  const localOk = await loadLocalFallback()
  if (!localOk) {
    await mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(errorHtml(PUBLIC_WEB_URL)))
      .catch(() => mainWindow.loadURL('about:blank'))
  }
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(['media', 'notifications', 'clipboard-write'].includes(permission))
  })
  // Reintento manual desde la pantalla de error del respaldo local.
  const retryOnNavigate = () => {
    try {
      const url = mainWindow.webContents.getURL()
      if (url && url.startsWith('data:text/html')) return
    } catch { /* ignore */ }
  }
  session.defaultSession.webRequest.onBeforeRequest({ urls: [] }, () => {})
  void retryOnNavigate

  await createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})