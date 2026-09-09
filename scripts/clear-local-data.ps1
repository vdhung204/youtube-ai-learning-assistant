[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param()
$ErrorActionPreference = 'Stop'
$venvPython = Join-Path (Split-Path $PSScriptRoot -Parent) 'local-rag-service/.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $venvPython)) { throw 'Run scripts/setup-local-service.ps1 first.' }
$cacheTarget = & $venvPython (Join-Path $PSScriptRoot 'local_service.py') cache-path
if ($LASTEXITCODE -ne 0) { throw 'Invalid cache path.' }
Write-Host "Cache target: $cacheTarget"
if ($PSCmdlet.ShouldProcess($cacheTarget, 'Delete project ChromaDB cache')) {
    & $venvPython (Join-Path $PSScriptRoot 'local_service.py') clear
    if ($LASTEXITCODE -ne 0) { throw 'Cache was not cleared. See the message above.' }
}
