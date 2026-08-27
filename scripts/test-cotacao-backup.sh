#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
backup_script="${1:-$script_dir/cotacao-backup.sh}"
test_root="$(mktemp -d)"
trap 'rm -rf -- "$test_root"' EXIT

mkdir -p "$test_root/bin" "$test_root/project" "$test_root/backups"
cp "$script_dir/fixtures/cotacao-backup-fake-docker.sh" "$test_root/bin/docker"
cp "$script_dir/fixtures/cotacao-backup-fake-flock.sh" "$test_root/bin/flock"
chmod 700 "$test_root/bin/docker"
chmod 700 "$test_root/bin/flock"

export COTACAO_BACKUP_TEST_DOCKER_LOG="$test_root/docker.log"
export COTACAO_PROJECT_DIR="$test_root/project"
export COTACAO_BACKUP_DIR="$test_root/backups"
export COTACAO_BACKUP_TIMESTAMP="20260827T203000Z"
export COTACAO_BACKUP_RETENTION_DAYS=14
export PATH="$test_root/bin:$PATH"

bash "$backup_script"

dump="$test_root/backups/cotacao-20260827T203000Z.dump"
checksum="$dump.sha256"

test -s "$dump"
test -s "$checksum"
grep -q 'pg_dump' "$test_root/docker.log"
grep -q 'pg_restore --list' "$test_root/docker.log"
test "$(find "$test_root/backups" -maxdepth 1 -type f -name '*.tmp' | wc -l)" -eq 0
grep -q "$(basename "$dump")" "$checksum"

printf '%s\n' 'cotacao backup test ok'
