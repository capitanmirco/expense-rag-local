[CmdletBinding()]
param(
  [switch]$SkipChroma,
  [switch]$StartMcp
)

$root = Resolve-Path (Join-Path $PSScriptRoot "..")

function Escape-PSLiteral([string]$value) {
  return $value -replace "'", "''"
}

function Start-Terminal([string]$title, [string]$command, [string]$workdir) {
  $safeWorkdir = Escape-PSLiteral $workdir
  $safeTitle = Escape-PSLiteral $title
  $cmd = "`$host.UI.RawUI.WindowTitle = '$safeTitle'; Set-Location -LiteralPath '$safeWorkdir'; $command"

  Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", $cmd -WorkingDirectory $workdir | Out-Null
}

if (-not $SkipChroma) {
  $chromaCmd = if (Get-Command chroma -ErrorAction SilentlyContinue) {
    "chroma run --host localhost --port 8000 --path ./data/chroma"
  } else {
    "py -m chroma run --host localhost --port 8000 --path ./data/chroma"
  }
  Start-Terminal "Chroma" $chromaCmd $root
}

if ($StartMcp) {
  Start-Terminal "MCP Server" "Set-Location orchestrator; npm run mcp:dev" $root
}

Start-Terminal "API" "Set-Location api; npm run start:dev" $root
Start-Terminal "Orchestrator" "Set-Location orchestrator; npm run dev" $root
Start-Terminal "Frontend" "Set-Location frontend; npm start" $root

Write-Host "Started services in separate PowerShell windows." -ForegroundColor Green
