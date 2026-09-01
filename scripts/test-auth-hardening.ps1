$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$failures = [System.Collections.Generic.List[string]]::new()

function Assert-FileContains {
    param(
        [Parameter(Mandatory = $true)][string] $RelativePath,
        [Parameter(Mandatory = $true)][string] $Pattern,
        [Parameter(Mandatory = $true)][string] $Message
    )

    $fullPath = Join-Path $projectRoot $RelativePath
    $content = Get-Content -Raw -LiteralPath $fullPath
    if ($content -notmatch $Pattern) {
        $failures.Add("${RelativePath}: ${Message}")
    }
}

function Assert-FileExcludes {
    param(
        [Parameter(Mandatory = $true)][string] $RelativePath,
        [Parameter(Mandatory = $true)][string] $Pattern,
        [Parameter(Mandatory = $true)][string] $Message
    )

    $fullPath = Join-Path $projectRoot $RelativePath
    $content = Get-Content -Raw -LiteralPath $fullPath
    if ($content -match $Pattern) {
        $failures.Add("${RelativePath}: ${Message}")
    }
}

Assert-FileContains `
    -RelativePath 'site/home.php' `
    -Pattern "require_once __DIR__ \. '/home-auth-security\.php';" `
    -Message 'a Home deve carregar a camada central de protecao do login'
Assert-FileContains `
    -RelativePath 'site/home.php' `
    -Pattern 'wf_home_login_wait_seconds\(\$user\)' `
    -Message 'o login deve consultar o limitador antes de autenticar'
Assert-FileContains `
    -RelativePath 'site/home.php' `
    -Pattern 'wf_home_register_login_failure\(\$user\)' `
    -Message 'falhas de login devem alimentar o limitador persistente'
Assert-FileContains `
    -RelativePath 'site/home.php' `
    -Pattern 'wf_home_clear_login_rate_limit\(\$user\)' `
    -Message 'um login valido deve limpar o bloqueio da identidade correta'
Assert-FileContains `
    -RelativePath 'site/home-auth-security.php' `
    -Pattern 'wf_home_is_trusted_proxy\(\$remote\)' `
    -Message 'cabecalhos de IP devem ser aceitos somente do proxy interno'
Assert-FileExcludes `
    -RelativePath 'site/home.php' `
    -Pattern 'WIMIFARMA_HOME_LOGIN_(USER|PASSWORD)' `
    -Message 'a Home nao pode manter credencial paralela ao core Postgres'

Assert-FileExcludes `
    -RelativePath 'site/home-sso-lib.php' `
    -Pattern 'WIMIFARMA_HOME_LOGIN_PASSWORD' `
    -Message 'senha de login nao pode servir como segredo de assinatura SSO'
Assert-FileContains `
    -RelativePath 'site/home-sso-lib.php' `
    -Pattern 'strlen\(\$value\) >= 32' `
    -Message 'o segredo SSO deve exigir pelo menos 32 caracteres'

$fallbackFiles = @(
    'apps/financeiro/src/server.ts',
    'apps/gestao/src/server.ts',
    'apps/pedidos/src/server.ts',
    'apps/tarefa/src/server.ts',
    'apps/usuarios/src/server.ts',
    'apps/xp/src/server.ts',
    'site/miauw/miauw-funcoes.php',
    'site/tarefa/tarefa-funcoes.php'
)

foreach ($relativePath in $fallbackFiles) {
    Assert-FileExcludes `
        -RelativePath $relativePath `
        -Pattern '(?is)timingSafeStringEqual\s*\(\s*password\s*,\s*[''"]adm[''"]|hash_equals\s*\(\s*[''"]adm[''"]\s*,\s*\$password' `
        -Message 'senha fixa adm nao pode autenticar nenhuma conta'
}

$nodeServerFiles = Get-ChildItem -LiteralPath (Join-Path $projectRoot 'apps') -Filter 'server.*' -File -Recurse |
    Where-Object { $_.Extension -in @('.ts', '.js') -and $_.FullName -notmatch '[\\/]dist[\\/]' }
foreach ($serverFile in $nodeServerFiles) {
    $content = Get-Content -Raw -LiteralPath $serverFile.FullName
    if ($content -match 'secure\s*:\s*false') {
        $relativePath = $serverFile.FullName.Substring($projectRoot.Length).TrimStart([char[]] @('\', '/'))
        $failures.Add("${relativePath}: cookie de sessao nao pode ficar permanentemente sem Secure")
    }
    if ($content -match 'secure\s*:\s*[''"]auto[''"]' -and $content -notmatch 'app\.set\([''"]trust proxy[''"]') {
        $relativePath = $serverFile.FullName.Substring($projectRoot.Length).TrimStart([char[]] @('\', '/'))
        $failures.Add("${relativePath}: cookie Secure automatico exige trust proxy configurado")
    }
}

if ($failures.Count -gt 0) {
    Write-Error ("Falhas de hardening de autenticacao:`n- " + ($failures -join "`n- "))
}

Write-Output 'Hardening de autenticacao validado.'
