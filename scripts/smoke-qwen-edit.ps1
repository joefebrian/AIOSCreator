# Direct Comfy smoke for Qwen Image Edit 2511. Does not overwrite character plates.
# Graph JSON is a file — do not ConvertTo-Json (PowerShell flattens node links).
$ErrorActionPreference = "Stop"
$comfy = "http://127.0.0.1:8188"
$root = Join-Path $env:LOCALAPPDATA "Programs\ComfyUI"
$src = "C:\Users\USER\Grok\apps\AIOSCreator\data\media\characters\6ce9d670-0a66-4298-93d7-280cd64c7f9d-source.png"
$refName = "creatoros-qwen-smoke.png"
$dest = Join-Path $root "input\$refName"
$jsonPath = Join-Path $PSScriptRoot "qwen-edit-smoke.json"
if (-not (Test-Path $src)) { throw "missing smoke source $src" }
if (-not (Test-Path $jsonPath)) { throw "missing $jsonPath" }
Copy-Item -LiteralPath $src -Destination $dest -Force

$raw = curl.exe -sS -w "`nHTTP:%{http_code}" -X POST "$comfy/prompt" -H "Content-Type: application/json" --data-binary "@$jsonPath"
Write-Host $raw
if ($raw -notmatch "HTTP:200") { throw "queue HTTP failed" }
$id = ([regex]::Match($raw, '"prompt_id":\s*"([^"]+)"')).Groups[1].Value
if (-not $id) { throw "no prompt_id" }
Write-Host "prompt_id=$id"
$deadline = (Get-Date).AddMinutes(20)
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Seconds 4
  $hist = Invoke-RestMethod -Uri "$comfy/history/$id" -TimeoutSec 30
  $entry = $hist.$id
  if (-not $entry) { continue }
  if ($entry.status.status_str -eq "error") { $entry.status | ConvertTo-Json -Depth 6; throw "Comfy execution failed" }
  $imgs = $entry.outputs."14".images
  if ($imgs -and $imgs.Count -gt 0) {
    $fn = $imgs[0].filename
    $sub = $imgs[0].subfolder
    Write-Host "ok $fn subfolder=$sub"
    exit 0
  }
}
throw "smoke timed out"
