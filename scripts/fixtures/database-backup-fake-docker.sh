#!/usr/bin/env sh
set -eu

printf '%s\n' "$*" >> "${WIMIFARMA_BACKUP_TEST_DOCKER_LOG:?}"

if [ "${1:-}" = "inspect" ]; then
  printf '%s\n' 'true'
  exit 0
fi

case "$*" in
  *pg_dump*)
    if [ -n "${WIMIFARMA_BACKUP_TEST_FAIL_CONTAINER:-}" ] && printf '%s' "$*" | grep -q "$WIMIFARMA_BACKUP_TEST_FAIL_CONTAINER"; then
      printf '%s\n' 'simulated pg_dump failure' >&2
      exit 74
    fi
    printf '%s' 'PGDMP-wimifarma-test'
    ;;
  *pg_restore*--list*)
    while IFS= read -r _line; do :; done
    printf '%s\n' '1; 0 0 TABLE DATA public sample test'
    ;;
  *mysqldump*)
    printf '%s\n' '-- MySQL dump test' 'CREATE DATABASE `wimifarma_app`;'
    ;;
  *)
    printf '%s\n' "unexpected docker command: $*" >&2
    exit 64
    ;;
esac
