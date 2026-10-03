# Despliegue en producción

```text
Internet :80/:443
  → nginx del VPS (HTTPS automático)    ← scripts/bootstrap-host.sh
  → 127.0.0.1:8082 (nginx Docker)
  → web comercial (marrso.com) · consola + API (app.marrso.com) · tiendas ({slug}.marrso.com)
```

DNS en Cloudflare, solo DNS (nube gris): `A @` y `A *` → IP del VPS.

## 1. Código

```bash
sudo mkdir -p /opt/vendedoria && sudo chown "$USER":"$USER" /opt/vendedoria
cd /opt/vendedoria
git clone https://github.com/martirspe/vendedoria.git .
```

## 2. `.env`

```bash
cp .env.production.example .env
nano .env
```

Mínimo:

```env
STORE_BASE_DOMAIN=marrso.com
CONSOLE_HOST=app.marrso.com
CERTBOT_EMAIL=tu@correo.com
CLOUDFLARE_API_TOKEN=...   # Cloudflare → Mi perfil → Tokens de API → "Editar DNS de zona" → marrso.com
```

Contraseñas y secretos se generan solos en el primer deploy. Meta, Mercado Pago, Turnstile, AWS y OpenAI son opcionales: el `.env.production.example` explica cada uno. Las fotos en S3/CloudFront y los correos con SES se crean con Terraform: [TERRAFORM.md](TERRAFORM.md).

## 3. Deploy

```bash
bash scripts/deploy.sh
```

Hace todo: secretos, validación (incluido el token de Cloudflare), backup, build, arranque, nginx del VPS, firewall 80/443 y un certificado HTTPS comodín (`marrso.com` + `*.marrso.com`) que se renueva solo.

## 4. Día a día

```bash
bash scripts/deploy.sh --pull                       # actualizar
npm run docker:logs:prod                            # logs
bash scripts/backup.sh                              # backup (base, .env y fotos) → backups/
bash scripts/restore-backup.sh backups/latest.tar.gz
```

Operadores de VendedorIA (superadmin y admin de la plataforma). Es la única forma de dar ese rol: el registro público no puede. Usa el modo interactivo para que la contraseña no quede en el historial:

```bash
docker compose exec api npm run create-admin                                   # interactivo
docker compose exec api npm run create-admin -- --role=ADMIN --email=ops@marrso.com
docker compose exec api npm run create-admin -- --revoke --email=ops@marrso.com
docker compose exec api npm run create-admin -- --help
```

Crea un SUPERADMIN después del primer deploy. No se puede quitar el rol al último SUPERADMIN, y cada cambio queda registrado en `PlatformAuditLog`.

Webhooks a configurar fuera del VPS:

- Meta (WhatsApp): `https://app.marrso.com/api/v1/webhooks/meta/whatsapp` con `META_VERIFY_TOKEN`.
- Mercado Pago (cobro de planes): `https://app.marrso.com/api/v1/webhooks/billing/mercadopago`, evento Pagos.
- Meta (Instagram): en la app de Meta, producto Instagram → Webhooks, URL `https://app.marrso.com/api/v1/webhooks/meta/instagram` con `META_VERIFY_TOKEN`, campo `messages`. Firma con `INSTAGRAM_APP_SECRET` (si falta, usa `META_APP_SECRET`).

### Dominios propios de las tiendas (opcional)

Sin esto la integración «Dominio propio» aparece como «Próximamente» en producción.

1. Cloudflare → `marrso.com` → SSL/TLS → Custom Hostnames: activa Cloudflare for SaaS.
2. Crea `A customers` → IP del VPS **con nube naranja** y ponlo como Fallback Origin. Modo SSL de la zona: **Full** (el VPS responde con su certificado comodín).
3. En `.env`: `CLOUDFLARE_SAAS_ZONE_ID` (ID de zona), `CLOUDFLARE_SAAS_API_TOKEN` (token con `SSL and Certificates · Edit` sobre la zona) y `CUSTOM_DOMAIN_CNAME_TARGET=customers.marrso.com`.
4. `bash scripts/deploy.sh`: el nginx del VPS pasa a aceptar cualquier dominio y lo envía a la tienda, que solo responde a dominios verificados.
5. Turnstile: añade el dominio de cada tienda a los hostnames del widget (máximo 10 en el plan gratuito de Turnstile) o el checkout en ese dominio fallará la verificación.

### Cargar el catálogo de una tienda real

No uses los scripts `apps/api/scripts/seed-*.mjs` en producción: copian fotos al disco del contenedor y se saltan el límite del plan.

1. Crea el negocio desde el registro normal y deja el plan con cupo suficiente (por ejemplo, Crece para hasta 100 productos).
2. En la consola: Productos → Importar catálogo, arrastra la carpeta del paquete (`catalog.json` + `images/`; Selecta está en `apps/api/seed-data/selecta`).
3. Revisa la vista previa (creados, actualizados, sin publicar, avisos), marca «Aplicar los ajustes de tienda del paquete» si quieres plantilla y envíos, e importa. Las fotos se suben a S3 y nada se guarda si falla.

Para volver a importar cuando cambie el catálogo, usa la misma carpeta: solo se suben las fotos nuevas y se respetan el precio, el stock y la publicación cambiados en la consola, salvo que elijas actualizarlos.

### Reiniciar la base de datos

Solo si la base aún no tiene negocios reales (por ejemplo, tras unificar las migraciones en `0001_init`). Borra todos los datos; las fotos y el `.env` se conservan.

```bash
bash scripts/backup.sh                                   # por si acaso
git pull
docker compose stop api web store
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'
bash scripts/deploy.sh                                   # aplica 0001_init desde cero
docker compose exec api npm run create-admin             # vuelve a crear tu operador
```

## Si algo falla

| Síntoma | Qué hacer |
|---------|-----------|
| El build muere (`SIGKILL`) | Añade 2 GB de swap al VPS |
| Health check agota el tiempo | `docker compose logs --tail 100 migrate api` |
| HTTPS muestra otro sitio o certificado | DNS mal apuntado o con nube naranja; corrígelo y `sudo bash scripts/bootstrap-host.sh` |
| `CLOUDFLARE_API_TOKEN cannot access the … zone` | El token no tiene permiso `Zona · DNS · Editar` sobre `marrso.com`; edítalo en Cloudflare |
