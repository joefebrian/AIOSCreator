# 04:00 daily: hibernate this PC unless a real GPU job is in Comfy.
# Hibernate (not shutdown) so 08:00 Task Scheduler can wake it.
# Does NOT kill UltraViewer first — machine is going to sleep anyway.

$ErrorActionPreference = "Continue"
$logDir = Join-Path $env:LOCALAPPDATA "CreatorOS\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir "stack.log"

function Log($msg) {
  $line = "{0} {1}" -f (Get-Date).ToString("s"), $msg
  Add-Content -Path $log -Value $line -Encoding UTF8
}

function ComfyBusy {
  try {
    $q = (Invoke-WebRequest -Uri "http://127.0.0.1:8188/queue" -UseBasicParsing -TimeoutSec 5).Content | ConvertFrom-Json
    $run = @($q.queue_running).Count
    $pend = @($q.queue_pending).Count
    return ($run + $pend) -gt 0
  } catch {
    return $false
  }
}

Log "=== sleep-night ==="
if (ComfyBusy) {
  Log "SKIP hibernate: Comfy queue busy"
  exit 0
}

Log "Hibernate now (wake 08:00 via scheduled task)"
Start-Sleep -Seconds 2
shutdown.exe /h
