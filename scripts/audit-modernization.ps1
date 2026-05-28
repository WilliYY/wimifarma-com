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
        Current = 'Node.js + Express + Socket.IO + Postgres/Redis'
        Legacy = 'mysql2 somente para login em wf_users'
        Target = 'TypeScript + core auth Postgres'
        Priority = '1 - cortar auth depois da sombra'
        Next = 'Observar COTACAO_CORE_AUTH_SHADOW_ENABLED sem divergencias e trocar auth oficial.'
    },
    @{
        Module = 'Gestao'
        Path = 'apps/gestao'
        Current = 'Node.js + TypeScript + Express + Postgres'
        Legacy = 'mysql2 para login, wf_logs e importacao legada'
        Target = 'Node.js + TypeScript + Postgres puro'
        Priority = '1 - cortar auth depois da sombra'
        Next = 'Observar GESTAO_CORE_AUTH_SHADOW_ENABLED e migrar wf_logs para core_audit_logs.'
    },
    @{
        Module = 'Pedidos'
        Path = 'apps/pedidos'
        Current = 'Node.js + TypeScript + Express + Postgres da Gestao'
        Legacy = 'mysql2 para login e wf_logs'
        Target = 'Node.js + TypeScript + Postgres puro'
        Priority = '1 - cortar auth depois da sombra'
        Next = 'Observar PEDIDOS_CORE_AUTH_SHADOW_ENABLED e migrar log curto para auditoria Postgres.'
    },
    @{
        Module = 'Tarefa'
        Path = 'apps/tarefa'
        Current = 'Node.js + TypeScript + Express + Postgres'
        Legacy = 'MySQL legado opcional por flags de rollback/import/log'
        Target = 'Node.js + TypeScript + Postgres puro'
        Priority = '2 - validar corte core'
        Next = 'Validar TAREFA_AUTH_PROVIDER=core e legado MySQL desligado por flags.'
    },
    @{
        Module = 'Codigos'
        Path = 'site/codigos'
        Current = 'PHP procedural + MySQL'
        Legacy = 'wf_codigos_comissao e wf_codigos_blocos'
        Target = 'apps/codigos em Node.js + TypeScript + Postgres'
        Priority = '3 - modulo PHP pequeno'
        Next = 'Migrar depois de Tarefa, preservando blocos, ordem e exclusao logica.'
    },
    @{
        Module = 'XP'
        Path = 'site/xp;apps/xp'
        Current = 'PHP oficial + Node/Postgres sombra'
        Legacy = 'wf_xp_employees, wf_xp_sales, wf_xp_settings'
        Target = 'apps/xp em Node.js + TypeScript + Postgres'
        Priority = '4 - sombra em validacao'
        Next = 'Validar apps/xp com checksum de vendas/XP antes de trocar /xp/.'
    },
    @{
        Module = 'Financeiro'
        Path = 'site/financeiro'
        Current = 'PHP procedural + MySQL'
        Legacy = 'financeiro_* e joins com wf_users'
        Target = 'apps/financeiro em Node.js + TypeScript + Postgres'
        Priority = '5 - critico financeiro'
        Next = 'Migrar somente com backup, checksums de totais e validacao por dia.'
    },
    @{
        Module = 'Cashback'
        Path = 'site/cashback'
        Current = 'PHP procedural + MySQL'
        Legacy = 'wf_clientes, wf_compras, creditos, resgates, settings'
        Target = 'apps/cashback em Node.js + TypeScript + Postgres'
        Priority = '6 - critico cliente/saldo'
        Next = 'Migrar depois de Financeiro, preservando compra -> credito -> resgate.'
    },
    @{
        Module = 'Miauby interno'
        Path = 'site/miauw'
        Current = 'PHP procedural + Node agent sombra'
        Legacy = 'miauw_* em MySQL; memoria curta ja tem ponte Postgres'
        Target = 'apps/miauw-agent + Postgres wimifarma_miauw'
        Priority = '7 - acoplado ao agente'
        Next = 'Migrar conversas/treino/traces por fases, mantendo confirmacoes no fluxo atual.'
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
