#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
legacy_pattern='(PDO[[:space:]]+mysql|mysqli|mysql2|wf_users|wf_logs|db\(\)|DB_HOST|wpdb|wp_)'

count_files() {
  local rel="$1"
  local path="$repo_root/$rel"
  if [ ! -e "$path" ]; then
    echo 0
    return
  fi
  if [ -f "$path" ]; then
    case "$path" in
      *.php|*.ts|*.js|*.json|*.yml|*.yaml|*.md) echo 1 ;;
      *) echo 0 ;;
    esac
    return
  fi
  find "$path" -type f \
    \( -name '*.php' -o -name '*.ts' -o -name '*.js' -o -name '*.json' -o -name '*.yml' -o -name '*.yaml' -o -name '*.md' \) \
    ! -path '*/node_modules/*' \
    ! -path '*/vendor/*' \
    ! -path '*/dist/*' \
    ! -path '*/wp-admin/*' \
    ! -path '*/wp-includes/*' | wc -l | tr -d ' '
}

count_refs() {
  local rel="$1"
  local path="$repo_root/$rel"
  local matches
  if [ ! -e "$path" ]; then
    echo 0
    return
  fi
  matches="$(grep -RInE "$legacy_pattern" "$path" \
    --include='*.php' \
    --include='*.ts' \
    --include='*.js' \
    --include='*.json' \
    --include='*.yml' \
    --include='*.yaml' \
    --include='*.md' \
    --exclude-dir='node_modules' \
    --exclude-dir='vendor' \
    --exclude-dir='dist' \
    --exclude-dir='wp-admin' \
    --exclude-dir='wp-includes' 2>/dev/null || true)"
  if [ -z "$matches" ]; then
    echo 0
    return
  fi
  printf '%s\n' "$matches" | wc -l | tr -d ' '
}

rows=(
  "Cotacao|apps/cotacao|Node.js + Express + Postgres/Redis|mysql2 login wf_users|TypeScript + core auth Postgres|1"
  "Gestao|apps/gestao|Node.js + TypeScript + Postgres|mysql2 login/log/importacao|Postgres puro + core auth|1"
  "Pedidos|apps/pedidos|Node.js + TypeScript + Postgres|mysql2 login/log|Postgres puro + core auth|1"
  "Tarefa|apps/tarefa|Node.js + TypeScript + Postgres|mysql2 login/log/importacao/espelho|Postgres puro + core auth|2"
  "Codigos|site/codigos|PHP procedural + MySQL|wf_codigos_*|apps/codigos Node.js + TypeScript + Postgres|3"
  "XP|site/xp|PHP procedural + MySQL|wf_xp_*|apps/xp Node.js + TypeScript + Postgres|4"
  "Financeiro|site/financeiro|PHP procedural + MySQL|financeiro_* e wf_users|apps/financeiro Node.js + TypeScript + Postgres|5"
  "Cashback|site/cashback|PHP procedural + MySQL|wf_clientes/compras/creditos/resgates|apps/cashback Node.js + TypeScript + Postgres|6"
  "Miauby interno|site/miauw|PHP + Node agent sombra|miauw_* em MySQL|apps/miauw-agent + Postgres wimifarma_miauw|7"
  "Miauby WhatsApp|apps/miauw-whatsapp|Node.js + TypeScript + Postgres|sem MySQL operacional|manter/evoluir|moderno"
  "Home publica|site/home.php|PHP desacoplado|sem banco direto|manter ou trocar depois|baixo"
  "WordPress|site/wp-config.php|WordPress + PHP + MySQL|dependencia natural do WP|substituir/desacoplar|ultimo"
)

printf '%-17s | %-42s | %-35s | %-43s | %-8s | %-5s | %-5s\n' \
  'Modulo' 'Atual' 'Legado' 'Alvo' 'Prior' 'Files' 'Refs'
printf '%s\n' '-------------------------------------------------------------------------------------------------------------------------------------------------------------------------'

for row in "${rows[@]}"; do
  IFS='|' read -r module rel current legacy target priority <<< "$row"
  files="$(count_files "$rel")"
  refs="$(count_refs "$rel")"
  printf '%-17s | %-42s | %-35s | %-43s | %-8s | %-5s | %-5s\n' \
    "$module" "$current" "$legacy" "$target" "$priority" "$files" "$refs"
done

cat <<'EOF'

Proximos passos recomendados:
- Observar Cotacao/Gestao/Pedidos em sombra e cortar auth somente sem divergencias.
- Observar Tarefa Node/Postgres e remover espelho MySQL depois de validacao.
- Depois migrar Codigos, XP, Financeiro, Cashback, Miauby interno.
- Tratar WordPress como excecao isolada ou substituir o site publico depois.
EOF
