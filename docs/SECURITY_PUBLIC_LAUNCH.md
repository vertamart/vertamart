# Lanzamiento público seguro

## Arquitectura

- Cloudflare Pages sirve `dist/` por HTTPS.
- Cloudflare Worker sirve `/api/*`.
- D1 almacena usuarios, productos, pedidos y mensajes.
- Electron debe configurarse con `VERTAMART_PUBLIC_URL` y no depender de `localhost`.

## Antes de publicar

1. Crear una base D1 nueva para producción; no subir la base SQLite local.
2. Aplicar todas las migraciones con `npx wrangler d1 migrations apply vertamart --remote`.
3. Reemplazar el `database_id` de `worker/wrangler.toml`.
4. Cambiar inmediatamente las credenciales iniciales de administrador.
5. Configurar secretos del Worker con `wrangler secret put`; nunca guardar claves en Git.
6. Restringir CORS al dominio de Pages cuando exista; no usar `*` en producción.
7. Añadir Turnstile o un proveedor de protección anti-bots al registro, login y publicación.
8. Aplicar rate limiting en login, registro, mensajes, subida y pagos.
9. Validar tamaño y tipo real de archivos; almacenar imágenes en R2, no en SQLite/D1.
10. Configurar copias/retención y revisar logs sin incluir contraseñas, tokens ni tarjetas.
11. Usar un proveedor de pagos real mediante su SDK/checkout alojado; nunca recibir CVV ni guardar tarjetas.
12. Configurar correo transaccional con secretos y enlaces de seguimiento con tokens aleatorios.

## Despliegue gratuito inicial

```bash
cd worker
npx wrangler login
npx wrangler d1 create vertamart
# Copia el database_id en wrangler.toml
npx wrangler d1 migrations apply vertamart --remote
npx wrangler deploy

cd ..
VITE_API_URL="https://vertamart-api.<tu-subdominio>.workers.dev/api" npm run build
npx wrangler pages deploy dist --project-name vertamart
```

Cloudflare proporcionará una URL gratuita `pages.dev`. Un dominio personalizado requiere que el propietario registre uno y configure DNS.

## Electron público

Genera el instalador con la URL pública:

```bash
set VERTAMART_PUBLIC_URL=https://vertamart.pages.dev
npm run build
npm run desktop:dist
```

No publiques el instalador hasta que la URL pública y la API estén verificadas.
