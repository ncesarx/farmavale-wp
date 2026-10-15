#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

PROJECT_ROOT="${PROJECT_ROOT:-/home/ncesarx/farmavale-central}"
ENV_FILE="${ENV_FILE:-${PROJECT_ROOT}/.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/farmavale-central}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

: "${DATABASE_URL:?DATABASE_URL não configurada}"
command -v pg_dump >/dev/null || { echo "ERRO: pg_dump não encontrado" >&2; exit 1; }
command -v pg_restore >/dev/null || { echo "ERRO: pg_restore não encontrado" >&2; exit 1; }
command -v sha256sum >/dev/null || { echo "ERRO: sha256sum não encontrado" >&2; exit 1; }

mkdir -p "${BACKUP_DIR}"
[[ -w "${BACKUP_DIR}" ]] || { echo "ERRO: sem permissão de escrita em ${BACKUP_DIR}" >&2; exit 1; }

exec 9>"${BACKUP_DIR}/.backup.lock"
flock -n 9 || { echo "ERRO: outro backup está em execução" >&2; exit 1; }

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
hostname_safe="$(hostname | tr -cd '[:alnum:]._-')"
backup_file="${BACKUP_DIR}/farmavale_${hostname_safe}_${timestamp}.dump"
partial_file="${backup_file}.partial"
checksum_file="${backup_file}.sha256"

cleanup() {
  rm -f "${partial_file}"
}
trap cleanup EXIT

database_url="${DATABASE_URL%%\?*}"
pg_dump --format=custom --compress=9 --no-owner --no-privileges   --file="${partial_file}" "${database_url}"

pg_restore --list "${partial_file}" >/dev/null
mv "${partial_file}" "${backup_file}"
(
  cd "${BACKUP_DIR}"
  sha256sum "$(basename "${backup_file}")" > "$(basename "${checksum_file}")"
)

find "${BACKUP_DIR}" -maxdepth 1 -type f   \( -name 'farmavale_*.dump' -o -name 'farmavale_*.dump.sha256' \)   -mtime "+${BACKUP_RETENTION_DAYS}" -delete

size_bytes="$(stat -c '%s' "${backup_file}")"
echo "backup_database_completed file=${backup_file} size_bytes=${size_bytes} retention_days=${BACKUP_RETENTION_DAYS}"
