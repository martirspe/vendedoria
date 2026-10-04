# VendedorIA

Premium AI Sales Agents SaaS — WhatsApp/Instagram sales agents from greeting to payment.

Authority document: [`PROJECT CONSTITUTION.md`](./PROJECT%20CONSTITUTION.md) · Agent instructions: [`AGENTS.md`](./AGENTS.md)

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
- Usa siempre `localhost`: los puertos solo escuchan en loopback y, en desarrollo, `http://127.0.0.1:*` (enlaces de Docker Desktop) redirige a `http://localhost:*` con la misma ruta.
- Guardar un archivo recarga la API (Nest watch), la consola y la tienda (`ng serve` con sondeo).
- Cambios en dependencias (`package.json`): `npm run dev` de nuevo (el servicio `deps` ejecuta `npm ci`).
- Migraciones nuevas: `docker compose -f docker-compose.dev.yml exec api npx prisma migrate dev --name <nombre>`.
- Una sola vez, tras migrar del stack anterior: `npm run docker:clean-legacy` (conserva la base).
- Operadores de la plataforma (SUPERADMIN / ADMIN): `docker compose -f docker-compose.dev.yml exec api npm run create-admin` (interactivo; `-- --help` muestra las opciones). Entran por `POST /api/v1/platform/auth/login`, con una sesión separada de la de los negocios. Alta de todos los tipos de usuario: [`docs/USUARIOS.md`](./docs/USUARIOS.md).
- Meta webhook: `GET/POST /api/v1/webhooks/meta/whatsapp`

## Producción (Docker)

Un comando en el VPS, igual que Reclamo Fácil y gohabix: [`docs/DEPLOY.md`](./docs/DEPLOY.md).

```bash
cp .env.production.example .env   # dominio, CERTBOT_EMAIL y CLOUDFLARE_API_TOKEN
bash scripts/deploy.sh            # actualizar: bash scripts/deploy.sh --pull
```

Web comercial en `marrso.com`, consola en `app.marrso.com` y tiendas en `{slug}.marrso.com`. Fotos en S3/CloudFront y correos con SES (opcional): infraestructura en Terraform (`infra/terraform/`), guía paso a paso en [docs/TERRAFORM.md](docs/TERRAFORM.md).

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
