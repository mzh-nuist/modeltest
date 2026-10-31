param([int]$Port = 8766)
$ErrorActionPreference = 'Stop'
Push-Location -LiteralPath $PSScriptRoot
try { python -m http.server $Port --bind 127.0.0.1 --directory dist }
finally { Pop-Location }
