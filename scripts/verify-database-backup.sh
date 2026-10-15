#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-/home/ncesarx/farmavale-central}"
ENV_FILE="${ENV_FILE:-${PROJECT_ROOT}/.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/farmavale-central}"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

command -v pg_restore >/dev/null || { echo "ERRO: pg_restore não encontrado" >&2; exit 1; }
command -v sha256sum >/dev/null || { echo "ERRO: sha256sum não encontrado" >&2; exit 1; }

backup_file="${1:-}"
if [[ -z "${backup_file}" ]]; then
  backup_file="$(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'farmavale_*.dump' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2-)"
fi

[[ -n "${backup_file}" && -f "${backup_file}" ]] || {
  echo "ERRO: nenhum backup encontrado em ${BACKUP_DIR}" >&2
  exit 1
}

checksum_file="${backup_file}.sha256"
[[ -f "${checksum_file}" ]] || { echo "ERRO: checksum ausente para ${backup_file}" >&2; exit 1; }

(
  cd "$(dirname "${backup_file}")"
  sha256sum --check "$(basename "${checksum_file}")"
)
pg_restore --list "${backup_file}" >/dev/null

age_seconds="$(( $(date +%s) - $(stat -c %Y "${backup_file}") ))"
size_bytes="$(stat -c '%s' "${backup_file}")"
echo "backup_database_verified file=${backup_file} size_bytes=${size_bytes} age_seconds=${age_seconds}"
