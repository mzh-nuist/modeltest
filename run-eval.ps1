param(
  [Parameter(ValueFromRemainingArguments=$true)]
  [string[]]$RunnerArguments
)
$ErrorActionPreference = 'Stop'
Push-Location -LiteralPath $PSScriptRoot
try {
  & python -m runner @RunnerArguments
  $runnerExitCode = $LASTEXITCODE
} finally {
  Pop-Location
}
exit $runnerExitCode
