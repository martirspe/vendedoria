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
```

## Prerequisites

- Node.js 22+
- PostgreSQL 16+

## Setup

```bash
cp .env.example apps/api/.env
# edit DATABASE_URL and JWT secrets

npm install
npm run prisma:generate
npm run prisma:migrate -w @vendedoria/api
```

## Docker (desarrollo)

Requisito: Docker Desktop con Compose v2.

```bash
# Recomendado ahora: solo Postgres (imagen ya local) + API/web en el host
docker compose up db

# En otra terminal
npm install
npm run prisma:migrate -w @vendedoria/api
npm run dev:api
npm run dev:web
```

Stack completo en Docker (necesita poder bajar `node:22-alpine` de Docker Hub):

```bash
docker compose --profile full up --build
```

- Web: http://localhost:4200  
- API: http://localhost:3000/api/v1/health  
- Postgres: `localhost:5432` (`postgres` / `postgres` / db `vendedoria`)

### Si falla el pull (`TLS handshake timeout`)

Es un problema de red hacia `registry-1.docker.io`, no del Dockerfile.

1. Reintenta más tarde / cambia de red / desactiva VPN temporalmente  
2. Prueba el pull manual: `docker pull node:22-alpine`  
3. Mientras tanto usa `docker compose up db` + `npm run dev:*` en el host  

- Web: http://localhost:4200
- API: http://localhost:3000/api/v1/health
- Swagger: http://localhost:3000/docs
- Meta webhook: `GET/POST /api/v1/webhooks/meta/whatsapp`

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
