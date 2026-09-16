[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$venvPython = Join-Path (Split-Path $PSScriptRoot -Parent) 'local-rag-service/.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $venvPython)) { throw 'Run scripts/setup-local-service.ps1 first.' }
try {
    & $venvPython -c 'import sys; sys.exit(0)' 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Python failed.' }
} catch {
    throw 'The local-service virtual environment is broken. Run scripts/setup-local-service.ps1 again.'
}
if ([string]::IsNullOrWhiteSpace($env:YALA_RAG_FACTORY)) {
    $env:YALA_RAG_FACTORY = 'app.retrieval.facade:create_facade'
}
& $venvPython (Join-Path $PSScriptRoot 'local_service.py') start
if ($LASTEXITCODE -ne 0) { throw 'Local service did not start. See the message above.' }
