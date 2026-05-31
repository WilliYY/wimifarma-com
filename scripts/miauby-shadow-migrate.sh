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

if docker compose ps --status=running --services | grep -qx 'wimifarma-miauby-app'; then
  docker compose exec -T wimifarma-miauby-app npm run "$NPM_SCRIPT"
else
  echo "wimifarma-miauby-app not running; using one-off migrator without dependencies" >&2
  docker compose run --rm --no-deps wimifarma-miauby-migrator npm run "$NPM_SCRIPT"
fi
