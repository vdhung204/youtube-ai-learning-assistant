[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$venvPython = Join-Path (Split-Path $PSScriptRoot -Parent) 'local-rag-service/.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $venvPython)) { throw 'Local service virtual environment is missing.' }
& $venvPython (Join-Path $PSScriptRoot 'local_service.py') stop
if ($LASTEXITCODE -ne 0) { throw 'Local service did not stop. See the message above.' }
