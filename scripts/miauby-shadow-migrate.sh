#!/usr/bin/env sh
set -eu

MODE="${1:-migrate}"

case "$MODE" in
  migrate|migrate:shadow)
    NPM_SCRIPT="migrate:shadow"
    ;;
  validate|validate:shadow)
    NPM_SCRIPT="validate:shadow"
    ;;
  *)
    echo "usage: sh scripts/miauby-shadow-migrate.sh [migrate|validate]" >&2
    exit 2
    ;;
esac

cd "$(dirname "$0")/.."

echo "using one-off Miauby migrator; live app keeps no MySQL runtime connection" >&2
docker compose build wimifarma-miauby-migrator
docker compose run --rm --no-deps wimifarma-miauby-migrator npm run "$NPM_SCRIPT"
