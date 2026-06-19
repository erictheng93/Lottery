[CmdletBinding()]
param(
    [string]$IngestUrl,
    [string]$IngestSecret,
    [int]$ScrapeIntervalSeconds = 60,
    [int]$BackfillRange = 5,
    [int]$FetchTimeoutMs = 15000,
    [switch]$Reconfigure,
    [switch]$NoPrompt
)

$ErrorActionPreference = 'Stop'

function Assert-Command {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$InstallHint
    )

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name was not found. $InstallHint"
    }
}

function Read-PlainValue {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Prompt,
        [string]$Provided
    )

    if ($Provided) {
        return $Provided
    }
    if ($NoPrompt) {
        throw "$Name is required. Pass -$Name or remove -NoPrompt."
    }

    $value = Read-Host $Prompt
    if (-not $value) {
        throw "$Name cannot be empty."
    }
    return $value
}

function Read-SecretValue {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Prompt,
        [string]$Provided
    )

    if ($Provided) {
        return $Provided
    }
    if ($NoPrompt) {
        throw "$Name is required. Pass -$Name or remove -NoPrompt."
    }

    $secure = Read-Host $Prompt -AsSecureString
    if ($secure.Length -eq 0) {
        throw "$Name cannot be empty."
    }

    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
}

function ConvertTo-DotEnvValue {
    param([Parameter(Mandatory = $true)][string]$Value)
    if ($Value -match "[`r`n]") {
        throw "Environment values cannot contain newlines."
    }
    return '"' + ($Value -replace '\\', '\\' -replace '"', '\"') + '"'
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir '..')
$scraperDir = Join-Path $repoRoot 'packages\scraper'
$envPath = Join-Path $scraperDir '.env'
$composePath = Join-Path $scraperDir 'docker-compose.yml'

Assert-Command -Name 'docker' -InstallHint 'Install Docker Desktop or Docker Engine with the Compose plugin, then run this script again.'

& docker version *> $null
if ($LASTEXITCODE -ne 0) {
    throw 'Docker is installed but not running. Start Docker Desktop or the Docker service, then run this script again.'
}

& docker compose version *> $null
if ($LASTEXITCODE -ne 0) {
    throw 'Docker Compose plugin is not available. Install/update Docker Desktop or Docker Engine Compose plugin.'
}

if (-not (Test-Path $composePath)) {
    throw "Compose file not found: $composePath"
}

if ((-not (Test-Path $envPath)) -or $Reconfigure) {
    Write-Host 'Creating scraper .env configuration...'
    $resolvedIngestUrl = Read-PlainValue `
        -Name 'IngestUrl' `
        -Prompt 'Pages ingest URL, for example https://your-domain.pages.dev/api/internal/ingest' `
        -Provided $IngestUrl
    $resolvedIngestSecret = Read-SecretValue `
        -Name 'IngestSecret' `
        -Prompt 'INGEST_SECRET, same value configured in Cloudflare Pages' `
        -Provided $IngestSecret

    $envLines = @(
        'SOURCE_BASE_URL=https://open-lat.inja777.com',
        "INGEST_URL=$(ConvertTo-DotEnvValue $resolvedIngestUrl)",
        "INGEST_SECRET=$(ConvertTo-DotEnvValue $resolvedIngestSecret)",
        "SCRAPE_INTERVAL_SECONDS=$ScrapeIntervalSeconds",
        "BACKFILL_RANGE=$BackfillRange",
        "FETCH_TIMEOUT_MS=$FetchTimeoutMs"
    )
    Set-Content -LiteralPath $envPath -Value $envLines -Encoding UTF8
    Write-Host "Wrote $envPath"
}
else {
    Write-Host "Using existing $envPath. Pass -Reconfigure to regenerate it."
}

Push-Location $scraperDir
try {
    Write-Host 'Building and starting lottery-scraper with Docker Compose...'
    & docker compose --env-file .env -f docker-compose.yml up -d --build
    if ($LASTEXITCODE -ne 0) {
        throw 'docker compose up failed.'
    }

    Write-Host ''
    Write-Host 'Container status:'
    & docker compose -f docker-compose.yml ps

    Write-Host ''
    Write-Host 'Deployment complete.'
    Write-Host 'Tail logs with: docker logs -f lottery-scraper'
    Write-Host 'Restart with:   docker compose -f packages\scraper\docker-compose.yml up -d --build'
}
finally {
    Pop-Location
}
