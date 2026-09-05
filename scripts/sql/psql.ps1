<#
    psql.ps1 - run a .sql file against the MedCal database.

    No credentials are stored in this script. The connection string is resolved
    in this order:

      1. $env:DATABASE_URL                (if set)
      2. -EnvFile <path>                  (explicit override)
      3. .env.production                  (the real production env file)
      4. .env.production.local            (local prod-topology smoke test)
      5. .env                             (local dev)

    The password parsed from DATABASE_URL is exported as $env:PGPASSWORD for the
    single psql invocation only, then restored.

    Usage:
      ./scripts/sql/psql.ps1 -File ./scripts/sql/trial-data-wipe.sql
      ./scripts/sql/psql.ps1 -File ./x.sql -EnvFile .env
      $env:DATABASE_URL = 'postgresql://...'; ./scripts/sql/psql.ps1 -File ./x.sql
#>
param(
    [Parameter(Mandatory = $true)][string]$File,
    [string]$EnvFile
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")

function Resolve-DatabaseUrl {
    param([string]$EnvFile)

    if ($env:DATABASE_URL) { return $env:DATABASE_URL }

    $candidates = if ($EnvFile) {
        @($EnvFile)
    } else {
        @(".env.production", ".env.production.local", ".env") |
            ForEach-Object { Join-Path $repoRoot $_ }
    }

    foreach ($path in $candidates) {
        if (-not (Test-Path $path)) { continue }
        $match = Select-String -Path $path -Pattern '^\s*DATABASE_URL\s*=' | Select-Object -First 1
        if (-not $match) { continue }
        $value = ($match.Line -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"').Trim("'")
        if ($value) {
            Write-Host "DATABASE_URL from $path"
            return $value
        }
    }

    throw "DATABASE_URL not found (checked `$env:DATABASE_URL and: $($candidates -join ', '))"
}

function Find-Psql {
    $cmd = Get-Command psql -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $found = Get-ChildItem "C:\Program Files\PostgreSQL", "C:\Program Files (x86)\PostgreSQL" `
        -Filter psql.exe -Recurse -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending | Select-Object -First 1
    if ($found) { return $found.FullName }
    throw "psql.exe not found - add it to PATH or install PostgreSQL client tools"
}

if (-not (Test-Path $File)) { throw "SQL file not found: $File" }

$databaseUrl = Resolve-DatabaseUrl -EnvFile $EnvFile
$uri = [uri]$databaseUrl

$userInfo = $uri.UserInfo -split ':', 2
$pgUser = [uri]::UnescapeDataString($userInfo[0])
$pgPass = if ($userInfo.Count -gt 1) { [uri]::UnescapeDataString($userInfo[1]) } else { $null }
$pgHost = $uri.Host
$pgPort = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
$pgDb   = $uri.AbsolutePath.TrimStart('/')

# This helper runs on the Docker host, so the container-only alias resolves to localhost.
if ($pgHost -eq "host.docker.internal") { $pgHost = "localhost" }

$psqlExe = Find-Psql
Write-Host "psql -> $pgUser@${pgHost}:$pgPort/$pgDb  (file: $File)"

$previousPgPassword = $env:PGPASSWORD
try {
    if ($pgPass) { $env:PGPASSWORD = $pgPass }
    & $psqlExe -h $pgHost -p $pgPort -U $pgUser -d $pgDb -v ON_ERROR_STOP=1 -P pager=off -f $File
    exit $LASTEXITCODE
}
finally {
    $env:PGPASSWORD = $previousPgPassword
}
