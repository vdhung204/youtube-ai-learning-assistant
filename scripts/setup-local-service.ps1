[CmdletBinding()]
param(
    [string]$Python = '',
    [switch]$SkipModelPreparation
)
$ErrorActionPreference = 'Stop'
$serviceRoot = Join-Path (Split-Path $PSScriptRoot -Parent) 'local-rag-service'
$venvRoot = Join-Path $serviceRoot '.venv'

if ($Python) {
    $pythonCommand = $Python
    $pythonArguments = @()
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    $pythonCommand = 'python'
    $pythonArguments = @()
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
    $pythonCommand = 'py'
    $pythonArguments = @('-3')
} else {
    throw 'Python 3.11+ is required. Install Python or pass -Python with its executable path.'
}

& $pythonCommand @pythonArguments -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)'
if ($LASTEXITCODE -ne 0) { throw 'Python 3.11+ is required.' }

$venvPython = Join-Path $venvRoot 'Scripts/python.exe'
$venvUsable = $false
if (Test-Path -LiteralPath $venvPython) {
    try {
        & $venvPython -c 'import sys; sys.exit(0)' 2>$null
        $venvUsable = $LASTEXITCODE -eq 0
    } catch {
        $venvUsable = $false
    }
}
if (-not $venvUsable) {
    if (Test-Path -LiteralPath $venvRoot) {
        $expectedVenv = [System.IO.Path]::GetFullPath((Join-Path $serviceRoot '.venv'))
        $actualVenv = [System.IO.Path]::GetFullPath($venvRoot)
        if ($actualVenv -ne $expectedVenv -or -not $actualVenv.StartsWith([System.IO.Path]::GetFullPath($serviceRoot))) {
            throw 'Refusing to replace a virtual environment outside local-rag-service.'
        }
        Write-Host 'Existing virtual environment is broken; recreating it.'
        Remove-Item -LiteralPath $actualVenv -Recurse -Force
    }
    & $pythonCommand @pythonArguments -m venv $venvRoot
    if ($LASTEXITCODE -ne 0) { throw 'Cannot create virtual environment.' }
}
& $venvPython -m pip install -r (Join-Path $PSScriptRoot 'requirements-local-service.txt')
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check network access and retry setup.' }
& $venvPython -m pip install -r (Join-Path $serviceRoot 'app/embedding/requirements-rag.txt')
if ($LASTEXITCODE -ne 0) { throw 'RAG dependency installation failed. Check network access and retry setup.' }

if (-not $SkipModelPreparation) {
    Push-Location $serviceRoot
    try {
        & $venvPython -m app.embedding.prepare_model
        if ($LASTEXITCODE -ne 0) { throw 'Embedding model preparation failed. Check network access and retry setup.' }
    } finally {
        Pop-Location
    }
}

Write-Host 'Setup complete. Local RAG dependencies are installed and the embedding model is ready.'
Write-Host 'Run scripts/start-local-service.ps1.'
