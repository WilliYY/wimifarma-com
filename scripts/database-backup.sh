#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_dir="${WIMIFARMA_PROJECT_DIR:-$(cd "$script_dir/.." && pwd)}"
backup_dir="${WIMIFARMA_BACKUP_DIR:-/home/ubuntu/projetos/_backups-wimifarma/automatic}"
retention_days="${WIMIFARMA_BACKUP_RETENTION_DAYS:-30}"
timestamp="${WIMIFARMA_BACKUP_TIMESTAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
postgres_csv="${WIMIFARMA_POSTGRES_CONTAINERS:-wimifarma-core-db,wimifarma-cotacao-db,wimifarma-gestao-db,wimifarma-tarefa-db,wimifarma-xp-db,wimifarma-codigos-db,wimifarma-calendario-db,wimifarma-financeiro-db,wimifarma-cashback-db,wimifarma-login-senha-db,wimifarma-notas-db,wimifarma-entrega-db,wimifarma-comissao-db,wimifarma-miauw-whatsapp-db,wimifarma-miauby-db}"
mysql_container="${WIMIFARMA_MYSQL_CONTAINER:-wimifarma-com-db}"
offsite_remote="${WIMIFARMA_BACKUP_REMOTE:-}"

for required_command in docker flock gzip realpath sha256sum; do
  if ! command -v "$required_command" > /dev/null 2>&1; then
    printf 'Comando obrigatorio nao encontrado: %s.\n' "$required_command" >&2
    exit 69
  fi
done

project_dir="$(realpath -m -- "$project_dir")"
backup_dir="$(realpath -m -- "$backup_dir")"

case "$backup_dir" in
  /|"$project_dir"|"$project_dir"/*)
    printf '%s\n' 'Diretorio de backup deve ficar fora do projeto.' >&2
    exit 64
    ;;
esac

case "$retention_days" in
  ''|*[!0-9]*)
    printf '%s\n' 'WIMIFARMA_BACKUP_RETENTION_DAYS deve ser inteiro.' >&2
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
chmod 700 -- "$backup_dir"
umask 077

exec 9>"$backup_dir/.database-backup.lock"
if ! flock -n 9; then
  printf '%s\n' 'Backup dos bancos Wimifarma ja esta em execucao.'
  exit 0
fi

final_dir="$backup_dir/run-$timestamp"
temporary_dir="$backup_dir/.run-$timestamp.tmp"
if [ -e "$final_dir" ] || [ -e "$temporary_dir" ]; then
  printf '%s\n' 'Ja existe backup com este timestamp.' >&2
  exit 73
fi
mkdir -- "$temporary_dir"

cleanup() {
  case "$temporary_dir" in
    "$backup_dir"/.run-*.tmp)
      if [ -d "$temporary_dir" ]; then
        find "$temporary_dir" -mindepth 1 -maxdepth 1 -type f -delete
        rmdir -- "$temporary_dir" 2>/dev/null || true
      fi
      ;;
  esac
}
trap cleanup EXIT

container_is_running() {
  [ "$(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null || true)" = 'true' ]
}

IFS=',' read -r -a postgres_containers <<< "$postgres_csv"
if [ "${#postgres_containers[@]}" -lt 1 ]; then
  printf '%s\n' 'Nenhum Postgres configurado para backup.' >&2
  exit 64
fi

printf 'timestamp_utc=%s\n' "$timestamp" > "$temporary_dir/manifest.txt"
printf 'retention_days=%s\n' "$retention_days" >> "$temporary_dir/manifest.txt"

for raw_container in "${postgres_containers[@]}"; do
  container="$(printf '%s' "$raw_container" | tr -d '[:space:]')"
  if ! printf '%s' "$container" | grep -Eq '^wimifarma-[a-z0-9-]+-db$'; then
    printf 'Container Postgres invalido: %s.\n' "$container" >&2
    exit 64
  fi
  if ! container_is_running "$container"; then
    printf 'Container %s nao esta ativo.\n' "$container" >&2
    exit 69
  fi

  short_name="${container#wimifarma-}"
  short_name="${short_name%-db}"
  dump_file="$temporary_dir/$short_name.dump"
  docker exec "$container" sh -lc \
    'pg_dump --format=custom --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
    > "$dump_file"

  if [ ! -s "$dump_file" ]; then
    printf 'pg_dump de %s gerou arquivo vazio.\n' "$container" >&2
    exit 74
  fi
  docker exec -i "$container" sh -lc 'pg_restore --list' < "$dump_file" > /dev/null
  printf 'postgres=%s|file=%s|bytes=%s\n' "$container" "$(basename "$dump_file")" "$(stat -c '%s' "$dump_file")" >> "$temporary_dir/manifest.txt"
done

if ! printf '%s' "$mysql_container" | grep -Eq '^wimifarma-[a-z0-9-]+-db$'; then
  printf '%s\n' 'Container MySQL invalido.' >&2
  exit 64
fi
if ! container_is_running "$mysql_container"; then
  printf 'Container %s nao esta ativo.\n' "$mysql_container" >&2
  exit 69
fi

mysql_file="$temporary_dir/mysql-all.sql.gz"
docker exec "$mysql_container" sh -lc \
  'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump --user=root --single-transaction --quick --routines --events --triggers --hex-blob --all-databases' \
  | gzip -9 > "$mysql_file"

if [ ! -s "$mysql_file" ]; then
  printf '%s\n' 'mysqldump gerou arquivo vazio.' >&2
  exit 74
fi
gzip -t "$mysql_file"
if ! gzip -cd "$mysql_file" | awk '
  /-- MySQL dump/ { header = 1 }
  /CREATE DATABASE/ { database = 1 }
  END { exit (header && database) ? 0 : 1 }
'; then
  printf '%s\n' 'Dump MySQL nao contem a estrutura esperada.' >&2
  exit 74
fi
printf 'mysql=%s|file=%s|bytes=%s\n' "$mysql_container" "$(basename "$mysql_file")" "$(stat -c '%s' "$mysql_file")" >> "$temporary_dir/manifest.txt"

(
  cd "$temporary_dir"
  sha256sum ./*.dump ./mysql-all.sql.gz > SHA256SUMS
  sha256sum --check SHA256SUMS > /dev/null
)

chmod 600 "$temporary_dir"/*
mv -- "$temporary_dir" "$final_dir"
trap - EXIT

while IFS= read -r -d '' expired_dir; do
  case "$expired_dir" in
    "$backup_dir"/run-????????T??????Z)
      find "$expired_dir" -mindepth 1 -maxdepth 1 -type f -delete
      rmdir -- "$expired_dir"
      ;;
  esac
done < <(find "$backup_dir" -mindepth 1 -maxdepth 1 -type d -name 'run-????????T??????Z' -mtime "+$retention_days" -print0)

if [ -n "$offsite_remote" ]; then
  if ! command -v rclone > /dev/null 2>&1; then
    printf '%s\n' 'WIMIFARMA_BACKUP_REMOTE foi definido, mas rclone nao esta instalado.' >&2
    exit 69
  fi
  rclone copy "$final_dir" "${offsite_remote%/}/$(basename "$final_dir")" --checksum --immutable
fi

printf 'database backup ok|directory=%s|files=%s|retention_days=%s|offsite=%s\n' \
  "$(basename "$final_dir")" \
  "$(find "$final_dir" -maxdepth 1 -type f | wc -l)" \
  "$retention_days" \
  "$([ -n "$offsite_remote" ] && printf configured || printf local-only)"
