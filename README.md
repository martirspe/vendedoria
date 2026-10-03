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
- Meta webhook: `GET/POST /api/v1/webhooks/meta/whatsapp`

## Producción (Docker)

Guía completa paso a paso (automática y manual, servicios externos, actualizaciones, backups y problemas frecuentes): [`docs/DEPLOY.md`](./docs/DEPLOY.md). Resumen:

VPS Ubuntu/Debian con Docker 24+ y Compose v2, mismo patrón que gohabix (puede convivir en el mismo servidor):

```text
Internet :80/:443 → nginx del servidor (Let's Encrypt, HSTS)
  → 127.0.0.1:${WEB_PORT} → vendedoria-nginx → api / web (CONSOLE_HOST) · store (*.STORE_BASE_DOMAIN)
```

Como Reclamo Fácil, un solo dominio (`STORE_BASE_DOMAIN`, p. ej. `marrso.com`): web comercial en `marrso.com` (`www` redirige), tiendas en `{slug}.marrso.com` y consola en `app.marrso.com`. Entrar y crear cuenta viven solo en la consola: en el dominio raíz `/auth` y `/app` redirigen a ella, y la raíz de la consola lleva a la web comercial.

1. Cloudflare (solo DNS, nube gris): `A @` y `A *` → IP del VPS, y un token de API con Zone · DNS · Edit sobre el dominio (`CLOUDFLARE_API_TOKEN`).
2. Desplegar:

```bash
git clone <repo> vendedoria && cd vendedoria
cp .env.production.example .env   # dominio, CERTBOT_EMAIL, CLOUDFLARE_API_TOKEN, Meta, Mercado Pago…
bash scripts/deploy.sh            # npm run deploy
```

`deploy.sh` genera en el primer arranque `POSTGRES_PASSWORD`, los secretos JWT y `PAYMENT_CREDENTIALS_KEY`; valida el `.env`; hace backup de la base si ya existe; construye las imágenes una por una (evita quedarse sin memoria en un VPS de 2 GB); levanta el stack y espera el healthcheck; y con sudo instala el nginx del servidor, abre ufw 80/443 (sin tocar SSH) y pide un único certificado comodín (dominio + `*.dominio`, incluye la consola) por DNS-01 con renovación automática. Opciones: `--pull`, `--skip-nginx`, `--skip-tls`, `--skip-backup`.

- `WEB_PORT` es único por app en el VPS (gohabix 8080, Selecta 8081, VendedorIA 8082). `/etc/nginx/conf.d/00-ssl-global.conf` es común a todas: si el del servidor difiere de `infra/nginx/host-ssl-global.conf`, el script se detiene sin recargar nginx.
- Actualizar: `bash scripts/deploy.sh --pull`. Logs: `npm run docker:logs:prod`.
- Backups: `bash scripts/backup.sh` (base, `.env` y fotos del volumen `uploads`; queda en `backups/`, contiene secretos). Restaurar: `bash scripts/restore-backup.sh backups/latest.tar.gz`.
- No se despliega al hacer push: el deploy se ejecuta en el VPS.

El nginx interno enruta `CONSOLE_HOST` a la consola y `/api/`, `STORE_BASE_DOMAIN` a la web comercial y `*.STORE_BASE_DOMAIN` a la tienda; las cabeceras de seguridad y la CSP salen del stack, el nginx del servidor solo termina HTTPS y añade HSTS.

Fotos y correos en AWS (opcional, recomendado en producción):

- `MEDIA_STORAGE=s3` + `MEDIA_S3_BUCKET` + `MEDIA_CDN_URL`: bucket privado (Block Public Access) servido por CloudFront con Origin Access Control. `MEDIA_CDN_URL` es el dominio de CloudFront (o su alias), nunca el endpoint de S3. El bucket, la distribución, la política del bucket y la política IAM de la API se crean con la plantilla `infra/aws/media-cdn.yaml`:

  ```bash
  aws cloudformation deploy --stack-name vendedoria-media-prod --template-file infra/aws/media-cdn.yaml \
    --capabilities CAPABILITY_NAMED_IAM --parameter-overrides Environment=prod AppUserName=vendedoria-prod-api
  aws cloudformation describe-stacks --stack-name vendedoria-media-prod --query "Stacks[0].Outputs"
  ```

  Las salidas `MediaBucketName`, `BucketRegion` y `MediaCdnUrl` van a `MEDIA_S3_BUCKET`, `AWS_REGION` y `MEDIA_CDN_URL`. Para un dominio propio agrega `AliasDomain` y `AcmCertificateArn` (certificado en us-east-1).
- `EMAIL_MODE=live` + `EMAIL_PROVIDER=ses` + `EMAIL_FROM`: dominio verificado en SES con DKIM, SPF y DMARC, fuera del sandbox.
- `AWS_REGION` y credenciales de un usuario IAM con permisos mínimos (o rol de instancia). Paso a paso, políticas IAM y checklist: `.agents/skills/vendedoria-aws/`.

Protección contra bots (recomendado en producción): crea un widget de Cloudflare Turnstile en modo **Managed** con los hostnames `CONSOLE_HOST` y `STORE_BASE_DOMAIN` (cubre todas las tiendas) y define `TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY`. Se exige en entrar, crear cuenta y checkout de las tiendas; sin las claves esos formularios solo tienen el límite de intentos por IP. Para probar en local usa las claves de prueba comentadas en `.env.example`.

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
