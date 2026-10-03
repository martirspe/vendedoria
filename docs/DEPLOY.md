# Despliegue a producción (VPS + Docker)

Guía completa para poner VendedorIA en un VPS Ubuntu/Debian. Hay dos caminos con el mismo resultado:

- **Automático** (recomendado): `bash scripts/deploy.sh` hace todo en un comando.
- **Manual**: los mismos pasos uno por uno, para entender qué pasa, depurar o desplegar en un servidor con reglas propias.

Orden de trabajo: DNS en Cloudflare → preparar el VPS → clonar → `.env` → desplegar → servicios externos (Meta, Mercado Pago, Turnstile, AWS).

---

## Arquitectura

Un solo dominio (`STORE_BASE_DOMAIN`, p. ej. `marrso.com`):

| Dirección | Qué sirve |
|-----------|-----------|
| `marrso.com` | Web comercial de VendedorIA (`www` redirige aquí) |
| `app.marrso.com` (`CONSOLE_HOST`) | Consola de los negocios y la API (`/api/v1`) |
| `{slug}.marrso.com` | Tienda pública de cada negocio |

Entrar, crear cuenta y la consola existen solo en `app.marrso.com` (la sesión vive en el navegador de ese origen): en `marrso.com`, `/auth` y `/app` redirigen a la consola, y `app.marrso.com/` lleva a la web comercial.

```text
Internet :80/:443
  → nginx del servidor (Let's Encrypt, HSTS)       scripts/bootstrap-host.sh
      → 127.0.0.1:${WEB_PORT:-8082}
          → vendedoria-nginx (Docker)              docker/nginx/default.conf.template
              app.marrso.com      → /api/* → api:3000 · resto → web:4000 (consola)
              marrso.com          → web:4000 (web comercial)
              *.marrso.com        → store:4300 (tiendas, SSR por host)
          → postgres (red interna sin salida a internet)
```

Solo el nginx de Docker publica un puerto, y únicamente en `127.0.0.1`. El nginx del servidor termina HTTPS con **un único certificado comodín** (`marrso.com` + `*.marrso.com`, cubre también la consola) emitido por DNS-01 con un token de Cloudflare, y se renueva solo. Las cabeceras de seguridad y la CSP las pone el stack; el nginx del servidor solo añade HSTS.

Contenedores (`docker-compose.yml`, proyecto `vendedoria`):

| Servicio | Contenedor | Función |
|----------|------------|---------|
| `postgres` | `vendedoria-db` | PostgreSQL 16, volumen `vendedoria_pgdata` |
| `migrate` | `vendedoria-migrate` | `prisma migrate deploy` y termina; la API espera a que acabe bien |
| `api` | `vendedoria-api` | NestJS; fotos locales en el volumen `vendedoria_uploads` |
| `web` | `vendedoria-web` | Consola + web comercial (Angular SSR) |
| `store` | `vendedoria-store` | Tiendas públicas (Angular SSR) |
| `nginx` | `vendedoria-nginx` | Enrutado interno por host |

---

## Requisitos

| | Mínimo |
|--|--------|
| SO | Ubuntu 22.04 / 24.04 o Debian 12 |
| RAM | 2 GB + **2 GB de swap** (4 GB cómodo) |
| Disco | 20 GB SSD |
| Puertos | 22, 80 y 443 abiertos (ufw **y** firewall del panel del proveedor) |
| Software | Git, Docker 24+ y Compose v2 |
| DNS | Dominio gestionado en Cloudflare |

`bootstrap-host.sh` instala solo: nginx, certbot, `python3-certbot-dns-cloudflare` y ufw.

Límites de memoria por defecto (techos, no reservas): Postgres 512M, API 512M, consola 384M, tienda 512M, nginx 128M. Se cambian en `.env` con `POSTGRES_MEMORY_LIMIT`, `API_MEMORY_LIMIT`, `WEB_MEMORY_LIMIT`, `STORE_MEMORY_LIMIT` y `NGINX_MEMORY_LIMIT`.

Puede convivir con otras apps en el mismo VPS (gohabix, Selecta): cada una usa su propio `WEB_PORT` (gohabix 8080, Selecta 8081, VendedorIA 8082) y comparten el nginx del servidor.

---

## 1. Cloudflare (DNS y token)

1. En la zona del dominio → **DNS** → crea dos registros en modo **solo DNS (nube gris)**:

   | Tipo | Nombre | Contenido |
   |------|--------|-----------|
   | A | `@` | IP del VPS |
   | A | `*` | IP del VPS |

   El comodín cubre `app`, `www` y todas las tiendas. Con la nube naranja (proxy) Let's Encrypt y las tiendas no funcionan como se espera.

2. **Mi perfil → Tokens de API → Crear token** con la plantilla *Editar DNS de zona*: permiso `Zona · DNS · Editar`, recurso limitado a la zona del dominio. Copia el token: va en `CLOUDFLARE_API_TOKEN`.

Comprueba la propagación desde tu PC:

```bash
nslookup marrso.com
nslookup app.marrso.com
nslookup prueba.marrso.com
```

Los tres deben devolver la IP del VPS.

---

## 2. Preparar el VPS

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl ca-certificates openssl
```

### Swap (obligatorio con 2 GB de RAM)

Sin swap, el build de Angular muere con `SIGKILL`:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

### Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
```

Cierra la sesión SSH y vuelve a entrar. Estos dos comandos deben responder **sin** `sudo`:

```bash
docker --version
docker compose version
```

---

## 3. Clonar

```bash
sudo mkdir -p /opt/vendedoria
sudo chown "$USER:$USER" /opt/vendedoria
cd /opt/vendedoria
git clone https://github.com/martirspe/vendedoria.git .
git checkout <rama-de-producción>   # p. ej. main
```

---

## 4. `.env` de producción

```bash
cp .env.production.example .env
nano .env
```

Si lo preparaste en Windows (`.env.production`), súbelo con `scp .env.production usuario@vps:/opt/vendedoria/.env`. El deploy quita los `\r` y deja el archivo con permisos `600`. Nunca lo subas a git.

`docker-compose.yml` calcula a partir del dominio: `DATABASE_URL`, `CORS_ORIGIN`, `PUBLIC_API_BASE_URL` y `STOREFRONT_URL_TEMPLATE`. No las definas a mano.

| Variable | Obligatoria | Notas |
|----------|-------------|-------|
| `STORE_BASE_DOMAIN` | Sí | `marrso.com` (sin `https://`) |
| `CONSOLE_HOST` | Sí | `app.marrso.com`. Si cuelga del dominio, la etiqueta debe ser `app`, `admin`, `consola`, `console`, `dashboard` o `panel` (slugs reservados) |
| `CERTBOT_EMAIL` | Sí | Correo de avisos de Let's Encrypt (si falta, usa el de `EMAIL_FROM`) |
| `CLOUDFLARE_API_TOKEN` | Sí | Token del paso 1. Sin él, `marrso.com`, `www` y la consola obtienen HTTPS por HTTP-01, pero las tiendas quedan solo en HTTP |
| `WEB_PORT` | Sí | `8082`, único por app en el VPS |
| `POSTGRES_PASSWORD` | Auto | Se genera en el primer deploy. Solo letras, dígitos y `. _ ~ -`, mínimo 16 |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Auto | Se generan (≥ 32 caracteres) |
| `PAYMENT_CREDENTIALS_KEY` | Auto | Se genera. Cifra las credenciales de Mercado Pago de cada negocio: **no la cambies nunca** después de que alguien conecte su cuenta |
| `META_VERIFY_TOKEN` / `META_APP_SECRET` | Para WhatsApp | Sin `META_APP_SECRET` el webhook rechaza todos los mensajes |
| `PLATFORM_MERCADOPAGO_ACCESS_TOKEN` / `PLATFORM_MERCADOPAGO_WEBHOOK_SECRET` | Para cobrar planes | Cuenta de Mercado Pago de VendedorIA (las dos o ninguna) |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | Recomendado | Las dos o ninguna |
| `EMAIL_MODE` | — | `preview` no envía; `live` exige `EMAIL_FROM` (y SES configurado) |
| `MEDIA_STORAGE` | — | `local` (volumen) o `s3` (exige `MEDIA_S3_BUCKET` y `MEDIA_CDN_URL`) |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | Opcional | Sin clave, el vendedor responde con su lógica determinista |

Guarda una copia del `.env` final fuera del servidor (gestor de contraseñas). Perder `PAYMENT_CREDENTIALS_KEY` obliga a todos los negocios a reconectar Mercado Pago, y perder `POSTGRES_PASSWORD` deja la base inaccesible.

---

## 5. Despliegue automático

```bash
cd /opt/vendedoria
bash scripts/deploy.sh          # equivale a: npm run deploy
```

Qué hace, en orden:

1. Comprueba Docker, Compose, curl y `.env`; quita `\r` y aplica `chmod 600`.
2. Genera los secretos vacíos (`POSTGRES_PASSWORD`, JWT, `PAYMENT_CREDENTIALS_KEY`). Si la base ya existe y falta la contraseña o la clave de pagos, **se detiene** en lugar de crear unas nuevas que no servirían.
3. Valida el `.env` (dominios, longitudes, pares de claves, correo, S3) y `docker compose config`.
4. Si Postgres ya corre, hace backup de la base y del `.env` (`scripts/backup.sh --no-media`).
5. Genera el vhost del servidor en `docker/nginx/generated/vendedoria-host.conf`.
6. Construye las imágenes **una por una** (`migrate`, `api`, `web`, `store`) para no agotar la memoria.
7. Levanta el stack, recrea el nginx interno y espera el healthcheck de `/api/v1/health` (hasta 4 minutos).
8. Comprueba que una tienda inexistente responda 404 y que la web comercial responda 200.
9. Con `sudo`: instala nginx y certbot, abre 80/443 en ufw (sin tocar SSH), instala el vhost, pide el certificado comodín y recarga nginx.

Opciones:

| Opción | Efecto |
|--------|--------|
| `--pull` | `git pull --ff-only` antes de construir |
| `--skip-nginx` | Solo Docker; no toca nginx, firewall ni certificados del servidor |
| `--skip-tls` | nginx y firewall, sin pedir certificados |
| `--skip-backup` | Sin backup previo |

Al terminar, comprueba desde tu PC:

```bash
curl -I https://marrso.com/                 # 200, web comercial
curl -I https://www.marrso.com/             # 301 → https://marrso.com/
curl -I https://app.marrso.com/auth/login   # 200, consola
curl https://app.marrso.com/api/v1/health   # {"status":"ok",...}
curl -I https://no-existe.marrso.com/       # 404, tienda inexistente
```

Luego crea tu cuenta en `https://app.marrso.com/auth/register`.

---

## 6. Despliegue manual (paso a paso)

Los mismos pasos que hace `deploy.sh`, ejecutados a mano desde `/opt/vendedoria`. Útil si el script falla en algún punto o quieres controlar cada etapa.

### 6.1 Secretos del primer arranque

Solo si están vacíos en `.env` y **no** existe todavía la base (`docker volume ls | grep vendedoria_pgdata` no devuelve nada):

```bash
sed -i 's/\r$//' .env && chmod 600 .env
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" .env
sed -i "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=$(openssl rand -hex 48)|" .env
sed -i "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(openssl rand -hex 48)|" .env
sed -i "s|^PAYMENT_CREDENTIALS_KEY=.*|PAYMENT_CREDENTIALS_KEY=$(openssl rand -hex 32)|" .env
```

### 6.2 Validar la configuración

```bash
docker compose config --quiet && echo OK
```

No imprime valores; si falta una variable obligatoria, dice cuál.

### 6.3 Backup (si ya había una versión corriendo)

```bash
bash scripts/backup.sh --no-media
```

### 6.4 Construir y levantar el stack

```bash
for s in migrate api web store; do COMPOSE_PARALLEL_LIMIT=1 docker compose build "$s"; done
docker compose up -d --remove-orphans
docker compose up -d --no-deps --force-recreate nginx
docker compose ps
```

`migrate` debe aparecer como `exited (0)` y el resto como `healthy`. Comprueba en local:

```bash
curl -s -H "Host: app.marrso.com" http://127.0.0.1:8082/api/v1/health
curl -s -o /dev/null -w '%{http_code}\n' -H "Host: marrso.com" http://127.0.0.1:8082/            # 200
curl -s -o /dev/null -w '%{http_code}\n' -H "Host: no-existe.marrso.com" http://127.0.0.1:8082/  # 404
```

### 6.5 nginx del servidor

```bash
sudo apt-get install -y nginx certbot python3-certbot-dns-cloudflare
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo mkdir -p /var/www/letsencrypt
```

Si `ufw` está inactivo, no lo actives sin antes permitir SSH (`sudo ufw allow OpenSSH`).

Configuración TLS común a todas las apps del servidor (si ya existe, debe ser idéntica a la del repo):

```bash
sudo cp -n infra/nginx/host-ssl-global.conf /etc/nginx/conf.d/00-ssl-global.conf
diff infra/nginx/host-ssl-global.conf /etc/nginx/conf.d/00-ssl-global.conf && echo "SSL global OK"
```

Instala el vhost (primero solo HTTP, porque aún no hay certificado):

```bash
bash scripts/bootstrap-host.sh --generate-only
sudo cp docker/nginx/generated/vendedoria-host.conf /etc/nginx/sites-available/vendedoria
sudo ln -sf /etc/nginx/sites-available/vendedoria /etc/nginx/sites-enabled/vendedoria
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

### 6.6 Certificado comodín

Credenciales de Cloudflare para certbot (archivo solo legible por root):

```bash
sudo install -m 600 /dev/null /etc/letsencrypt/cloudflare-vendedoria.ini
sudo nano /etc/letsencrypt/cloudflare-vendedoria.ini
# contenido:  dns_cloudflare_api_token = <tu token>
```

```bash
sudo certbot certonly --dns-cloudflare \
  --dns-cloudflare-credentials /etc/letsencrypt/cloudflare-vendedoria.ini \
  --dns-cloudflare-propagation-seconds 30 \
  --non-interactive --agree-tos --email tu@correo.com \
  --cert-name vendedoria-stores -d marrso.com -d '*.marrso.com' \
  --deploy-hook "systemctl reload nginx"
```

Regenera el vhost, que ahora detecta el certificado y añade HTTPS (con `sudo` porque lee `/etc/letsencrypt`):

```bash
sudo bash scripts/bootstrap-host.sh --generate-only
sudo cp docker/nginx/generated/vendedoria-host.conf /etc/nginx/sites-available/vendedoria
sudo nginx -t && sudo systemctl reload nginx
```

Verifica la renovación automática:

```bash
sudo certbot renew --dry-run
systemctl list-timers | grep certbot
```

Con esto el sistema queda igual que tras `deploy.sh`. A partir de aquí puedes usar el script para las actualizaciones.

---

## 7. Servicios externos

### WhatsApp (Meta)

En la app de Meta → WhatsApp → Configuración → Webhook:

- URL: `https://app.marrso.com/api/v1/webhooks/meta/whatsapp`
- Token de verificación: el valor de `META_VERIFY_TOKEN`
- Suscríbete al campo `messages`.

`META_APP_SECRET` (secreto de la app, no el token de verificación) es obligatorio: el webhook valida la firma de cada mensaje. Cada negocio conecta su número desde **Canales** en la consola.

### Mercado Pago

- **Pedidos de las tiendas (flujo B):** cada negocio conecta su propia cuenta desde la consola. La URL de notificación (`/api/v1/webhooks/mercadopago/<negocio>`) la envía la API en cada pago: no hay que configurar nada en Mercado Pago.
- **Cobro de planes (flujo A):** con la cuenta de VendedorIA, en **Tus integraciones → Webhooks**, modo producción:
  - URL: `https://app.marrso.com/api/v1/webhooks/billing/mercadopago`
  - Evento: *Pagos*
  - Copia la clave secreta en `PLATFORM_MERCADOPAGO_WEBHOOK_SECRET` y el Access Token de producción en `PLATFORM_MERCADOPAGO_ACCESS_TOKEN`.

### Cloudflare Turnstile

Cloudflare → Turnstile → Añadir widget, modo **Managed**, hostname `marrso.com` (cubre la consola y todas las tiendas). Copia las claves en `TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY`. Se exige en entrar, crear cuenta y checkout de las tiendas.

### AWS (fotos en S3 + CloudFront, correos con SES)

Opcional pero recomendado. Pasos en README → «Fotos y correos en AWS» (plantilla `infra/aws/media-cdn.yaml`) y detalle en `.agents/skills/vendedoria-aws/`. Tras cambiar a `MEDIA_STORAGE=s3` no borres el volumen `uploads`: las fotos anteriores se siguen sirviendo desde ahí.

Después de cambiar cualquier variable:

```bash
docker compose up -d --force-recreate api
```

---

## 8. Actualizaciones

Automática:

```bash
cd /opt/vendedoria
bash scripts/deploy.sh --pull     # npm run deploy:pull
```

Manual:

```bash
cd /opt/vendedoria
bash scripts/backup.sh --no-media
git pull --ff-only
for s in migrate api web store; do COMPOSE_PARALLEL_LIMIT=1 docker compose build "$s"; done
docker compose up -d --remove-orphans
docker compose up -d --no-deps --force-recreate nginx
docker compose ps
```

Las migraciones de base de datos se aplican solas (servicio `migrate`) antes de que arranque la API. Si una migración falla, la API no arranca y la versión anterior de la base queda intacta: revisa `docker compose logs migrate`.

Si cambia `scripts/bootstrap-host.sh` (vhost del servidor), vuelve a ejecutar `sudo bash scripts/bootstrap-host.sh` (no pide certificados nuevos si ya existen).

### Volver a la versión anterior

Las migraciones no se deshacen solas. Para volver atrás:

```bash
git log --oneline -5
git checkout <commit-anterior>
bash scripts/restore-backup.sh backups/latest.tar.gz     # solo si la nueva versión migró la base
bash scripts/deploy.sh --skip-backup
```

---

## 9. Operación diaria

| Tarea | Comando |
|-------|---------|
| Estado | `docker compose ps` |
| Logs de todo | `npm run docker:logs:prod` |
| Logs de un servicio | `docker compose logs -f --tail 200 api` (o `web`, `store`, `nginx`, `migrate`) |
| Reiniciar sin reconstruir | `docker compose restart api` |
| Aplicar cambios del `.env` | `docker compose up -d --force-recreate api` |
| Parar todo (no borra datos) | `docker compose down` |
| Consola SQL | `docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'` |
| Migraciones a mano | `docker compose run --rm migrate` |
| Regenerar nginx del servidor | `sudo bash scripts/bootstrap-host.sh` |

**Nunca** ejecutes `docker compose down -v` en producción: borra la base y las fotos.

### Backups

```bash
bash scripts/backup.sh               # base + .env + fotos locales → backups/vendedoria-<fecha>.tar.gz
bash scripts/backup.sh --keep 14     # conserva los últimos 14
bash scripts/restore-backup.sh backups/latest.tar.gz          # pide escribir "restore"
bash scripts/restore-backup.sh backups/latest.tar.gz --skip-env   # sin sobrescribir el .env actual
```

El archivo contiene secretos (`chmod 600`). Las fotos ya subidas a S3 no se copian: quedan en el bucket. Backup diario con cron (`crontab -e`):

```cron
0 3 * * * cd /opt/vendedoria && bash scripts/backup.sh --keep 14 >> /var/log/vendedoria-backup.log 2>&1
```

Copia los backups fuera del VPS periódicamente (otro servidor, S3, tu PC): un backup en el mismo disco no protege si se pierde el servidor.

---

## 10. Problemas frecuentes

| Síntoma | Qué revisar |
|---------|-------------|
| `Docker not found` | Docker instalado y usuario en el grupo `docker` (cerrar y abrir SSH) |
| Build muere con `SIGKILL` | Falta swap (paso 2) |
| Health check agota el tiempo | `docker compose logs --tail 100 migrate api`: migración fallida, contraseña de Postgres distinta a la del volumen, variable inválida (la API valida el entorno al arrancar) |
| `POSTGRES_PASSWORD is empty but the volume … exists` | Restaura la contraseña original en `.env`; no generes una nueva |
| 502 en el navegador | `docker compose ps`: algún contenedor no está `healthy` |
| Certificado comodín falla | Token sin permiso `Zona · DNS · Editar` sobre ese dominio, o la zona no está en Cloudflare |
| Navegador avisa de certificado inválido en una tienda | No se emitió el comodín: revisa `CLOUDFLARE_API_TOKEN` y vuelve a ejecutar `sudo bash scripts/bootstrap-host.sh` |
| `https://marrso.com` muestra el certificado o la web de otro proyecto del VPS | No hay bloque 443 de VendedorIA y nginx usa el sitio HTTPS por defecto. `sudo bash scripts/bootstrap-host.sh` pide el certificado (HTTP-01 sin token, comodín con token) y añade los bloques 443 |
| `nginx -t` falla con *zone "SSL" is already defined* | Otra app define `ssl_session_cache` distinto: deja solo `/etc/nginx/conf.d/00-ssl-global.conf` |
| `marrso.com` o `app.marrso.com` no responden | Registros A en Cloudflare, nube gris, puertos 80/443 en ufw **y** en el panel del proveedor |
| La tienda dice que no existe | El slug no existe o la tienda no está publicada (desde la consola → Tienda) |
| WhatsApp no recibe mensajes | `META_APP_SECRET` vacío o incorrecto; URL y token del webhook en Meta |
| Los planes no se pueden comprar | Faltan `PLATFORM_MERCADOPAGO_*` (el deploy lo avisa) |
| No llegan correos de pedidos | `EMAIL_MODE=live`, `EMAIL_FROM` verificado en SES y cuenta fuera del sandbox |
| SSR `Host … is not allowed` | `CONSOLE_HOST` / `STORE_BASE_DOMAIN` mal escritos; recrea `web` y `store` |
