# VendedorIA

Premium AI Sales Agents SaaS — WhatsApp/Instagram sales agents from greeting to payment.

Authority document: [`Project constitution for VendedorIA.md`](./Project%20constitution%20for%20VendedorIA.md)

## Stack

- **Web:** Angular 22 (standalone, signals, zoneless, SSR) + Design System tokens
- **API:** NestJS 11 + Fastify + Prisma + PostgreSQL + JWT/refresh
- **Payments (next):** Mercado Pago via payment provider port

## Structure

```
apps/api     NestJS API (`/api/v1`, Swagger at `/docs`)
apps/web     Angular console + marketing
apps/store   Tienda pública por tenant (SSR, `{slug}.dominio`)
packages/*   Design system, tokens y contratos compartidos
```

## Desarrollo (todo en Docker)

Requisito: Docker Desktop con Compose v2. No hace falta Node ni Postgres en el host.

```bash
npm run dev            # crea apps/api/.env si falta y levanta todo con recarga en caliente
npm run docker:logs    # logs de api, web y store
npm run docker:ps
npm run docker:down
npm run test:docker    # tests unitarios + e2e en una base aislada vendedoria_test
```

| Servicio | URL |
|----------|-----|
| Consola | http://localhost:4201 |
| API | http://localhost:3100/api/v1/health · Swagger http://localhost:3100/docs |
| Tiendas | http://{slug}.localhost:4300 |
| Postgres | `localhost:5432` (`postgres` / `postgres` / db `vendedoria`) |

- Los puertos no chocan con selecta (3000/4200/5433): ambos stacks pueden correr a la vez.
- Guardar un archivo recarga la API (Nest watch), la consola y la tienda (`ng serve` con sondeo).
- Cambios en dependencias (`package.json`): `npm run dev` de nuevo (el servicio `deps` ejecuta `npm ci`).
- Migraciones nuevas: `docker compose -f docker-compose.dev.yml exec api npx prisma migrate dev --name <nombre>`.
- Una sola vez, tras migrar del stack anterior: `npm run docker:clean-legacy` (conserva la base).
- Meta webhook: `GET/POST /api/v1/webhooks/meta/whatsapp`

## Producción (Docker)

```bash
cp .env.production.example .env   # completar dominios, POSTGRES_PASSWORD y secretos
npm run docker:up:prod            # migrate → api → web + store → nginx en 127.0.0.1:${WEB_PORT}
```

El nginx interno enruta `CONSOLE_HOST` a la consola y `/api/`, y `*.STORE_BASE_DOMAIN` a la tienda.
El nginx del servidor termina HTTPS (incluido el certificado comodín de las tiendas) y reenvía a `127.0.0.1:${WEB_PORT}`.

### Local WhatsApp slice smoke test

1. Register/login in the web app
2. Open **Vendedor** → completa personalidad, welcome y handoff (mira el score 0–200)
3. Open **Canales** → save Phone Number ID + access token (or placeholders for local sim)
4. Use **Simular mensaje entrante**
5. Open **Mensajes** → Crear pedido → genera link de pago
6. Open **Pedidos** → Simular pago (mock) o webhook Mercado Pago

## Build

```bash
npm run build
```
