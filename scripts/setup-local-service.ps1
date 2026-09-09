[CmdletBinding()]
param([string]$Python = 'python')
$ErrorActionPreference = 'Stop'
$serviceRoot = Join-Path (Split-Path $PSScriptRoot -Parent) 'local-rag-service'
$venvRoot = Join-Path $serviceRoot '.venv'
& $Python -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)'
if ($LASTEXITCODE -ne 0) { throw 'Python 3.11+ is required.' }
if (-not (Test-Path -LiteralPath (Join-Path $venvRoot 'Scripts/python.exe'))) {
    & $Python -m venv $venvRoot
    if ($LASTEXITCODE -ne 0) { throw 'Cannot create virtual environment.' }
}
$venvPython = Join-Path $venvRoot 'Scripts/python.exe'
& $venvPython -m pip install -r (Join-Path $PSScriptRoot 'requirements-local-service.txt')
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check network access and retry setup.' }
Write-Host 'Setup complete. Run scripts/start-local-service.ps1.'
