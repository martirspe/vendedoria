#!/usr/bin/env bash
# Restores a VendedorIA backup made by scripts/backup.sh: database, product photos
# (uploads volume) and optionally .env.
#
# Usage:
#   bash scripts/restore-backup.sh backups/vendedoria-….tar.gz
#   bash scripts/restore-backup.sh backups/latest.tar.gz --yes
#   bash scripts/restore-backup.sh backups/vendedoria-….tar.gz --skip-env
#
# Moving to a new VPS: clone the repo (same commit), copy the archive, run this script,
# then bash scripts/deploy.sh. Photos on S3 stay there: keep the same AWS_* values.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose)
ARCHIVE=""
ASSUME_YES=false
SKIP_ENV=false
WORK=""

log() { printf '\033[1;34m[restore]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[restore]\033[0m %s\n' "$*" >&2; }
warn() { printf '\033[1;33m[restore]\033[0m %s\n' "$*"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes|-y) ASSUME_YES=true; shift ;;
    --skip-env) SKIP_ENV=true; shift ;;
    -h|--help)
      echo "Usage: bash scripts/restore-backup.sh <backup.tar.gz> [--yes] [--skip-env]"
      exit 0
      ;;
    -*) err "Unknown option: $1"; exit 1 ;;
    *)
      [[ -z "$ARCHIVE" ]] || { err "Unexpected argument: $1"; exit 1; }
      ARCHIVE="$1"
      shift
      ;;
  esac
done

[[ -n "$ARCHIVE" ]] || { err "Missing backup path"; exit 1; }
[[ -f "$ARCHIVE" ]] || { err "Not found: ${ARCHIVE}"; exit 1; }
command -v docker >/dev/null 2>&1 || { err "Docker not found"; exit 1; }

cleanup() {
  if [[ -n "$WORK" && -d "$WORK" ]]; then rm -rf "$WORK"; fi
}
trap cleanup EXIT

env_get() {
  local line
  line="$(grep -E "^$2=" "$1" 2>/dev/null | tail -1 || true)"
  [[ -n "$line" ]] || return 0
  printf '%s' "${line#*=}" | tr -d '\r' | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

WORK="$(mktemp -d "${TMPDIR:-/tmp}/vendedoria-restore.XXXXXX")"
chmod 700 "$WORK"
tar -xzf "$ARCHIVE" -C "$WORK"
[[ -f "${WORK}/database.dump" ]] || { err "database.dump missing inside backup"; exit 1; }

if [[ "$ASSUME_YES" != true ]]; then
  warn "This will REPLACE the current database and product photos."
  warn "Archive: ${ARCHIVE}"
  read -r -p "Type 'restore' to continue: " confirm
  [[ "$confirm" == "restore" ]] || { err "Cancelled"; exit 1; }
fi

if [[ "$SKIP_ENV" != true && -f "${WORK}/app.env" ]]; then
  if [[ -f .env ]]; then
    PRE=".env.pre-restore-$(date -u +%Y%m%dT%H%M%SZ)"
    cp .env "$PRE"
    chmod 600 "$PRE"
    log "Current .env saved as ${PRE}"
  fi
  cp "${WORK}/app.env" .env
  chmod 600 .env
  log "Restored .env from the backup"
fi
[[ -f .env ]] || { err "No .env: restore without --skip-env or create one first"; exit 1; }

POSTGRES_USER="$(env_get .env POSTGRES_USER)"
POSTGRES_DB="$(env_get .env POSTGRES_DB)"
POSTGRES_USER="${POSTGRES_USER:-vendedoria}"
POSTGRES_DB="${POSTGRES_DB:-vendedoria}"

log "Stopping nginx/store/web/api to avoid writes during restore..."
"${COMPOSE[@]}" stop nginx store web api 2>/dev/null || true

log "Ensuring Postgres is up..."
"${COMPOSE[@]}" up -d postgres
for attempt in $(seq 1 60); do
  if "${COMPOSE[@]}" exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
    break
  fi
  (( attempt < 60 )) || { err "Postgres did not become ready"; exit 1; }
  sleep 2
done

log "Restoring database ${POSTGRES_DB}..."
set +e
"${COMPOSE[@]}" exec -T postgres \
  pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl \
  <"${WORK}/database.dump"
restore_rc=$?
set -e
if (( restore_rc > 1 )); then
  err "pg_restore failed (exit ${restore_rc})"
  exit 1
fi
(( restore_rc == 0 )) || warn "pg_restore finished with warnings (exit 1) — usually safe; verify the app."

if [[ -f "${WORK}/uploads.tar.gz" ]]; then
  log "Restoring product photos into the uploads volume..."
  "${COMPOSE[@]}" run --rm --no-deps -T --entrypoint sh api \
    -c 'tar -xzf - -C /app/apps/api/uploads' <"${WORK}/uploads.tar.gz"
fi

log "Starting stack (the migrate service applies pending migrations)..."
"${COMPOSE[@]}" up -d --remove-orphans

log "Restore complete. Next: bash scripts/deploy.sh (or check the health endpoint)."
if [[ -f "${WORK}/manifest.json" ]]; then cat "${WORK}/manifest.json"; fi
