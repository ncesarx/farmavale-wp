#!/usr/bin/env bash
set -Eeuo pipefail

APP_URL="${APP_URL:-http://127.0.0.1:3006}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/farmavale-central}"
BACKUP_MAX_AGE_SECONDS="${BACKUP_MAX_AGE_SECONDS:-97200}"
REQUIRE_BACKUP="${REQUIRE_BACKUP:-true}"

command -v curl >/dev/null || { echo "ERRO: curl não encontrado" >&2; exit 1; }

health="$(curl --fail --silent --show-error --max-time 10 "${APP_URL}/api/health")"
ready="$(curl --fail --silent --show-error --max-time 10 "${APP_URL}/api/ready")"

grep -q '"status":"ok"' <<<"${health}" || { echo "ERRO: health inválido" >&2; exit 1; }
grep -q '"status":"ready"' <<<"${ready}" || { echo "ERRO: aplicação não está pronta" >&2; exit 1; }
grep -q '"database":"ok"' <<<"${ready}" || { echo "ERRO: banco indisponível" >&2; exit 1; }

if [[ "${REQUIRE_BACKUP}" == "true" ]]; then
  latest="$(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'farmavale_*.dump' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2-)"
  [[ -n "${latest}" && -f "${latest}" ]] || { echo "ERRO: backup não encontrado" >&2; exit 1; }

  age_seconds="$(( $(date +%s) - $(stat -c %Y "${latest}") ))"
  (( age_seconds <= BACKUP_MAX_AGE_SECONDS )) || {
    echo "ERRO: backup expirado age_seconds=${age_seconds}" >&2
    exit 1
  }
fi

echo "farmavale_operational_check_ok app_url=${APP_URL}"
