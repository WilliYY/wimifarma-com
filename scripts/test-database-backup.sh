#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
backup_script="${1:-$script_dir/database-backup.sh}"
test_root="$(mktemp -d)"
trap 'rm -rf -- "$test_root"' EXIT

mkdir -p "$test_root/bin" "$test_root/project" "$test_root/backups"
cp "$script_dir/fixtures/database-backup-fake-docker.sh" "$test_root/bin/docker"
cp "$script_dir/fixtures/cotacao-backup-fake-flock.sh" "$test_root/bin/flock"
chmod 700 "$test_root/bin/docker" "$test_root/bin/flock"

export WIMIFARMA_BACKUP_TEST_DOCKER_LOG="$test_root/docker.log"
export WIMIFARMA_PROJECT_DIR="$test_root/project"
export WIMIFARMA_BACKUP_DIR="$test_root/backups"
export WIMIFARMA_BACKUP_TIMESTAMP="20260901T170000Z"
export WIMIFARMA_BACKUP_RETENTION_DAYS=30
export WIMIFARMA_POSTGRES_CONTAINERS="wimifarma-core-db,wimifarma-xp-db"
export WIMIFARMA_MYSQL_CONTAINER="wimifarma-com-db"
export PATH="$test_root/bin:$PATH"

bash "$backup_script"

run_dir="$test_root/backups/run-20260901T170000Z"
test -s "$run_dir/core.dump"
test -s "$run_dir/xp.dump"
test -s "$run_dir/mysql-all.sql.gz"
test -s "$run_dir/SHA256SUMS"
test -s "$run_dir/manifest.txt"
grep -q 'pg_restore --list' "$test_root/docker.log"
grep -q 'mysqldump' "$test_root/docker.log"
(
  cd "$run_dir"
  sha256sum --check SHA256SUMS > /dev/null
)
test "$(find "$test_root/backups" -maxdepth 1 -type d -name '*.tmp' | wc -l)" -eq 0

export WIMIFARMA_BACKUP_TIMESTAMP="20260901T170001Z"
export WIMIFARMA_BACKUP_TEST_FAIL_CONTAINER="wimifarma-xp-db"
if bash "$backup_script" > "$test_root/failure.log" 2>&1; then
  printf '%s\n' 'backup deveria falhar quando pg_dump falha' >&2
  exit 1
fi
test ! -e "$test_root/backups/run-20260901T170001Z"
test ! -e "$test_root/backups/.run-20260901T170001Z.tmp"
grep -q 'simulated pg_dump failure' "$test_root/failure.log"
unset WIMIFARMA_BACKUP_TEST_FAIL_CONTAINER

export WIMIFARMA_BACKUP_TIMESTAMP="20260901T170002Z"
export WIMIFARMA_BACKUP_DIR="$test_root/project/unsafe-backups"
if bash "$backup_script" > "$test_root/unsafe.log" 2>&1; then
  printf '%s\n' 'backup deveria recusar destino dentro do projeto' >&2
  exit 1
fi
grep -q 'Diretorio de backup deve ficar fora do projeto' "$test_root/unsafe.log"

printf '%s\n' 'database backup test ok'
