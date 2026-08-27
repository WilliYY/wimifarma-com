#!/usr/bin/env sh
set -eu

printf '%s\n' "$*" >> "${COTACAO_BACKUP_TEST_DOCKER_LOG:?}"

if [ "${1:-}" = "inspect" ]; then
  printf '%s\n' 'true'
  exit 0
fi

case "$*" in
  *pg_dump*)
    printf '%s' 'PGDMP-wimifarma-test'
    ;;
  *pg_restore*--list*)
    while IFS= read -r _line; do :; done
    printf '%s\n' '1; 0 0 TABLE DATA public cotacao_v2_rows test'
    ;;
  *)
    printf '%s\n' "unexpected docker command: $*" >&2
    exit 64
    ;;
esac
