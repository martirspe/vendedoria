#!/usr/bin/env bash
# VendedorIA backup: Postgres dump (custom format) + .env snapshot + product photos from the
# `uploads` volume (MEDIA_STORAGE=local, and photos uploaded before switching to s3).
# Photos already on S3 stay there and are not copied.
#
# Usage:
#   bash scripts/backup.sh
#   bash scripts/backup.sh --keep 14
#   bash scripts/backup.sh --no-media          # database + .env only (pre-deploy)
#   BACKUP_DIR=/var/backups/vendedoria BACKUP_KEEP=20 bash scripts/backup.sh
#
# Output: ${BACKUP_DIR}/vendedoria-YYYYMMDDTHHMMSSZ.tar.gz (chmod 600: contains secrets)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose)
BACKUP_DIR="${BACKUP_DIR:-${ROOT}/backups}"
BACKUP_KEEP="${BACKUP_KEEP:-10}"
WITH_MEDIA=true
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK=""

log() { printf '\033[1;34m[backup]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[backup]\033[0m %s\n' "$*" >&2; }
warn() { printf '\033[1;33m[backup]\033[0m %s\n' "$*"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep|--keep=*)
      if [[ "$1" == --keep=* ]]; then BACKUP_KEEP="${1#*=}"; shift; else BACKUP_KEEP="${2:-}"; shift 2 || shift; fi
      if [[ ! "$BACKUP_KEEP" =~ ^[0-9]+$ || "$BACKUP_KEEP" -lt 1 ]]; then
        err "--keep requires an integer >= 1"
        exit 1
      fi
      ;;
    --no-media) WITH_MEDIA=false; shift ;;
    -h|--help)
      echo "Usage: bash scripts/backup.sh [--keep N] [--no-media]"
      exit 0
      ;;
    *)
      err "Unknown option: $1"
      exit 1
      ;;
  esac
done

env_get() {
  local line
  line="$(grep -E "^$1=" .env 2>/dev/null | tail -1 || true)"
  [[ -n "$line" ]] || return 0
  printf '%s' "${line#*=}" | tr -d '\r' | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

cleanup() {
  if [[ -n "$WORK" && -d "$WORK" ]]; then rm -rf "$WORK"; fi
}
trap cleanup EXIT

[[ -f .env ]] || { err "Missing .env"; exit 1; }
command -v docker >/dev/null 2>&1 || { err "Docker not found"; exit 1; }

POSTGRES_USER="$(env_get POSTGRES_USER)"
POSTGRES_DB="$(env_get POSTGRES_DB)"
POSTGRES_USER="${POSTGRES_USER:-vendedoria}"
POSTGRES_DB="${POSTGRES_DB:-vendedoria}"

if ! "${COMPOSE[@]}" ps --status running --services 2>/dev/null | grep -qx postgres; then
  err "Postgres is not running. Start the stack first (docker compose up -d postgres)."
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR" 2>/dev/null || true
WORK="$(mktemp -d "${TMPDIR:-/tmp}/vendedoria-backup.XXXXXX")"
chmod 700 "$WORK"
ARCHIVE_NAME="vendedoria-${STAMP}.tar.gz"
ARCHIVE_PATH="${BACKUP_DIR}/${ARCHIVE_NAME}"

GIT_COMMIT=""
if [[ -d .git ]]; then GIT_COMMIT="$(git rev-parse --short HEAD 2>/dev/null || true)"; fi

log "Dumping database ${POSTGRES_DB}..."
if ! "${COMPOSE[@]}" exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -Z9 >"${WORK}/database.dump"; then
  err "pg_dump failed"
  exit 1
fi
[[ -s "${WORK}/database.dump" ]] || { err "database.dump is empty"; exit 1; }

cp .env "${WORK}/app.env"
FILES=(database.dump app.env)

if [[ "$WITH_MEDIA" == true ]]; then
  if "${COMPOSE[@]}" ps --status running --services 2>/dev/null | grep -qx api; then
    log "Archiving product photos (uploads volume)..."
    if ! "${COMPOSE[@]}" exec -T api tar -C /app/apps/api/uploads -czf - . >"${WORK}/uploads.tar.gz"; then
      err "Could not archive the uploads volume"
      exit 1
    fi
    FILES+=(uploads.tar.gz)
  else
    warn "API is not running — photos (uploads volume) NOT included."
  fi
fi

chmod 600 "${WORK}"/*

cat >"${WORK}/manifest.json" <<EOF
{
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "gitCommit": "${GIT_COMMIT}",
  "postgresUser": "${POSTGRES_USER}",
  "postgresDb": "${POSTGRES_DB}",
  "includes": [$(printf '"%s",' "${FILES[@]}")"manifest.json"],
  "excludes": ["S3 media", "Docker images", "postgres data volume"]
}
EOF
FILES+=(manifest.json)

log "Packing ${ARCHIVE_NAME}..."
tar -C "$WORK" -czf "$ARCHIVE_PATH" "${FILES[@]}"
chmod 600 "$ARCHIVE_PATH"
log "Wrote ${ARCHIVE_PATH} ($(wc -c <"$ARCHIVE_PATH" | tr -d ' ') bytes)"

mapfile -t OLD < <(ls -1t "${BACKUP_DIR}"/vendedoria-*.tar.gz 2>/dev/null || true)
if (( ${#OLD[@]} > BACKUP_KEEP )); then
  for stale in "${OLD[@]:$BACKUP_KEEP}"; do
    warn "Pruning old backup: ${stale}"
    rm -f "$stale"
  done
fi
ln -sfn "$ARCHIVE_NAME" "${BACKUP_DIR}/latest.tar.gz" 2>/dev/null || true

log "Keep=${BACKUP_KEEP}. Restore: bash scripts/restore-backup.sh ${ARCHIVE_PATH}"
