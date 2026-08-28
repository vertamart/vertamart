# API — Contrato de endpoints

Implementaciones: `server/` (Express + SQLite local) y `worker/` (Cloudflare Worker + D1, misma API). Despliegue: ver `DEPLOY_CLOUDFLARE.md`.

La aplicación consume el catálogo a través de un **repositorio**
(`src/api/repository.ts`) que implementa la interfaz `CatalogRepository`.
En modo demo usa datos locales; cuando definas `VITE_API_URL` (o
`VITE_DATA_SOURCE=api`) en `.env`, conmuta automáticamente a la API real
sin tocar el resto del código.

## Convenciones

- **Base URL:** `VITE_API_URL` (ej. `https://api.tudominio.com/api`).
- **Respuestas:** siempre con envoltura `{ "data": <payload>, "meta": {...} }`.
  El cliente (`src/api/client.ts`) desenvuelve `data` automáticamente.
- **Errores:** código HTTP + cuerpo `{ "status": 404, "message": "...", "code": "PRODUCT_NOT_FOUND", "details": {...} }`.
- **Autenticación (opcional):** `Authorization: Bearer <token>` vía `VITE_API_TOKEN`.

## Endpoints

### `GET /products`
Lista paginada de productos con filtros server-side.

| Query      | Tipo       | Descripción                              |
|------------|------------|------------------------------------------|
| `q`        | string     | Búsqueda por nombre/marca/descripción    |
| `category` | string     | id de categoría (`audio`, `wearables`, …)|
| `maxPrice` | number     | Precio máximo                            |
| `minRating`| number     | Valoración mínima (0–5)                  |
| `inStock`  | boolean    | Solo productos disponibles               |
| `sort`     | string     | `price-asc` \| `price-desc` \| `rating` \| `newest` |
| `page`     | number     | Página (default 1)                       |
| `pageSize` | number     | Tamaño de página (default 24)            |

Respuesta: `{ "data": { "items": Product[], "total": 48, "page": 1, "pageSize": 24, "totalPages": 2 } }`

### `GET /products/:slug`
Detalle de un producto por slug.
Respuesta: `{ "data": Product }` · 404 si no existe.

### `GET /categories`
Lista de categorías.
Respuesta: `{ "data": Category[] }`

### `POST /coupons/validate`
Valida un código de cupón.
Cuerpo: `{ "code": "VERTA10" }`
Respuesta: `{ "data": { "valid": true, "code": "VERTA10", "percent": 10, "min": 30000 } }`
Si es inválido: `{ "data": { "valid": false, "reason": "Cupón no encontrado" } }`

## Tipos

```ts
interface Product {
  id: string
  slug: string
  name: string
  brand: string
  category: 'audio' | 'wearables' | 'teclado' | 'mouse' | 'carga' | 'monitor'
  price: number            // en CLP
  oldPrice?: number        // precio anterior (presencia = descuento)
  rating: number           // 0–5
  reviews: number
  stock: number
  badge?: 'nuevo' | 'popular' | 'top'
  description: string
  features: string[]
  shipDays: number
  colors: string[]         // valores hex
  image: string            // URL de la imagen principal
  images: string[]         // URLs de la galería
  createdAt: string        // ISO 8601
}

interface Category {
  id: 'audio' | 'wearables' | 'teclado' | 'mouse' | 'carga' | 'monitor'
  name: string
  tagline: string
}

interface Coupon {
  code: string
  percent: number
  min?: number             // compra mínima en CLP
}
```

> Los campos `image`/`images` son URLs de imágenes reales de los productos
> (fotos de Pexels, libres de uso). Si una URL falla o no hay conexión,
> `ProductImage` dibuja un placeholder SVG según la categoría como respaldo.

## Perfiles, seguir y chat

| Endpoint | Método | Auth | Descripción |
|---|---|---|---|
| `/users/:id` | GET | pública | Perfil público: `{ id, name, country, productsCount, followersCount, followingCount, isFollowing, isSelf }` |
| `/users/:id/products` | GET | pública | Productos activos publicados por ese usuario |
| `/users/:id/follow` | POST | sí | Seguir a un usuario → devuelve el perfil actualizado |
| `/users/:id/follow` | DELETE | sí | Dejar de seguir |
| `/me/following` | GET | sí | Usuarios que sigo |
| `/conversations` | GET | sí | Conversaciones con último mensaje y `unreadCount` |
| `/conversations/:userId/messages` | GET | sí | Mensajes con ese usuario (marca los recibidos como leídos) |
| `/conversations/:userId/messages` | POST | sí | Enviar mensaje — requiere seguir al otro, que te siga, o conversación previa (403 `FOLLOW_REQUIRED`) |

Los productos de usuarios incluyen `owner: { id, name }` para enlazar al perfil del vendedor.

## Autenticación (backend local con SQLite)

Hay un backend real en `server/` (Node + Express + SQLite vía `node:sqlite`,
sin dependencias nativas). La base de datos es un archivo local
(`server/verta.db`) con tablas `users` y `sessions`.

- **Iniciar servidor:** `npm run server` (o `npm run dev:all` para web + API
  juntos con `concurrently`).
- **En desarrollo** el proxy de Vite (`vite.config.ts`) envía `/api/*` al
  backend en `http://localhost:4000`.
- **Contraseñas** con hash bcrypt (nunca en texto plano).
- **Sesiones** por token aleatorio guardado en la tabla `sessions` con
  expiración de 30 días. El cliente guarda el token en localStorage
  (`verta.token`) y lo envía como `Authorization: Bearer <token>`.

Endpoints:

| Método | Ruta                 | Descripción                                          | Respuesta          |
|--------|----------------------|------------------------------------------------------|--------------------|
| POST   | `/api/auth/register` | Crea cuenta `{ name, email, password }`              | `{ token, user }`  |
| POST   | `/api/auth/login`    | Inicia sesión `{ email, password }`                  | `{ token, user }`  |
| GET    | `/api/auth/me`       | Usuario de la sesión (Bearer token)                  | `{ user }`         |
| POST   | `/api/auth/logout`   | Revoca la sesión (Bearer token)                      | `204`              |
| PATCH  | `/api/auth/me`       | Actualiza perfil `{ name?, country? }` (Bearer token) | `{ user }`         |

Errores: `409 EMAIL_TAKEN`, `401 INVALID_CREDENTIALS` / `UNAUTHORIZED`,
`400 INVALID_EMAIL` / `WEAK_PASSWORD` / `INVALID_NAME` / `INVALID_COUNTRY`.

El usuario incluye `role` (`customer` | `admin`) y `country` (código ISO de
2 letras, define la moneda regional).

### Productos publicados (usuarios)

| Método | Ruta                    | Descripción                                              |
|--------|-------------------------|----------------------------------------------------------|
| GET    | `/api/products`         | Productos activos publicados (se mezclan con el catálogo)| 
| GET    | `/api/products/mine`    | Mis publicaciones (auth)                                 |
| POST   | `/api/products`         | Publicar `{ name, description, category, price, stock, image, features }` (auth) |
| PATCH  | `/api/products/:id`     | Editar (dueño o admin)                                   |
| DELETE | `/api/products/:id`     | Eliminar (dueño o admin)                                 |

El precio se guarda en **CLP** (base) y el frontend lo convierte a la
moneda regional (ver `src/lib/currency.ts`).

### Pedidos (checkout)

`POST /api/orders` guarda el pedido y su pago al confirmar el checkout:
`{ items: [{productId, name, price, qty}], subtotal, discount, shipping, total, method, transactionId?, installments?, paymentStatus, customerName, customerEmail }`. Permite invitados.

### Panel admin (rol `admin`)

| Método | Ruta                              | Descripción                        |
|--------|-----------------------------------|------------------------------------|
| GET    | `/api/admin/products`             | Todos los productos (incl. ocultos)|
| GET    | `/api/admin/orders`               | Pedidos con nº de items            |
| PATCH  | `/api/admin/orders/:id/status`    | Cambiar estado (`pending, paid, shipped, delivered, cancelled`) |
| GET    | `/api/admin/payments`             | Pagos registrados                  |
| GET    | `/api/admin/users`                | Usuarios                           |
| PATCH  | `/api/admin/users/:id/role`       | Hacer/quitar admin                 |
| DELETE | `/api/admin/users/:id`            | Eliminar usuario (no a ti mismo)   |

La primera cuenta admin se crea automáticamente al iniciar el servidor:
`admin@vertamart.es` / `admin123` (cámbiala en producción).

> El frontend consume esto en `src/api/services/auth.ts` + `AuthContext`.
> Cuando conectes una API real, migra estos endpoints al mismo contrato.

## Pagos (demo)

El checkout (`src/pages/Checkout.tsx`) paga a través de la interfaz
`PaymentProvider` (`src/api/payments.ts`). Por defecto usa
`MockPaymentProvider`: simula la aprobación tras una demora breve y **no
procesa ni almacena datos reales de tarjeta** (validación Luhn y formato
en el cliente, solo para la demo).

Para producción, define `VITE_PAYMENT_PROVIDER` e implementa la
integración en `src/api/payments.ts`:

- `stripe` → `StripePaymentProvider` (PaymentIntent creado desde un backend
  que guarde la secret key; el cliente solo confirma).
- `webpay` → `WebpayPaymentProvider` (Transbank, requiere credenciales de
  comercio y backend para crear la transacción).

Contrato `PaymentProvider`:

```ts
interface PaymentRequest {
  orderId: string
  amount: number            // en CLP
  method: 'card' | 'webpay' | 'transfer'
  installments?: number     // cuotas sin interés (tarjeta)
  card?: { number: string; expiry: string; cvv: string; holder: string }
  customer: { name: string; email: string }
}

interface PaymentResult {
  status: 'approved' | 'pending' | 'declined' | 'error'
  transactionId?: string
  message?: string
}
```
