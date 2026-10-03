#!/usr/bin/env bash
# Prepara el VPS (Ubuntu/Debian) para exponer VendedorIA en Internet.
#
# Genera el vhost nginx del servidor → 127.0.0.1:WEB_PORT para la consola (CONSOLE_HOST)
# y las tiendas (*.STORE_BASE_DOMAIN). Con root/sudo también instala nginx + Certbot,
# abre ufw 80/443, instala el vhost y obtiene los certificados (como Reclamo Fácil):
#   - comodín STORE_BASE_DOMAIN + *.STORE_BASE_DOMAIN por DNS-01 con CLOUDFLARE_API_TOKEN
#     (Zone · DNS · Edit). Cubre también la consola si es app.STORE_BASE_DOMAIN.
#   - consola en otro dominio: Let's Encrypt HTTP-01.
#   STORE_BASE_DOMAIN sirve la web comercial; www.STORE_BASE_DOMAIN redirige a ella.
#
# Uso:
#   bash scripts/bootstrap-host.sh --generate-only   # solo escribe docker/nginx/generated/…
#   sudo bash scripts/bootstrap-host.sh              # paquetes + ufw 80/443 + vhost + TLS
#   sudo bash scripts/bootstrap-host.sh --skip-tls
#   sudo bash scripts/bootstrap-host.sh --skip-firewall
#
# Comparte /etc/nginx/conf.d/00-ssl-global.conf con las demás apps del VPS (gohabix, Selecta):
# si difiere de infra/nginx/host-ssl-global.conf, aborta antes de recargar nginx.
# No toca el puerto 22 (SSH) ni activa ufw si está inactivo.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DO_TLS=true
DO_FIREWALL=true
GENERATE_ONLY=false

log() { printf '\033[1;34m[bootstrap-host]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[bootstrap-host]\033[0m %s\n' "$*" >&2; }
err() { printf '\033[1;31m[bootstrap-host]\033[0m %s\n' "$*" >&2; }

for arg in "$@"; do
  case "$arg" in
    --generate-only) GENERATE_ONLY=true ;;
    --tls) DO_TLS=true ;;
    --skip-tls) DO_TLS=false ;;
    --skip-firewall) DO_FIREWALL=false ;;
    -h|--help)
      echo "Usage: bash scripts/bootstrap-host.sh [--generate-only]"
      echo "       sudo bash scripts/bootstrap-host.sh [--tls|--skip-tls] [--skip-firewall]"
      exit 0
      ;;
    *)
      err "Unknown option: ${arg}"
      exit 1
      ;;
  esac
done

if [[ ! -f .env ]]; then
  err "Missing .env in ${ROOT}"
  exit 1
fi

read_env() {
  grep -m1 "^$1=" .env 2>/dev/null | cut -d= -f2- | tr -d '\r"' | xargs || true
}

SITE_NAME="$(read_env NGINX_SITE_NAME)"
SITE_NAME="${SITE_NAME:-vendedoria}"
WEB_PORT="$(read_env WEB_PORT)"
WEB_PORT="${WEB_PORT:-8082}"
CONSOLE_HOST="$(read_env CONSOLE_HOST)"
STORE_BASE_DOMAIN="$(read_env STORE_BASE_DOMAIN)"
CLOUDFLARE_API_TOKEN="$(read_env CLOUDFLARE_API_TOKEN)"

DOMAIN_RE='^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$'
for pair in "CONSOLE_HOST=${CONSOLE_HOST}" "STORE_BASE_DOMAIN=${STORE_BASE_DOMAIN}"; do
  if [[ ! "${pair#*=}" =~ $DOMAIN_RE ]]; then
    err "${pair%%=*} must be a public domain without https:// in .env (e.g. app.vendedoria.pe)"
    exit 1
  fi
done

GENERATED_DIR="${ROOT}/docker/nginx/generated"
OUTPUT_FILE="${GENERATED_DIR}/${SITE_NAME}-host.conf"
SITES_AVAILABLE="/etc/nginx/sites-available/${SITE_NAME}"
SITES_ENABLED="/etc/nginx/sites-enabled/${SITE_NAME}"
SSL_GLOBAL_CANONICAL="${ROOT}/infra/nginx/host-ssl-global.conf"
SSL_GLOBAL_DEST="/etc/nginx/conf.d/00-ssl-global.conf"
UPSTREAM="${SITE_NAME//-/_}_docker"

STORE_CERT_NAME="${SITE_NAME}-stores"
CF_INI="/etc/letsencrypt/cloudflare-${SITE_NAME}.ini"
# app.marrso.com under marrso.com: the wildcard certificate already covers the console.
CONSOLE_IN_WILDCARD=false
CONSOLE_CERT_NAME="${CONSOLE_HOST}"
if [[ "$CONSOLE_HOST" == *".${STORE_BASE_DOMAIN}" && "${CONSOLE_HOST%".${STORE_BASE_DOMAIN}"}" != *.* ]]; then
  CONSOLE_IN_WILDCARD=true
  CONSOLE_CERT_NAME="${STORE_CERT_NAME}"
fi
cert_dir() { printf '/etc/letsencrypt/live/%s' "$1"; }
has_cert() { [[ -f "$(cert_dir "$1")/fullchain.pem" && -f "$(cert_dir "$1")/privkey.pem" ]]; }

# `http2 on` needs nginx >= 1.25.1; older versions take the flag on `listen`.
HTTP2_DIRECTIVE="    http2 on;"
LISTEN_HTTP2=""
if command -v nginx >/dev/null 2>&1; then
  NGINX_VERSION="$(nginx -v 2>&1 | sed -n 's|.*nginx/\([0-9.]*\).*|\1|p')"
  if [[ -n "$NGINX_VERSION" ]] && [[ "$(printf '%s\n1.25.1\n' "$NGINX_VERSION" | sort -V | head -1)" != "1.25.1" ]]; then
    HTTP2_DIRECTIVE=""
    LISTEN_HTTP2=" http2"
  fi
fi

ACME_WEBROOT="/var/www/letsencrypt"

acme_location() {
  cat <<NGINX
    location /.well-known/acme-challenge/ {
        root ${ACME_WEBROOT};
    }
NGINX
}

proxy_location() {
  cat <<NGINX
    location / {
        proxy_pass http://${UPSTREAM};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_read_timeout 60s;
    }
NGINX
}

tls_block() {
  local dir
  dir="$(cert_dir "$1")"
  cat <<NGINX
    listen 443 ssl${LISTEN_HTTP2};
    listen [::]:443 ssl${LISTEN_HTTP2};
${HTTP2_DIRECTIVE}
    ssl_certificate     ${dir}/fullchain.pem;
    ssl_certificate_key ${dir}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
NGINX
}

# Security headers and CSP come from the stack (internal nginx for the console, the store
# server for stores); the host only terminates TLS and adds HSTS.
generate_vhost() {
  local generated
  generated="$(mktemp)"
  {
    echo "# VendedorIA — nginx del VPS → Docker (generado por scripts/bootstrap-host.sh)"
    echo "# No editar a mano; vuelve a ejecutar: sudo bash scripts/bootstrap-host.sh"
    echo
    cat <<NGINX
upstream ${UPSTREAM} {
    server 127.0.0.1:${WEB_PORT};
    keepalive 16;
}

NGINX

    if has_cert "$CONSOLE_CERT_NAME"; then
      cat <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${CONSOLE_HOST};

$(acme_location)
    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    server_name ${CONSOLE_HOST};
$(tls_block "$CONSOLE_CERT_NAME")
    client_max_body_size 10m;

$(proxy_location)
}

NGINX
    else
      cat <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${CONSOLE_HOST};
    client_max_body_size 10m;

$(acme_location)
$(proxy_location)
}

NGINX
    fi

    if has_cert "$STORE_CERT_NAME"; then
      cat <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${STORE_BASE_DOMAIN} *.${STORE_BASE_DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    server_name *.${STORE_BASE_DOMAIN};
$(tls_block "$STORE_CERT_NAME")
    client_max_body_size 1m;

$(proxy_location)
}

server {
    server_name ${STORE_BASE_DOMAIN};
$(tls_block "$STORE_CERT_NAME")
    client_max_body_size 1m;

$(proxy_location)
}

server {
    server_name www.${STORE_BASE_DOMAIN};
$(tls_block "$STORE_CERT_NAME")
    return 301 https://${STORE_BASE_DOMAIN}\$request_uri;
}
NGINX
    else
      cat <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name *.${STORE_BASE_DOMAIN};
    client_max_body_size 1m;

$(proxy_location)
}

server {
    listen 80;
    listen [::]:80;
    server_name ${STORE_BASE_DOMAIN};
    client_max_body_size 1m;

$(proxy_location)
}

server {
    listen 80;
    listen [::]:80;
    server_name www.${STORE_BASE_DOMAIN};
    return 301 http://${STORE_BASE_DOMAIN}\$request_uri;
}
NGINX
    fi
  } >"$generated"

  install -d "$GENERATED_DIR"
  install -m 644 "$generated" "$OUTPUT_FILE"
  rm -f "$generated"

  log "Console:  ${CONSOLE_HOST} ($(has_cert "$CONSOLE_CERT_NAME" && echo https || echo 'http only'))"
  log "Stores:   *.${STORE_BASE_DOMAIN} ($(has_cert "$STORE_CERT_NAME" && echo https || echo 'http only'))"
  log "Upstream: 127.0.0.1:${WEB_PORT}"
  log "Generated: ${OUTPUT_FILE}"
}

ensure_ssl_global_config() {
  if [[ ! -f "$SSL_GLOBAL_CANONICAL" ]]; then
    err "Missing canonical SSL config: ${SSL_GLOBAL_CANONICAL}"
    exit 1
  fi
  install -d /etc/nginx/conf.d
  if [[ -f "$SSL_GLOBAL_DEST" ]]; then
    if ! cmp -s "$SSL_GLOBAL_CANONICAL" "$SSL_GLOBAL_DEST"; then
      err "Conflict: ${SSL_GLOBAL_DEST} differs from ${SSL_GLOBAL_CANONICAL}"
      err "Unify it on the VPS (same ssl_session_cache name/size for every app), then re-run."
      diff -u "$SSL_GLOBAL_DEST" "$SSL_GLOBAL_CANONICAL" >&2 || true
      exit 1
    fi
    log "SSL global OK: ${SSL_GLOBAL_DEST}"
  else
    install -m 644 "$SSL_GLOBAL_CANONICAL" "$SSL_GLOBAL_DEST"
    log "Installed SSL global: ${SSL_GLOBAL_DEST}"
  fi
}

reload_nginx_safe() {
  if ! nginx -t 2>&1; then
    err "nginx -t failed — config NOT reloaded (other sites on this VPS keep the last good config)."
    exit 1
  fi
  systemctl enable nginx >/dev/null 2>&1 || true
  systemctl reload nginx || systemctl restart nginx
}

install_vhost() {
  install -d /etc/nginx/sites-available /etc/nginx/sites-enabled
  if [[ -e /etc/nginx/sites-enabled/default ]]; then
    log "Disabling /etc/nginx/sites-enabled/default"
    rm -f /etc/nginx/sites-enabled/default
  fi
  install -m 644 "$OUTPUT_FILE" "$SITES_AVAILABLE"
  ln -sf "$SITES_AVAILABLE" "$SITES_ENABLED"
  ensure_ssl_global_config
  reload_nginx_safe
  log "Installed: ${SITES_AVAILABLE}"
}

if [[ "$GENERATE_ONLY" == true ]]; then
  generate_vhost
  echo
  log "To install on the VPS (packages + firewall + vhost + TLS):"
  echo "  sudo bash scripts/bootstrap-host.sh"
  exit 0
fi

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  err "Run as root: sudo bash scripts/bootstrap-host.sh"
  err "Or generate config only: bash scripts/bootstrap-host.sh --generate-only"
  exit 1
fi

CERTBOT_EMAIL="$(read_env CERTBOT_EMAIL)"
if [[ -z "$CERTBOT_EMAIL" ]]; then
  EMAIL_FROM="$(read_env EMAIL_FROM)"
  if [[ "$EMAIL_FROM" == *"@"* ]]; then
    CERTBOT_EMAIL="$(printf '%s' "$EMAIL_FROM" | sed -n 's/.*<\([^>]*\)>.*/\1/p')"
    CERTBOT_EMAIL="${CERTBOT_EMAIL:-$EMAIL_FROM}"
  fi
fi

export DEBIAN_FRONTEND=noninteractive

ensure_packages() {
  if ! command -v apt-get >/dev/null 2>&1; then
    err "apt-get not found — this script targets Ubuntu/Debian."
    exit 1
  fi
  log "Installing host packages (nginx, certbot)..."
  apt-get update -qq
  apt-get install -y -qq nginx certbot curl ca-certificates
  install -d "$ACME_WEBROOT"
  systemctl enable nginx >/dev/null 2>&1 || true
  systemctl start nginx
}

ensure_firewall() {
  if [[ "$DO_FIREWALL" != true ]]; then
    log "Skipped firewall (--skip-firewall)."
    return
  fi
  command -v ufw >/dev/null 2>&1 || apt-get install -y -qq ufw
  log "Allowing ports 80 and 443 (ufw) — not modifying SSH/22..."
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  if ufw status 2>/dev/null | grep -qi 'Status: inactive'; then
    warn "ufw is inactive — 80/443 rules added but ufw was NOT enabled (could lock out SSH)."
    warn "When SSH is already allowed: sudo ufw status && sudo ufw enable"
  fi
  warn "If the cloud panel has its own firewall, allow TCP 80 and 443 there too."
}

obtain_console_tls() {
  if [[ "$CONSOLE_IN_WILDCARD" == true ]]; then
    return 0
  fi
  if has_cert "$CONSOLE_CERT_NAME"; then
    log "TLS certificate already present for ${CONSOLE_HOST}"
    return 0
  fi
  log "Requesting Let's Encrypt certificate for ${CONSOLE_HOST} (HTTP-01)..."
  set +e
  certbot certonly --webroot -w "$ACME_WEBROOT" --non-interactive --agree-tos --email "$CERTBOT_EMAIL" \
    --cert-name "$CONSOLE_CERT_NAME" -d "$CONSOLE_HOST" \
    --deploy-hook "systemctl reload nginx"
  local rc=$?
  set -e
  if [[ $rc -ne 0 ]]; then
    warn "Certbot failed for ${CONSOLE_HOST}: check the A/AAAA record points here, ports 80/443"
    warn "are open, and the record is DNS-only if it goes through a CDN. HTTP stays active."
  fi
}

obtain_store_tls() {
  if has_cert "$STORE_CERT_NAME"; then
    log "Wildcard certificate already present for *.${STORE_BASE_DOMAIN}"
    return 0
  fi
  if [[ -z "$CLOUDFLARE_API_TOKEN" ]]; then
    warn "CLOUDFLARE_API_TOKEN empty: no wildcard certificate, stores stay on HTTP and store links (https) fail."
    warn "Create a Cloudflare API token (Zone · DNS · Edit on ${STORE_BASE_DOMAIN}), add it to .env and re-run."
    return 0
  fi
  install -m 600 /dev/null "$CF_INI"
  printf 'dns_cloudflare_api_token = %s\n' "$CLOUDFLARE_API_TOKEN" >"$CF_INI"
  apt-get install -y -qq python3-certbot-dns-cloudflare
  log "Requesting wildcard certificate for *.${STORE_BASE_DOMAIN} (DNS-01, Cloudflare)..."
  set +e
  certbot certonly --dns-cloudflare --dns-cloudflare-credentials "$CF_INI" \
    --dns-cloudflare-propagation-seconds 30 --non-interactive --agree-tos --email "$CERTBOT_EMAIL" \
    --cert-name "$STORE_CERT_NAME" -d "$STORE_BASE_DOMAIN" -d "*.${STORE_BASE_DOMAIN}" \
    --deploy-hook "systemctl reload nginx"
  local rc=$?
  set -e
  if [[ $rc -ne 0 ]]; then
    warn "Wildcard certificate failed: check the token can edit DNS of the ${STORE_BASE_DOMAIN} zone."
  fi
}

ensure_packages
ensure_firewall
generate_vhost
install_vhost

if [[ "$DO_TLS" != true ]]; then
  log "Skipped Let's Encrypt (--skip-tls)."
elif [[ -z "$CERTBOT_EMAIL" ]]; then
  warn "No CERTBOT_EMAIL (or EMAIL_FROM) in .env — skipping certbot."
  warn "Add CERTBOT_EMAIL=tu@correo.com and re-run: sudo bash scripts/bootstrap-host.sh"
else
  obtain_console_tls
  obtain_store_tls
  log "Refreshing nginx vhost with the certificates found..."
  generate_vhost
  install_vhost
fi

echo
log "Done."
log "  Local upstream: http://127.0.0.1:${WEB_PORT}"
log "  Console:        $(has_cert "$CONSOLE_CERT_NAME" && echo https || echo http)://${CONSOLE_HOST}/"
log "  Stores:         $(has_cert "$STORE_CERT_NAME" && echo https || echo http)://{slug}.${STORE_BASE_DOMAIN}/"
