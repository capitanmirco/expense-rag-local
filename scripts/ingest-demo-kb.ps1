param(
  [string]$OrchestratorUrl = "http://localhost:3001"
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$docPath = Join-Path $scriptDir "..\\data\\demo-kb\\app-demo.md"
$resolved = Resolve-Path $docPath

$text = Get-Content -Path $resolved -Raw

$body = @{
  docs = @(
    @{
      id = "app-demo"
      text = $text
      meta = @{
        source = "data/demo-kb/app-demo.md"
        domain = "app-demo"
      }
    }
  )
} | ConvertTo-Json -Depth 6

Invoke-RestMethod -Method Post -Uri "$OrchestratorUrl/rag/ingest" -ContentType "application/json" -Body $body
