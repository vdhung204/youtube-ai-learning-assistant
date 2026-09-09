[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$venvPython = Join-Path (Split-Path $PSScriptRoot -Parent) 'local-rag-service/.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $venvPython)) { throw 'Run scripts/setup-local-service.ps1 first.' }
& $venvPython (Join-Path $PSScriptRoot 'local_service.py') start
if ($LASTEXITCODE -ne 0) { throw 'Local service did not start. See the message above.' }
