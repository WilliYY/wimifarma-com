param(
    [switch] $Json
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$scanExtensions = @('.php', '.ts', '.js', '.json', '.yml', '.yaml', '.md')
$legacyPattern = '(?i)(PDO\s+mysql|mysqli|mysql2|wf_users|wf_logs|db\(\)|DB_HOST|wpdb|wp_)'

function Resolve-RepoPath([string] $relativePath) {
    return Join-Path $repoRoot $relativePath
}

function Get-ModuleFiles([string] $relativePath) {
    $allFiles = @()
    foreach ($part in ($relativePath -split ';')) {
        $part = $part.Trim()
        if ($part -eq '') {
            continue
        }
        $path = Resolve-RepoPath $part
        if (-not (Test-Path $path)) {
            continue
        }

        $item = Get-Item $path
        if (-not $item.PSIsContainer) {
            if ($scanExtensions -contains $item.Extension.ToLowerInvariant()) {
                $allFiles += $item
            }
            continue
        }

        $allFiles += @(Get-ChildItem -Path $path -Recurse -File -ErrorAction SilentlyContinue |
            Where-Object {
                $scanExtensions -contains $_.Extension.ToLowerInvariant() -and
                $_.FullName -notmatch '\\node_modules\\|\\vendor\\|\\dist\\|\\wp-admin\\|\\wp-includes\\'
            })
    }
    return @($allFiles)
}

function Count-LegacyRefs([array] $files) {
    if ($files.Count -eq 0) {
        return 0
    }

    $matches = Select-String -Path ($files | ForEach-Object { $_.FullName }) -Pattern $legacyPattern -ErrorAction SilentlyContinue
    return @($matches).Count
}

$modules = @(
    @{
        Module = 'Cotacao'
        Path = 'apps/cotacao'
        Current = 'Node.js + Express + Socket.IO + Postgres/Redis + core auth'
        Legacy = 'sem dependencia MySQL no app'
        Target = 'evoluir TypeScript em janela segura'
        Priority = 'moderno'
        Next = 'Manter health/login core e evoluir performance/UX; nao reintroduzir mysql2.'
    },
    @{
        Module = 'Gestao'
        Path = 'apps/gestao'
        Current = 'Node.js + TypeScript + Express + Postgres + core auth'
        Legacy = 'mysql2 para rollback opt-in de login, wf_logs e importacao legada'
        Target = 'Node.js + TypeScript + Postgres puro'
        Priority = '1 - remover legado restante'
        Next = 'Manter GESTAO_AUTH_MYSQL_FALLBACK_ENABLED=false e migrar wf_logs/importacao legada para core_audit_logs.'
    },
    @{
        Module = 'Pedidos'
        Path = 'apps/pedidos'
        Current = 'Node.js + TypeScript + Express + Postgres da Gestao + core auth'
        Legacy = 'sem dependencia MySQL no app'
        Target = 'Manter Postgres puro + core auth/auditoria'
        Priority = 'moderno'
        Next = 'Validar health, badge e rotinas n8n/Miauby sem reintroduzir mysql2.'
    },
    @{
        Module = 'Tarefa'
        Path = 'apps/tarefa'
        Current = 'Node.js + TypeScript + Express + Postgres + core auth'
        Legacy = 'MySQL legado opcional por flags de rollback/import/log'
        Target = 'Node.js + TypeScript + Postgres puro'
        Priority = '2 - validar corte core'
        Next = 'Validar TAREFA_AUTH_PROVIDER=core como default e desligar legado MySQL de dados por flags apos paridade.'
    },
    @{
        Module = 'Codigos'
        Path = 'site/codigos assets;apps/codigos'
        Current = 'Node.js + TypeScript + Postgres'
        Legacy = 'MySQL legado opcional por flags CODIGOS_LEGACY_MYSQL_*'
        Target = 'Postgres puro + core auth/auditoria'
        Priority = '3 - em corte'
        Next = 'Observar /codigos/ no VPS e validar Miauby por CODIGOS_INTERNAL_TOKEN antes de desligar flags legadas.'
    },
    @{
        Module = 'XP'
        Path = 'site/xp assets/uploads;apps/xp'
        Current = 'Node.js + TypeScript + Postgres'
        Legacy = 'MySQL legado opcional por flags XP_LEGACY_MYSQL_*'
        Target = 'Postgres puro + core auth/auditoria'
        Priority = '4 - em corte'
        Next = 'Observar /xp/ no VPS e desligar flags legadas depois de paridade estavel.'
    },
    @{
        Module = 'Financeiro'
        Path = 'site/financeiro;apps/financeiro'
        Current = 'Node.js + TypeScript + Express + Postgres oficial'
        Legacy = 'MySQL opcional para importacao/espelho FINANCEIRO_LEGACY_MYSQL_*'
        Target = 'Postgres puro + core auth/auditoria'
        Priority = '5 - validar corte'
        Next = 'Validar /financeiro/ no VPS, checksums por dia/tipo e Pix CNPJ via Miauby antes de desligar espelho MySQL.'
    },
    @{
        Module = 'Usuarios'
        Path = 'apps/usuarios'
        Current = 'Node.js + TypeScript + Express + Postgres core'
        Legacy = 'sem MySQL operacional para usuarios novos'
        Target = 'enforcement gradual por modulo'
        Priority = 'moderno'
        Next = 'Validar /usuarios/health, login admin, vinculo XP e auditoria; depois aplicar permissoes modulo por modulo.'
    },
    @{
        Module = 'Cashback'
        Path = 'site/cashback;apps/cashback'
        Current = 'Node.js + TypeScript + Express + Postgres + core auth'
        Legacy = 'MySQL legado opcional por flags CASHBACK_LEGACY_MYSQL_*'
        Target = 'Postgres puro + core auth/auditoria'
        Priority = '6 - validar corte'
        Next = 'Validar /cashback/ no VPS, contagens, saldos por cliente, CSV, mensagens e autoteste antes de desligar espelho MySQL.'
    },
    @{
        Module = 'Miauby interno'
        Path = 'site/miauw'
        Current = 'PHP procedural + Node agent sombra + core auth'
        Legacy = 'miauw_* em MySQL; prefixo tecnico legado; memoria curta ja tem ponte Postgres'
        Target = 'apps/miauby + Postgres wimifarma_miauby com alias/fallback miauw'
        Priority = '7 - acoplado ao agente'
        Next = 'Seguir docs/28-miauby-migracao.md: aliases primeiro, Postgres sombra, Node em sombra e confirmacoes preservadas.'
    },
    @{
        Module = 'Miauby WhatsApp'
        Path = 'apps/miauw-whatsapp'
        Current = 'Node.js + TypeScript + Postgres'
        Legacy = 'sem MySQL operacional'
        Target = 'manter e ampliar automacoes'
        Priority = 'moderno'
        Next = 'Apenas evoluir endpoints/automacoes; nao precisa migracao de stack.'
    },
    @{
        Module = 'Home publica'
        Path = 'site/home.php'
        Current = 'PHP estatico/desacoplado do WordPress'
        Legacy = 'PHP simples, sem banco direto'
        Target = 'pode ficar estatico ou virar Node depois'
        Priority = 'baixo'
        Next = 'Nao mexer ate a troca do WordPress/site publico ser decidida.'
    },
    @{
        Module = 'WordPress'
        Path = 'site/wp-config.php'
        Current = 'WordPress + PHP + MySQL wimifarma_wp'
        Legacy = 'dependencia natural do WordPress em MySQL'
        Target = 'substituir/desacoplar se a meta for zero MySQL'
        Priority = 'ultimo / decisao de produto'
        Next = 'Nao converter WordPress para Postgres; planejar substituicao do site publico.'
    }
)

$rows = foreach ($module in $modules) {
    $files = Get-ModuleFiles $module.Path
    [PSCustomObject] @{
        Module = $module.Module
        Path = $module.Path
        Current = $module.Current
        Legacy = $module.Legacy
        Target = $module.Target
        Priority = $module.Priority
        FilesScanned = $files.Count
        LegacyRefs = Count-LegacyRefs $files
        Next = $module.Next
    }
}

if ($Json) {
    $rows | ConvertTo-Json -Depth 4
    exit 0
}

$rows |
    Sort-Object Priority, Module |
    Format-Table Module, Current, Legacy, Target, Priority, FilesScanned, LegacyRefs -AutoSize

Write-Host ''
Write-Host 'Proximos passos recomendados:' -ForegroundColor Cyan
foreach ($row in ($rows | Sort-Object Priority, Module)) {
    Write-Host ("- {0}: {1}" -f $row.Module, $row.Next)
}
