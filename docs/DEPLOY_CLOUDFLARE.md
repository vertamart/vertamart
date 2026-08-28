# Desplegar Vertamart en Cloudflare

La tienda se despliega en dos piezas de Cloudflare (ambas con plan gratuito):

| Pieza | Servicio | Qué aloja |
|---|---|---|
| Frontend | **Cloudflare Pages** | La web React/Vite compilada (`dist/`) |
| API | **Cloudflare Worker** | `worker/index.js` (port de `server/`) + base **D1** |

> La API local (Express + `node:sqlite`) no corre en Cloudflare; `worker/index.js` es
> la misma API portada al runtime de Workers con **D1** (SQLite serverless), con el
> mismo contrato de endpoints — el frontend no cambia ni una línea.

---

## 0. Requisitos

- Cuenta gratuita de Cloudflare (https://dash.cloudflare.com/sign-up)
- Node 18+ instalado

## 1. Autenticar wrangler (una vez)

```bash
npx wrangler login
```

Abre el navegador: pulsa **Allow** en la página de Cloudflare.

## 2. Desplegar la API (Worker + D1)

```bash
cd worker

# 2a. Crear la base de datos D1 (una vez)
npx wrangler d1 create vertamart
# → Copia el "database_id" que imprime el comando

# 2b. Pega el id en worker/wrangler.toml  (campo database_id)

# 2c. Crear las tablas en la D1 remota
npx wrangler d1 migrations apply vertamart --remote

# 2d. Desplegar el Worker
npx wrangler deploy
```

Al terminar tendrás la API en una URL como:
`https://vertamart-api.<tu-subdominio>.workers.dev`

**Prueba rápida:**

```bash
curl https://vertamart-api.<tu-subdominio>.workers.dev/api/products
curl -X POST https://vertamart-api.<tu-subdominio>.workers.dev/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Prueba","email":"tu@correo.com","password":"secreto123"}'
```

> La cuenta admin se siembra sola en el primer arranque: `admin@vertamart.es / admin123`
> (cámbiala en el Panel tras el primer login).

## 3. Desplegar el frontend (Pages)

El frontend debe apuntar a la API del Worker en tiempo de compilación:

```bash
# desde la raíz del proyecto (verta-shop/)
npm install
VITE_API_URL="https://vertamart-api.<tu-subdominio>.workers.dev/api" npm run build

npx wrangler pages deploy dist --project-name vertamart
```

Te pedirá crear el proyecto la primera vez: elige **Create a new project** y acepta
el nombre sugerido. Al final obtienes la web en:
`https://vertamart.pages.dev` (o el nombre que elijas).

### Alternativa: por el dashboard de Cloudflare (sin terminal)

1. Sube el proyecto a GitHub.
2. En el dashboard: **Workers & Pages → Create → Pages → Connect to Git**.
3. Build command: `npm run build` · Output: `dist`
4. En **Environment variables** añade:
   - `VITE_API_URL` = `https://vertamart-api.<tu-subdominio>.workers.dev/api`

## 4. Dominio propio (opcional)

En el dashboard, en el proyecto Pages: **Custom domains** → añade tu dominio.
Para el Worker: **Settings → Domains & Routes** → *Custom domain* (ej. `api.tudominio.com`).
Luego recompila el frontend con `VITE_API_URL=https://api.tudominio.com/api`.

## 5. Coste

| Servicio | Plan gratis incluye |
|---|---|
| Pages | Bandwidth y requests ilimitados |
| Workers | 100 000 requests/día |
| D1 | 5 GB almacenamiento · 5 millones de lecturas/día |

Más que suficiente para una tienda en crecimiento.

## Comandos rápidos (raíz del proyecto)

```bash
npm run deploy:api     # despliega el Worker (worker/)
npm run deploy:web     # despliega dist/ a Pages
npm run build:prod     # build apuntando a la API de producción (ver .env.example)
```
