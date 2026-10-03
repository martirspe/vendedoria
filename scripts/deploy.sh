#!/usr/bin/env bash
# Despliega VendedorIA en un VPS (stack Docker Compose de producción), patrón gohabix.
#
# Uso:
#   bash scripts/deploy.sh                 # backup (si la DB está arriba) + build + arranque + host
#   bash scripts/deploy.sh --pull          # git pull --ff-only y luego deploy
#   bash scripts/deploy.sh --skip-nginx    # solo Docker (no toca nginx / firewall / certbot del host)
#   bash scripts/deploy.sh --skip-tls      # nginx del host + firewall, sin Let's Encrypt
#   bash scripts/deploy.sh --skip-backup   # sin backup de la base y .env antes de recrear
#
# Primer despliegue: genera POSTGRES_PASSWORD, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET y
# PAYMENT_CREDENTIALS_KEY si están vacíos (quedan en .env; inclúyelo en tus backups).
# Requiere Docker 24+ con Compose v2 y un .env copiado de .env.production.example.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose)
SKIP_NGINX=false
SKIP_TLS=false
SKIP_BACKUP=false
DO_PULL=false

log() { printf '\033[1;34m[deploy]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[deploy]\033[0m %s\n' "$*" >&2; }
warn() { printf '\033[1;33m[deploy]\033[0m %s\n' "$*"; }

for arg in "$@"; do
  case "$arg" in
    --pull) DO_PULL=true ;;
    --skip-nginx) SKIP_NGINX=true ;;
    --skip-tls) SKIP_TLS=true ;;
    --skip-backup) SKIP_BACKUP=true ;;
    -h|--help)
      echo "Usage: bash scripts/deploy.sh [--pull] [--skip-nginx] [--skip-tls] [--skip-backup]"
      exit 0
      ;;
    *)
      err "Unknown option: ${arg}"
      exit 1
      ;;
  esac
done

command -v docker >/dev/null 2>&1 || { err "Docker not found. See README → Producción."; exit 1; }
docker compose version >/dev/null 2>&1 || { err "Docker Compose v2 plugin not found."; exit 1; }
command -v curl >/dev/null 2>&1 || { err "curl not found (sudo apt-get install -y curl)."; exit 1; }
[[ -f .env ]] || { err "Missing .env — cp .env.production.example .env and fill it in."; exit 1; }

if [[ "$DO_PULL" == true ]]; then
  [[ -d .git ]] || { err "Not a git repository — cannot --pull."; exit 1; }
  log "Pulling latest from origin..."
  git pull --ff-only
fi

# .env edited on Windows: CRLF would end up inside the container values.
sed -i 's/\r$//' .env
chmod 600 .env

read_env() {
  grep -m1 "^$1=" .env 2>/dev/null | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' || true
}

set_env() {
  if grep -q "^$1=" .env; then
    sed -i "s|^$1=.*|$1=$2|" .env
  else
    printf '\n%s=%s\n' "$1" "$2" >>.env
  fi
}

random_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$1"
  else
    head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

# ---- First-boot secrets -----------------------------------------------------
DATA_EXISTS=false
if docker volume inspect vendedoria_pgdata >/dev/null 2>&1; then DATA_EXISTS=true; fi

if [[ -z "$(read_env POSTGRES_PASSWORD)" ]]; then
  if [[ "$DATA_EXISTS" == true ]]; then
    err "POSTGRES_PASSWORD is empty but the volume vendedoria_pgdata already exists."
    err "Restore the original password in .env (a new one would not open the existing database)."
    exit 1
  fi
  set_env POSTGRES_PASSWORD "$(random_hex 24)"
  log "Generated POSTGRES_PASSWORD."
fi

if [[ -z "$(read_env PAYMENT_CREDENTIALS_KEY)" ]]; then
  if [[ "$DATA_EXISTS" == true ]]; then
    err "PAYMENT_CREDENTIALS_KEY is empty but the database already exists."
    err "Restore the original key: a new one cannot decrypt the connected Mercado Pago accounts."
    exit 1
  fi
  set_env PAYMENT_CREDENTIALS_KEY "$(random_hex 32)"
  log "Generated PAYMENT_CREDENTIALS_KEY (never change it once stores connect Mercado Pago)."
fi

for key in JWT_ACCESS_SECRET JWT_REFRESH_SECRET; do
  if [[ -z "$(read_env "$key")" ]]; then
    set_env "$key" "$(random_hex 48)"
    log "Generated ${key}."
  fi
done

# ---- Validation ---------------------------------------------------------------
FAILED=false
fail() { err "$*"; FAILED=true; }

DOMAIN_RE='^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$'
CONSOLE_HOST="$(read_env CONSOLE_HOST)"
STORE_BASE_DOMAIN="$(read_env STORE_BASE_DOMAIN)"
WEB_PORT="$(read_env WEB_PORT)"
WEB_PORT="${WEB_PORT:-8082}"

[[ "$CONSOLE_HOST" =~ $DOMAIN_RE ]] || fail "CONSOLE_HOST must be a public domain without https:// (e.g. app.marrso.com)"
[[ "$STORE_BASE_DOMAIN" =~ $DOMAIN_RE ]] || fail "STORE_BASE_DOMAIN must be a public domain without https:// (e.g. marrso.com)"
[[ "$CONSOLE_HOST" != "$STORE_BASE_DOMAIN" ]] || fail "CONSOLE_HOST must be a subdomain such as app.${STORE_BASE_DOMAIN}"
if [[ "$CONSOLE_HOST" == *".${STORE_BASE_DOMAIN}" ]]; then
  # A store with that slug would be shadowed by the console; these labels are reserved slugs.
  case "${CONSOLE_HOST%".${STORE_BASE_DOMAIN}"}" in
    app|admin|consola|console|dashboard|panel) ;;
    *) fail "CONSOLE_HOST under ${STORE_BASE_DOMAIN} must be app, admin, consola, console, dashboard or panel" ;;
  esac
fi
[[ "$CONSOLE_HOST$STORE_BASE_DOMAIN" != *example* ]] || fail "CONSOLE_HOST / STORE_BASE_DOMAIN still use the example domain"
[[ "$WEB_PORT" =~ ^[0-9]+$ ]] || fail "WEB_PORT must be a number (unique per app on this VPS)"
length_of() { read_env "$1" | tr -d '\n' | wc -c; }
(( $(length_of POSTGRES_PASSWORD) >= 16 )) || fail "POSTGRES_PASSWORD must have at least 16 characters"
# docker-compose.yml puts it inside DATABASE_URL unescaped.
[[ "$(read_env POSTGRES_PASSWORD)" =~ ^[A-Za-z0-9._~-]+$ ]] || fail "POSTGRES_PASSWORD may only use letters, digits and . _ ~ -"
for key in JWT_ACCESS_SECRET JWT_REFRESH_SECRET; do
  (( $(length_of "$key") >= 32 )) || fail "${key} must have at least 32 characters"
done

pair() {
  local a b
  a="$(read_env "$1")"
  b="$(read_env "$2")"
  if [[ -n "$a" && -z "$b" || -z "$a" && -n "$b" ]]; then fail "Set both $1 and $2, or neither"; fi
  [[ -n "$a" ]]
}
pair TURNSTILE_SITE_KEY TURNSTILE_SECRET_KEY || warn "Turnstile not configured: login, sign-up and checkout rely on IP rate limits only."
pair PLATFORM_MERCADOPAGO_ACCESS_TOKEN PLATFORM_MERCADOPAGO_WEBHOOK_SECRET || warn "Plan checkout disabled (no PLATFORM_MERCADOPAGO_*)."

if [[ "$(read_env EMAIL_MODE)" == "live" ]]; then
  [[ -n "$(read_env EMAIL_FROM)" ]] || fail "EMAIL_MODE=live requires EMAIL_FROM"
  if [[ "$(read_env EMAIL_PROVIDER)" == "resend" ]]; then
    [[ -n "$(read_env RESEND_API_KEY)" ]] || fail "EMAIL_PROVIDER=resend requires RESEND_API_KEY"
  fi
else
  warn "EMAIL_MODE is not live: order emails are not sent."
fi

if [[ "$(read_env MEDIA_STORAGE)" == "s3" ]]; then
  [[ -n "$(read_env MEDIA_S3_BUCKET)" ]] || fail "MEDIA_STORAGE=s3 requires MEDIA_S3_BUCKET"
  [[ -n "$(read_env MEDIA_CDN_URL)" ]] || fail "MEDIA_STORAGE=s3 requires MEDIA_CDN_URL (CloudFront)"
fi

[[ -n "$(read_env META_APP_SECRET)" ]] || warn "META_APP_SECRET empty: the WhatsApp webhook rejects every incoming message."

# Stores need the wildcard certificate, issued by DNS-01 through Cloudflare.
if [[ "$SKIP_NGINX" == false && "$SKIP_TLS" == false ]]; then
  CF_TOKEN="$(read_env CLOUDFLARE_API_TOKEN)"
  if [[ -z "$CF_TOKEN" ]]; then
    fail "CLOUDFLARE_API_TOKEN is required: Cloudflare → My Profile → API Tokens → 'Edit zone DNS' on ${STORE_BASE_DOMAIN}"
  elif ! curl -fsS -m 15 -H "Authorization: Bearer ${CF_TOKEN}" \
      "https://api.cloudflare.com/client/v4/zones?name=${STORE_BASE_DOMAIN}" 2>/dev/null \
      | grep -q "\"name\":\"${STORE_BASE_DOMAIN}\""; then
    fail "CLOUDFLARE_API_TOKEN cannot access the ${STORE_BASE_DOMAIN} zone (needs Zone · DNS · Edit on it)"
  fi
  unset CF_TOKEN
fi
[[ -n "$(read_env CERTBOT_EMAIL)$(read_env EMAIL_FROM)" ]] || warn "CERTBOT_EMAIL empty: HTTPS certificates will not be requested."
[[ "$FAILED" == false ]] || { err "Fix .env and run the deploy again."; exit 1; }

"${COMPOSE[@]}" config --quiet

# ---- Backup -----------------------------------------------------------------
if [[ "$SKIP_BACKUP" == true ]]; then
  log "Skipped pre-deploy backup (--skip-backup)."
elif "${COMPOSE[@]}" ps --status running --services 2>/dev/null | grep -qx postgres; then
  log "Creating pre-deploy backup (database + .env)..."
  if ! bash "${ROOT}/scripts/backup.sh" --no-media; then
    err "Pre-deploy backup failed. Aborting. Re-run with --skip-backup only if intended."
    exit 1
  fi
else
  warn "Postgres not running — skipping pre-deploy backup (first boot OK)."
fi

log "Generating host nginx config..."
bash "${ROOT}/scripts/bootstrap-host.sh" --generate-only

# ---- Build & start ------------------------------------------------------------
log "Building images one at a time (parallel Angular builds OOM on 2 GB VPS)..."
for service in migrate api web store; do
  COMPOSE_PARALLEL_LIMIT=1 "${COMPOSE[@]}" build "$service"
done

log "Starting stack..."
"${COMPOSE[@]}" up -d --remove-orphans
# The internal nginx renders its template at start: recreate it so config changes apply.
"${COMPOSE[@]}" up -d --no-deps --force-recreate nginx

log "Waiting for health (http://127.0.0.1:${WEB_PORT}/api/v1/health)..."
HEALTH_OK=false
for _ in $(seq 1 120); do
  if curl -sf -H "Host: ${CONSOLE_HOST}" "http://127.0.0.1:${WEB_PORT}/api/v1/health" >/dev/null 2>&1; then
    HEALTH_OK=true
    break
  fi
  sleep 2
done

if [[ "$HEALTH_OK" != true ]]; then
  err "Health check timed out. Inspect: docker compose ps && docker compose logs --tail 100 migrate api store nginx"
  exit 1
fi
log "Health check OK."

STORE_STATUS="$(curl -s -o /dev/null -w '%{http_code}' -H "Host: deploy-check.${STORE_BASE_DOMAIN}" "http://127.0.0.1:${WEB_PORT}/" || true)"
if [[ "$STORE_STATUS" == "404" ]]; then
  log "Store server OK (unknown store answers 404)."
else
  warn "Store server answered ${STORE_STATUS} for an unknown store (expected 404): docker compose logs store"
fi

SITE_STATUS="$(curl -s -o /dev/null -w '%{http_code}' -H "Host: ${STORE_BASE_DOMAIN}" "http://127.0.0.1:${WEB_PORT}/" || true)"
if [[ "$SITE_STATUS" == "200" ]]; then
  log "Marketing site OK (${STORE_BASE_DOMAIN})."
else
  warn "Marketing site answered ${SITE_STATUS} for ${STORE_BASE_DOMAIN} (expected 200): docker compose logs web nginx"
fi

"${COMPOSE[@]}" ps
docker image prune -f >/dev/null 2>&1 || true

if [[ "$SKIP_NGINX" == true ]]; then
  log "Skipped host bootstrap (--skip-nginx). Generated config: docker/nginx/generated/"
  exit 0
fi

BOOT_ARGS=()
[[ "$SKIP_TLS" == true ]] && BOOT_ARGS+=(--skip-tls)
log "Bootstrapping host (nginx, firewall 80/443, Let's Encrypt)..."
if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
  bash "${ROOT}/scripts/bootstrap-host.sh" "${BOOT_ARGS[@]}"
elif command -v sudo >/dev/null 2>&1 && sudo bash "${ROOT}/scripts/bootstrap-host.sh" "${BOOT_ARGS[@]}"; then
  :
else
  warn "Host bootstrap failed or sudo is unavailable: the public domains will not respond."
  warn "Fix with: sudo bash scripts/bootstrap-host.sh"
  exit 1
fi
