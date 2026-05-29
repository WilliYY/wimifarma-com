#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
legacy_pattern='(PDO[[:space:]]+mysql|mysqli|mysql2|wf_users|wf_logs|db\(\)|DB_HOST|wpdb|wp_)'

count_files() {
  local rel="$1"
  local total=0
  local part path count
  IFS=';' read -ra parts <<< "$rel"
  for part in "${parts[@]}"; do
    path="$repo_root/$part"
    if [ ! -e "$path" ]; then
      continue
    fi
    if [ -f "$path" ]; then
      case "$path" in
        *.php|*.ts|*.js|*.json|*.yml|*.yaml|*.md) total=$((total + 1)) ;;
      esac
      continue
    fi
    count="$(find "$path" -type f \
      \( -name '*.php' -o -name '*.ts' -o -name '*.js' -o -name '*.json' -o -name '*.yml' -o -name '*.yaml' -o -name '*.md' \) \
      ! -path '*/node_modules/*' \
      ! -path '*/vendor/*' \
      ! -path '*/dist/*' \
      ! -path '*/wp-admin/*' \
      ! -path '*/wp-includes/*' | wc -l | tr -d ' ')"
    total=$((total + count))
  done
  echo "$total"
}

count_refs() {
  local rel="$1"
  local matches=''
  local part path output
  IFS=';' read -ra parts <<< "$rel"
  for part in "${parts[@]}"; do
    path="$repo_root/$part"
    if [ ! -e "$path" ]; then
      continue
    fi
    output="$(grep -RInE "$legacy_pattern" "$path" \
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
    if [ -n "$output" ]; then
      matches+=$'\n'"$output"
    fi
  done
  if [ -z "$matches" ]; then
    echo 0
    return
  fi
  printf '%s\n' "$matches" | wc -l | tr -d ' '
}

rows=(
  "Cotacao|apps/cotacao|Node.js + Express + Postgres/Redis + core auth|sem dependencia MySQL no app|evoluir TypeScript em janela segura|moderno"
  "Gestao|apps/gestao|Node.js + TypeScript + Postgres|mysql2 login/log/importacao|Postgres puro + core auth|1"
  "Pedidos|apps/pedidos|Node.js + TypeScript + Postgres|mysql2 login/log|Postgres puro + core auth|1"
  "Tarefa|apps/tarefa|Node.js + TypeScript + Postgres|MySQL legado opcional por flags|Postgres puro + core auth|2"
  "Codigos|site/codigos;apps/codigos|Node.js + TypeScript + Postgres|MySQL legado opcional por flags CODIGOS_LEGACY_MYSQL_*|Postgres puro + core auth/auditoria|3 em corte"
  "XP|site/xp;apps/xp|Node.js + TypeScript + Postgres|MySQL legado opcional por flags XP_LEGACY_MYSQL_*|Postgres puro + core auth/auditoria|4 em corte"
  "Financeiro|site/financeiro;apps/financeiro|Node.js + TypeScript + Express + Postgres oficial|MySQL opcional por FINANCEIRO_LEGACY_MYSQL_*|Postgres puro + core auth/auditoria|5 validar"
  "Usuarios|apps/usuarios|Node.js + TypeScript + Express + Postgres core|sem MySQL operacional para usuarios novos|enforcement gradual por modulo|moderno"
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
- Observar Gestao/Pedidos em sombra/fallback; Cotacao ja usa core auth sem MySQL.
- Validar Tarefa com core auth e legado MySQL desligado por flags.
- Observar XP e Codigos em /xp/ e /codigos/, validar Miauby por CODIGOS_INTERNAL_TOKEN e desligar flags legadas depois de paridade estavel.
- Validar Financeiro Node/Postgres em /financeiro/ com health/checksums/fluxos antes de desligar espelho MySQL.
- Validar Usuarios em /usuarios/ com health, login admin, vinculo XP e auditoria; depois aplicar permissoes modulo por modulo.
- Depois migrar Cashback e Miauby interno.
- Tratar WordPress como excecao isolada ou substituir o site publico depois.
EOF
