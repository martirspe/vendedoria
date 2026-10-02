# Plan técnico — Tienda web por tenant (integración del catálogo digital en VendedorIA)

Estado: propuesta · Fecha: 2 de octubre de 2026
Origen del código a portar: `PROYECTOS/catalogo-digital/catalogo` (tienda de una sola marca, en producción).

---

## 1. Objetivo y cuña

Cada merchant de VendedorIA obtiene, además de su vendedor IA en WhatsApp/Instagram, una **tienda web propia** que comparte el mismo catálogo, pedidos, cupones y cobros.

**Cuña frente al referente de categoría:** "Commerce en el hilo **y en la web**":

- El agente envía enlaces a fichas reales con fotos, precio y stock del catálogo; no describe productos de memoria.
- La web lleva tráfico de Google y de anuncios al agente con el contexto del producto ("Consultar por WhatsApp" con referencia del producto).
- Un solo inbox de pedidos (web + chat), con el canal de origen visible.
- Si el merchant aún no conecta su cobro, la tienda funciona en modo **"pedir por WhatsApp"**: el carrito se convierte en un pedido borrador ligado a la conversación y el agente lo cierra.

Posicionamiento: *tienda simple que vende sola por WhatsApp*. No es un competidor de Shopify; no se construye un editor de páginas.

---

## 2. Punto de partida (diagnóstico)

| Tema | VendedorIA (base) | Catálogo (origen) |
| --- | --- | --- |
| Tenancy | Multi-tenant (`tenantId` en todo) | Una tienda; identidad por variables de entorno |
| Versiones | NestJS 11 · Prisma 6 · Angular 22 | NestJS 12 · Prisma 7 · Angular 22 |
| Estilo | Archivos formateados, DTO con class-validator, Design System con tokens | Plantillas inline compactas, zod, CSS global |
| SSR | `RenderMode.Prerender` para todo (consola) | Render por request con resolvers |
| Producto | Estructurado: variantes, media, stock, categorías múltiples | `content` JSON, una categoría |
| Pedido | Sin dirección, correo, envío, descuento, reserva de stock ni expiración | Completo: reserva de stock, expiración, idempotencia (`checkoutKey`), cupón, envío, correo |
| Cobro al comprador | Checkout Pro (preferencias) con **un solo token global** `MERCADOPAGO_ACCESS_TOKEN` | Orders API + Card Payment Brick + Yape, webhook firmado |
| Cupones | No existen | Motor completo (%, monto, envío gratis, bxgy, alcance, límites) |
| Legal | No existe | Centro legal Perú + Libro de Reclamaciones (ReclamoFácil) |

Hallazgos que condicionan el plan:

1. **Bloqueante de dinero:** con el token global, todos los cobros de compradores llegarían a la cuenta de la plataforma. Antes de vender en la web hay que tener credenciales de Mercado Pago **por tenant** (aplica también a los links del agente).
2. El SSR de la consola prerenderiza; la tienda necesita render por request (contenido distinto por tenant y host).
3. El repositorio tiene muchos cambios sin commit: hay que consolidarlos antes de abrir la rama de trabajo.

---

## 3. Decisiones de arquitectura

### 3.1 Aplicación Angular separada: `apps/store`

Se crea una segunda app en el monorepo en lugar de añadir rutas a `apps/web`:

- El bundle público no carga código de consola, auth ni JWT.
- Render por request (`RenderMode.Server`) sin afectar el prerender de la consola.
- La CSP es por tenant (píxeles, Mercado Pago) sin relajar la de la consola.
- Se despliega y escala por separado; la tienda recibe el tráfico anónimo.

Lo compartido va a `packages/`:

- `packages/design-tokens`: tokens base (`tokens.scss`) más tokens de tema sobreescribibles por tenant (color de marca, radio, tipografía de una lista cerrada).
- `packages/contracts`: tipos de respuesta de la API pública (`StorefrontView`, `PublicProduct`, `PublicOrder`).

### 3.2 Resolución del tenant por host

- Subdominio de plataforma: `{slug}.<dominio-plataforma>` (dominio por decidir).
- Dominio propio (fase 3): tabla `StoreDomain`, que resuelve `hostname → tenantId`.
- El servidor SSR de `apps/store` lee `Host` y llama a `GET /api/v1/storefront/resolve?host=...`; el resultado se cachea en memoria con un TTL corto.
- Desarrollo: `{slug}.localhost:4300` (los navegadores resuelven `*.localhost` sin configurar DNS).

### 3.3 API pública: módulo `storefront`

Es un módulo NestJS nuevo y **sin JWT**. Todas sus queries filtran por el `tenantId` resuelto y nunca lo aceptan del cliente.

```
GET  /storefront/resolve?host=                → { tenantSlug, status }
GET  /storefront/:slug                        → identidad, tema, legal, envío, contacto, píxeles
GET  /storefront/:slug/products?category=&q=  → productos publicados (paginado)
GET  /storefront/:slug/products/:handle       → ficha + relacionados
POST /storefront/:slug/coupons/preview        → cálculo autoritativo del descuento
POST /storefront/:slug/checkout               → crea el pedido (idempotente por checkoutKey)
POST /storefront/:slug/orders/:id/pay         → pago con Brick/Yape (credenciales del tenant)
GET  /storefront/:slug/orders/:id?token=      → estado público del pedido
POST /storefront/:slug/whatsapp-order         → modo "pedir por WhatsApp" (pedido borrador)
POST /webhooks/mercadopago/:tenantId          → webhook firmado con el secreto del tenant
```

Rate limiting por IP y por tenant (se porta el esquema `RateLimit` del catálogo o se usa `@fastify/rate-limit`).

### 3.4 Cobros por tenant

- Nuevo modelo `MerchantPaymentAccount`: el access token y el secreto de webhook del tenant se guardan **cifrados** (AES-256-GCM con la clave `PAYMENT_CREDENTIALS_KEY` del entorno) y nunca vuelven al frontend.
- Fase 2: el merchant pega sus credenciales de producción, con validación en vivo contra la API de Mercado Pago.
- Fase 3: Mercado Pago OAuth (marketplace) para conectar con un clic.
- `PaymentProviderPort` recibe las credenciales por llamada en vez de leerlas del entorno. Se mantienen dos métodos:
  - `createCheckout` (Checkout Pro) para los links que envía el agente.
  - `createOrder` (Orders API + Brick + Yape), portado de `catalogo/apps/api/src/payments.ts`, para el checkout web.
- La firma del webhook se valida con el secreto del tenant (`signature()` del catálogo). El procesamiento es idempotente, con eventos guardados.
- El flujo A (suscripción SaaS) sigue usando las credenciales de la plataforma, separado en dominio, UI y copy.

---

## 4. Cambios de esquema (Prisma)

Las migraciones son aditivas, sin borrar columnas existentes.

```prisma
enum OrderChannel { WEB WHATSAPP INSTAGRAM MANUAL }
enum StorefrontStatus { DRAFT PUBLISHED SUSPENDED }

model Storefront {
  id                String           @id @default(cuid())
  tenantId          String           @unique
  status            StorefrontStatus @default(DRAFT)
  displayName       String
  tagline           String?
  logoUrl           String?
  heroImageUrl      String?
  theme             Json             // { brandColor, accentColor, radius, font } validated server-side
  whatsappPhone     String?
  contactEmail      String?
  legalName         String?
  ruc               String?
  legalAddress      String?
  dataBankCode      String?          // ANPD registration code
  complaintsBookUrl String?          // ReclamoFácil link (required to publish in PE)
  shipping          Json             // zones, prices, free-shipping threshold
  tracking          Json?            // { ga4Id, metaPixelId, tiktokId, clarityId }
  seoTitle          String?
  seoDescription    String?
  publishedAt       DateTime?
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt
  tenant            Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}

model StoreDomain {            // phase 3
  id         String    @id @default(cuid())
  tenantId   String
  hostname   String    @unique
  verifiedAt DateTime?
  createdAt  DateTime  @default(now())
  tenant     Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  @@index([tenantId])
}

model MerchantPaymentAccount {
  id                     String   @id @default(cuid())
  tenantId               String
  provider               String   @default("mercadopago")
  accessTokenEnc         String
  webhookSecretEnc       String?
  publicKey              String?
  liveMode               Boolean  @default(false)
  verifiedAt             DateTime?
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt
  tenant                 Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  @@unique([tenantId, provider])
}
```

Ampliaciones de modelos existentes:

- **Product:** `isPublishedOnStore Boolean @default(false)`, `compareAtPriceCents Int?`, `brand String?`, `sortOrder Int @default(0)`, `seoTitle String?`, `seoDescription String?`, más el índice `@@index([tenantId, isPublishedOnStore])`.
- **Order:**
  - Canal y cliente: `channel OrderChannel @default(MANUAL)`, `customerEmail String?`, `customerDocument String?`, `shippingAddress Json?`.
  - Importes: `subtotalCents Int @default(0)`, `discountCents Int @default(0)`, `shippingCents Int @default(0)`, `couponCode String?`.
  - Idempotencia y acceso público: `checkoutKey String? @unique`, `publicToken String? @unique`.
  - Reserva de stock: `stockState String @default("none")`, `expiresAt DateTime?`.
- **Coupon / CouponRedemption:** se portan del catálogo con `tenantId` y `@@unique([tenantId, code])` en lugar de `code @unique`.
- **PaymentEvent / WebhookEvent:** se portan con `tenantId` para la auditoría y la idempotencia de webhooks.

---

## 5. Mapa de portado (catálogo → VendedorIA)

Todo se **reescribe** al estilo de VendedorIA: componentes formateados, Design System, class-validator e identificadores en inglés. Solo el copy visible queda en español. Nada se copia tal cual.

| Origen (`catalogo`) | Destino (`vendedoria`) | Nota |
| --- | --- | --- |
| `web/home.ts` (grilla, filtros, FAQ) | `apps/store/.../home.page.ts`, `catalog.page.ts` | Las FAQ vienen de `KnowledgeFaq` publicadas, la misma fuente que usa el agente |
| `web/product.ts`, `photo-view.ts`, `product-image.ts`, slider de relacionados | `apps/store/.../product.page.ts` + componentes DS | Variantes reales (`ProductVariant`) |
| `web/cart.service.ts`, `cart.ts` | `apps/store/.../cart` | `localStorage` con clave por tenant |
| `web/checkout.ts` | `apps/store/.../checkout.page.ts` | Brick + Yape con la `publicKey` del tenant |
| `web/order.ts` | `apps/store/.../order.page.ts` | Acceso por `publicToken` |
| `web/offers.ts` + `api/coupons.ts` | `apps/api/src/coupons/` | Motor puro + tests portados |
| `web/legal-content.ts`, `legal.ts` | `apps/store/.../legal/` | Parametrizado con los datos de `Storefront`; enlace de ReclamoFácil por tenant |
| `web/seo.ts` | `apps/store/.../seo.service.ts` | + JSON-LD `Product` y `Organization`, sitemap por tenant |
| `api/store.ts` (reserva de stock, expiración, correo) | `apps/api/src/orders/` + `storefront/` | Transacciones con bloqueo de stock y job de expiración |
| `api/shipping.ts` | `apps/api/src/storefront/shipping.ts` | Reglas desde `Storefront.shipping` |
| `api/payments.ts` | `apps/api/src/payments/mercadopago.provider.ts` | Orders API + firma, con credenciales por tenant |
| `docker/nginx/security-headers.conf` | cabeceras del servidor de `apps/store` | CSP construida por tenant |
| `web/admin.ts`, `api/admin.ts` | — | No se porta: la consola de VendedorIA lo reemplaza |
| `photo-frames.json` y contenido de la marca | — | Específico de esa tienda; pasa a datos del tenant cero |

---

## 6. Integración con el agente

1. `search_catalog` y `get_product_availability` devuelven también `productUrl` cuando la tienda está publicada. El agente comparte el enlace de la ficha en lugar de describir de memoria (regla `catalogOnlyFacts`).
2. El botón "Consultar por WhatsApp" de la web abre el chat con un texto prellenado y una referencia (`Ref: P-{handle}`). El runtime la detecta y carga ese producto en el contexto, con traza de tool visible para el operador.
3. Modo "pedir por WhatsApp": el carrito crea un `Order` en `DRAFT` con `channel = WEB` y abre WhatsApp con el resumen y el código del pedido. Al llegar el mensaje, el pedido se vincula a la conversación (`conversationId`) y el agente ofrece el link de pago.
4. Los pedidos pagados en la web aparecen en el inbox del contacto si hay una conversación con el mismo teléfono.
5. Fase 3 (opcional): canal `WEB_CHAT`, un widget en la tienda con el mismo vendedor IA. Se implementa como un adapter de canal nuevo, sin lógica paralela.

---

## 7. Consola del merchant (apps/web)

- Nueva sección **Tienda** (`/app/store`):
  - Checklist de publicación: nombre y logo, colores, datos legales (razón social, RUC, domicilio, correo), enlace de ReclamoFácil, envíos, cobro conectado y al menos un producto publicado.
  - Vista previa y botón **Publicar** / **Despublicar**.
  - Cada ítem del checklist dice qué falta y su impacto, en la línea del score del vendedor.
- **Productos:** interruptor "Visible en tienda", precio tachado, marca y campos SEO.
- **Pedidos:** filtro y badge por canal (Web / WhatsApp / Instagram), dirección de envío, cupón aplicado y estado de stock.
- **Cupones:** nueva pantalla, portada de la pestaña admin del catálogo y adaptada al Design System.
- **Integraciones:** conexión de Mercado Pago del merchant (flujo B) e IDs de píxeles.

Toda pieza visual nueva se agrega primero al Design System.

---

## 8. Legal (Perú)

- El centro legal se genera con los datos de `Storefront`. No se puede publicar sin razón social, RUC, domicilio, correo y enlace del Libro de Reclamaciones.
- Libro de Reclamaciones: durante el onboarding se pide al merchant que se registre en ReclamoFácil, cree su libro con los mismos datos y pegue el enlace público. No se construye un libro nativo.
- VendedorIA actúa como **encargado de tratamiento** de los datos de los compradores del merchant. Hay que redactar y aceptar un contrato de encargo y actualizar los términos del SaaS (skill `legal-digital-peru`).
- Banner de cookies con Consent Mode v2 cuando el tenant configura píxeles (skill `web-tracking-pixels`, incluido el fix del stub de `gtag`).

---

## 9. Infraestructura

- DNS comodín `*.<dominio-plataforma>` y certificado comodín vía DNS-01.
- Dominios propios (fase 3): Caddy con TLS bajo demanda y un endpoint `ask` que verifica que el hostname existe en `StoreDomain`, o Cloudflare for SaaS.
- Contenedores nuevos `store` (SSR) en el `docker-compose` de desarrollo y en el de producción, siguiendo el skill `docker-compose-dev-prod`.
- Caché: respuestas públicas de la API con `Cache-Control` corto y `stale-while-revalidate`, invalidadas al editar productos o la tienda.
- Imágenes: hoy `ProductMedia.url` es externa. Más adelante: subida a almacenamiento S3-compatible con redimensionado.

---

## 10. Planes y límites (flujo A)

Propuesta, a validar con el modelo de negocio:

| Plan | Tienda |
| --- | --- |
| FREE | Subdominio, marca "Hecho con VendedorIA", modo "pedir por WhatsApp" |
| STARTER | + checkout con Mercado Pago, cupones básicos |
| PRO | + dominio propio, píxeles, cupones avanzados, sin marca de plataforma |
| BUSINESS | + varios dominios, prioridad de soporte |

Se aplica en `plan-limits.service.ts`, como el resto de límites.

---

## 11. Fases

### Fase 0 — Preparación (S)
- Commit de los cambios pendientes del repositorio y rama `feature/storefront`.
- Decidir el dominio de plataforma (sección 13).
- Crear `packages/design-tokens` y `packages/contracts`.
- **Hecho cuando:** el build de api y web sigue verde y los paquetes compilan.

### Fase 1 — Tienda pública básica (M)
- Esquema `Storefront` y ampliación de `Product`; módulo `storefront` (resolve, tienda, productos, ficha).
- App `apps/store`: inicio, catálogo con filtros, ficha con variantes y galería, relacionados, 404 con estado HTTP, SEO, sitemap y `robots.txt` por tenant.
- Carrito y botón "Consultar por WhatsApp".
- Consola: sección Tienda (identidad, tema, publicar) e interruptor "Visible en tienda".
- **Hecho cuando:** dos tenants de prueba con productos distintos se sirven en `a.localhost` y `b.localhost` sin filtración de datos (test de aislamiento automatizado) y Lighthouse SEO ≥ 95.
- **Estado (2 oct 2026): implementada** en la rama `feature/storefront`. Diferencias con lo propuesto:
  - El tema se guarda en columnas (`brandColor`, `accentColor`) y no en `theme Json`; `shipping` y `tracking` pasan a la fase en que se usan.
  - Se añadió `POST /store/products/show-available` para hacer visibles en bloque los productos disponibles (los existentes nacen ocultos).
  - Vista previa de borradores con token HMAC de 1 h (`?preview=` → cookie httpOnly → cabecera `x-store-preview`), sin caché compartida.
  - El orden "Destacados" muestra primero los productos disponibles.
  - Pendiente de medir: Lighthouse SEO; los nombres de opción de variantes en la consola siguen siendo genéricos ("Opción"), por lo que la tienda muestra "Opción: M" en lugar de "Talla: M".

### Fase 2 — Comercio unificado (L)
- `MerchantPaymentAccount` con cifrado; refactor de `PaymentProviderPort` para credenciales por tenant (incluye los links del agente).
- Checkout web: Brick + Yape, reserva de stock, expiración, idempotencia, correo de confirmación y página de pedido.
- Cupones portados con tests; modo "pedir por WhatsApp" vinculado a la conversación.
- Herramientas del agente con `productUrl` y detección de `Ref: P-...`.
- Centro legal por tenant con requisitos para publicar.
- **Hecho cuando:** un pago de prueba del tenant A llega a la cuenta de prueba de A (nunca a la plataforma); el webhook firmado se procesa una sola vez; los tests de cupones e integración pasan; un pedido "por WhatsApp" aparece en el hilo del contacto.

### Fase 3 — Nivel profesional (L)
- Dominios propios con verificación y TLS; píxeles y consentimiento por tenant.
- Mercado Pago OAuth; canal `WEB_CHAT` opcional; subida de imágenes.
- Límites por plan aplicados.
- **Hecho cuando:** un dominio propio de prueba sirve la tienda con HTTPS; los eventos de GA4 llegan solo tras el consentimiento; los límites de plan se respetan en la API (no solo en la UI).

### Fase 4 — Migrar la tienda existente como tenant cero (M)
- Script de migración: productos del catálogo (`slug`, `content` JSON, stock, inventario) → `Product`, `ProductVariant` y `ProductMedia`, más cupones y configuración legal.
- Se ejecuta en paralelo con el catálogo actual; se cambia el DNS solo cuando hay paridad verificada (checkout real con un monto mínimo).
- **Hecho cuando:** la tienda funciona sobre VendedorIA con las mismas URLs (`/producto/:slug` mantiene la ruta o redirige con 301) y el catálogo antiguo queda en solo lectura.

---

## 12. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Cobros del comprador a la cuenta de la plataforma | Fase 2 bloquea el checkout sin `MerchantPaymentAccount` verificada; test explícito |
| Filtración entre tenants en endpoints públicos | El `tenantId` sale solo del host o slug resueltos en el servidor; tests de aislamiento en CI |
| Pérdida de foco (dos productos a la vez) | Fase 1 limitada a una tienda de lectura; el editor visual queda fuera de alcance |
| Divergencia de versiones (Nest 12 / Prisma 7 en el origen) | Se porta a las versiones de VendedorIA; la actualización va en una tarea aparte |
| Responsabilidad legal sobre datos de compradores | Contrato de encargo de tratamiento y términos SaaS actualizados antes de abrir el registro público |
| CSP y píxeles rompen el checkout | CSP por tenant generada desde una lista blanca por proveedor; verificación en red (skill `web-tracking-pixels`) |

---

## 13. Decisiones pendientes del dueño del producto

1. Dominio de plataforma para los subdominios de las tiendas.
2. Confirmar la app separada `apps/store` (recomendado) frente a rutas dentro de `apps/web`.
3. Credenciales manuales de Mercado Pago en la fase 2 y OAuth en la fase 3 (recomendado), u OAuth desde el inicio.
4. Validar la tabla de planes de la sección 10.
5. Qué tienda será el tenant cero y cuándo migrarla.
