$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$patterns = @(
    @{ Name = 'OpenAI/API key pattern'; Regex = 'sk-[A-Za-z0-9_-]{20,}'; IgnoreCase = $false },
    @{ Name = 'Private key block'; Regex = '-----BEGIN (RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----'; IgnoreCase = $false },
    @{ Name = 'JWT-like token'; Regex = 'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}'; IgnoreCase = $false },
    @{ Name = 'Generic secret assignment'; Regex = '(api[_-]?key|secret|token|password|passwd|pwd)[[:space:]]*[:=][[:space:]]*[''"]?[A-Za-z0-9_./+=-]{16,}'; IgnoreCase = $true }
)

$placeholderPattern = '(?i)(example|placeholder|changeme|change_me|dummy|fake|sample|your_|seu_|sua_|valor_|preencher|configure|configurar|opcional|interno|somente|token_equivalente)'
$findings = New-Object System.Collections.Generic.List[string]

foreach ($pattern in $patterns) {
    $grepArgs = @('-C', $repoRoot, 'grep', '--untracked', '-n', '-I', '-E')
    if ($pattern.IgnoreCase) {
        $grepArgs += '-i'
    }
    $grepArgs += @('-e', $pattern.Regex, '--', '.')

    $matches = & git @grepArgs 2>$null
    $exitCode = $LASTEXITCODE

    if ($exitCode -eq 1) {
        continue
    }

    if ($exitCode -ne 0) {
        throw "git grep falhou ao procurar $($pattern.Name)."
    }

    foreach ($match in $matches) {
        $line = [string] $match
        if ($line -match 'allow-secret-scan') {
            continue
        }
        if ($line -match $placeholderPattern) {
            continue
        }
        $findings.Add("$line [$($pattern.Name)]")
    }
}

if ($findings.Count -gt 0) {
    Write-Host 'Possiveis segredos encontrados em arquivos versionados ou prontos para versao:' -ForegroundColor Red
    $findings | Sort-Object -Unique | ForEach-Object { Write-Host " - $_" }
    exit 1
}

Write-Host 'Nenhum segredo obvio encontrado nos arquivos versionados.' -ForegroundColor Green
