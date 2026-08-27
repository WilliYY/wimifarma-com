#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_dir="${COTACAO_PROJECT_DIR:-$(cd "$script_dir/.." && pwd)}"
backup_dir="${COTACAO_BACKUP_DIR:-$project_dir/cotacao-data/automatic-backups}"
container="${COTACAO_POSTGRES_CONTAINER:-wimifarma-cotacao-db}"
retention_days="${COTACAO_BACKUP_RETENTION_DAYS:-30}"
timestamp="${COTACAO_BACKUP_TIMESTAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"

for required_command in docker flock realpath sha256sum; do
  if ! command -v "$required_command" > /dev/null 2>&1; then
    printf 'Comando obrigatorio nao encontrado: %s.\n' "$required_command" >&2
    exit 69
  fi
done

project_dir="$(realpath -m -- "$project_dir")"
backup_dir="$(realpath -m -- "$backup_dir")"

case "$backup_dir" in
  /|"$project_dir")
    printf '%s\n' 'Diretorio de backup inseguro.' >&2
    exit 64
    ;;
esac

case "$retention_days" in
  ''|*[!0-9]*)
    printf '%s\n' 'COTACAO_BACKUP_RETENTION_DAYS deve ser inteiro.' >&2
    exit 64
    ;;
esac

if [ "$retention_days" -lt 1 ] || [ "$retention_days" -gt 3650 ]; then
  printf '%s\n' 'Retencao deve ficar entre 1 e 3650 dias.' >&2
  exit 64
fi

if ! printf '%s' "$timestamp" | grep -Eq '^[0-9]{8}T[0-9]{6}Z$'; then
  printf '%s\n' 'Timestamp de backup invalido.' >&2
  exit 64
fi

mkdir -p -- "$backup_dir"
umask 077

exec 9>"$backup_dir/.cotacao-backup.lock"
if ! flock -n 9; then
  printf '%s\n' 'Backup da Cotacao ja esta em execucao.'
  exit 0
fi

if [ "$(docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null || true)" != 'true' ]; then
  printf '%s\n' "Container $container nao esta ativo." >&2
  exit 69
fi

final_file="$backup_dir/cotacao-$timestamp.dump"
temporary_file="$final_file.tmp"
checksum_file="$final_file.sha256"
checksum_temporary="$checksum_file.tmp"

cleanup() {
  rm -f -- "$temporary_file" "$checksum_temporary"
}
trap cleanup EXIT

docker exec "$container" sh -lc \
  'pg_dump --format=custom --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  > "$temporary_file"

if [ ! -s "$temporary_file" ]; then
  printf '%s\n' 'pg_dump gerou arquivo vazio.' >&2
  exit 74
fi

docker exec -i "$container" sh -lc 'pg_restore --list' < "$temporary_file" > /dev/null

mv -- "$temporary_file" "$final_file"
(
  cd "$backup_dir"
  sha256sum "$(basename "$final_file")" > "$(basename "$checksum_temporary")"
)
mv -- "$checksum_temporary" "$checksum_file"

find "$backup_dir" -maxdepth 1 -type f \
  \( -name 'cotacao-????????T??????Z.dump' -o -name 'cotacao-????????T??????Z.dump.sha256' \) \
  -mtime "+$retention_days" -delete

trap - EXIT
printf 'cotacao backup ok|file=%s|bytes=%s|retention_days=%s\n' \
  "$(basename "$final_file")" \
  "$(stat -c '%s' "$final_file")" \
  "$retention_days"
