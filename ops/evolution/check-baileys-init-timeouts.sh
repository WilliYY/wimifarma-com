#!/usr/bin/env bash
set -euo pipefail

STACK_DIR="${STACK_DIR:-/home/ubuntu/projetos/wimifarma-evolution-api}"
MAIN_ENV="${MAIN_ENV:-/home/ubuntu/projetos/wimifarma-com/.env}"
CONTAINER="${CONTAINER:-wimifarma-evolution-api}"
API_URL="${API_URL:-http://127.0.0.1:8080}"
LOOKBACK="${LOOKBACK:-2h}"
WARN_THRESHOLD="${WARN_THRESHOLD:-3}"
CRITICAL_THRESHOLD="${CRITICAL_THRESHOLD:-8}"

get_env_value() {
  local file="$1"
  local key="$2"

  if [ ! -f "$file" ]; then
    return 0
  fi

  awk -F= -v key="$key" '
    $1 == key {
      sub(/^[^=]*=/, "")
      value = $0
    }
    END {
      gsub(/\r/, "", value)
      print value
    }
  ' "$file"
}

print_result() {
  local status="$1"
  local state="$2"
  local timeouts="$3"
  local last_timeout="$4"

  printf 'status=%s\n' "$status"
  printf 'connection_state=%s\n' "$state"
  printf 'lookback=%s\n' "$LOOKBACK"
  printf 'init_query_timeouts=%s\n' "$timeouts"
  printf 'warn_threshold=%s\n' "$WARN_THRESHOLD"
  printf 'critical_threshold=%s\n' "$CRITICAL_THRESHOLD"
  printf 'last_timeout=%s\n' "${last_timeout:-none}"
}

if ! command -v docker >/dev/null 2>&1; then
  print_result "critical" "not_checked" "0" "docker command not found"
  exit 2
fi

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  print_result "critical" "not_checked" "0" "container $CONTAINER not found"
  exit 2
fi

if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || echo false)" != "true" ]; then
  print_result "critical" "stopped" "0" "container $CONTAINER is not running"
  exit 2
fi

api_key="${AUTHENTICATION_API_KEY:-$(get_env_value "$STACK_DIR/.env" AUTHENTICATION_API_KEY)}"
instance="${EVOLUTION_API_INSTANCE:-$(get_env_value "$MAIN_ENV" EVOLUTION_API_INSTANCE)}"
state="not_checked"

if [ -n "$api_key" ] && [ -n "$instance" ] && command -v curl >/dev/null 2>&1; then
  state_json="$(curl -fsS -H "apikey: ${api_key}" "${API_URL}/instance/connectionState/${instance}" 2>/dev/null || true)"
  state="$(printf '%s' "$state_json" | sed -n 's/.*"state"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
  state="${state:-unknown}"
fi

pattern="unexpected error in.*init queries|executeInitQueries|fetchProps|Timed Out"
logs="$(docker logs --since "$LOOKBACK" "$CONTAINER" 2>&1 || true)"
timeouts="$(printf '%s\n' "$logs" | grep -Eic "$pattern" || true)"
last_timeout="$(printf '%s\n' "$logs" | grep -Ei "$pattern" | tail -n 1 | tr -d '\r' | awk '{print substr($0, 1, 240)}' || true)"

if [ "$state" != "open" ] && [ "$state" != "connected" ]; then
  print_result "critical" "$state" "$timeouts" "${last_timeout:-Evolution connection state is not open}"
  exit 2
fi

if [ "$timeouts" -ge "$CRITICAL_THRESHOLD" ]; then
  print_result "critical" "$state" "$timeouts" "$last_timeout"
  exit 2
fi

if [ "$timeouts" -ge "$WARN_THRESHOLD" ]; then
  print_result "warn" "$state" "$timeouts" "$last_timeout"
  exit 1
fi

print_result "ok" "$state" "$timeouts" "$last_timeout"
