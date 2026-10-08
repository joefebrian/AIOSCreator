# Start local ComfyUI API on 8188 (native, no Docker).
#   .\start-comfyui.ps1           foreground (this terminal)
#   .\start-comfyui.ps1 -Detach   background, skip if already up (login / focus-dev)

param([switch]$Detach)

$ErrorActionPreference = "Stop"

function Test-ComfyUp {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:8188/system_stats" -UseBasicParsing -TimeoutSec 2
    return ($r.StatusCode -eq 200)
  } catch {
    return $false
  }
}

function Get-ComfyProcess {
  Get-CimInstance Win32_Process -Filter "Name = 'python.exe' OR Name = 'pythonw.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and ($_.CommandLine -match "main\.py") -and ($_.CommandLine -match "8188") }
}

$comfy = Join-Path $env:LOCALAPPDATA "Programs\ComfyUI"
$py = Join-Path $comfy ".venv\Scripts\python.exe"
if (-not (Test-Path $py)) { throw "ComfyUI venv missing. Install torch first." }

if (Test-ComfyUp) {
  Write-Host "ComfyUI already on http://127.0.0.1:8188"
  exit 0
}

if (Get-ComfyProcess) {
  Write-Host "ComfyUI process already starting - skip duplicate"
  exit 0
}

# T0 3060 12GB: --disable-smart-memory pinned the 5GB video VAE and OOM'd 640 I2V at sampler step 0.
# --reserve-vram 3 + smart unload is the path that finished 640×1152×124.
$argv = "main.py --listen 127.0.0.1 --port 8188 --preview-method auto --disable-auto-launch --lowvram --reserve-vram 3"

if ($Detach) {
  $logDir = Join-Path $env:LOCALAPPDATA "ComfyUI-logs"
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  $log = Join-Path $logDir "comfyui.log"
  $runner = Join-Path $logDir "run-comfyui.cmd"
  @(
    "@echo off",
    "cd /d `"$comfy`"",
    "`"$py`" $argv >> `"$log`" 2>&1"
  ) | Set-Content -Path $runner -Encoding ASCII
  # WMI Create so the process is not a child of the Grok job object
  # (Start-Process descendants die when the session wrapper hits max_runtime).
  $created = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine      = "cmd.exe /c `"$runner`""
    CurrentDirectory = $comfy
  }
  if ($created.ReturnValue -ne 0) { throw "Win32_Process.Create failed: $($created.ReturnValue)" }
  Write-Host "ComfyUI starting detached on :8188 (pid $($created.ProcessId))"
  Write-Host "Log: $log"
  exit 0
}

Set-Location $comfy
& $py main.py --listen 127.0.0.1 --port 8188 --preview-method auto --disable-auto-launch --lowvram --reserve-vram 3
