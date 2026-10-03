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
```

Contraseñas y secretos se generan solos en el primer deploy. Meta, Mercado Pago, Turnstile, AWS y OpenAI son opcionales: el `.env.production.example` explica cada uno.

## 3. Deploy

```bash
bash scripts/deploy.sh
```

Hace todo: secretos, validación, backup, build, arranque, nginx del VPS, firewall 80/443 y certificados HTTPS (se renuevan solos). Para el certificado de las tiendas reutiliza el token de Cloudflare que ya exista en el VPS (p. ej. el de Reclamo Fácil); si no hay ninguno con acceso a `marrso.com`, el deploy lo avisa y basta con añadir `CLOUDFLARE_API_TOKEN` al `.env` y repetir.

## 4. Día a día

```bash
bash scripts/deploy.sh --pull                       # actualizar
npm run docker:logs:prod                            # logs
bash scripts/backup.sh                              # backup (base, .env y fotos) → backups/
bash scripts/restore-backup.sh backups/latest.tar.gz
```

Webhooks a configurar fuera del VPS:

- Meta (WhatsApp): `https://app.marrso.com/api/v1/webhooks/meta/whatsapp` con `META_VERIFY_TOKEN`.
- Mercado Pago (cobro de planes): `https://app.marrso.com/api/v1/webhooks/billing/mercadopago`, evento Pagos.

## Si algo falla

| Síntoma | Qué hacer |
|---------|-----------|
| El build muere (`SIGKILL`) | Añade 2 GB de swap al VPS |
| Health check agota el tiempo | `docker compose logs --tail 100 migrate api` |
| HTTPS muestra otro sitio o certificado | DNS mal apuntado o con nube naranja; corrígelo y `sudo bash scripts/bootstrap-host.sh` |
| Las tiendas sin HTTPS | Falta token de Cloudflare con acceso al dominio (ver paso 3) |
