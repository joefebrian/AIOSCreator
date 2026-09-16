# Bring up everything https://aioscreator.tailc20c39.ts.net needs.
# Does NOT kill UltraViewer. Safe at login and 08:00 wake.
#   .\start-stack.ps1

$ErrorActionPreference = "Continue"
$logDir = Join-Path $env:LOCALAPPDATA "CreatorOS\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir "stack.log"
$root = Split-Path $PSScriptRoot -Parent
$web = Join-Path $root "apps\web"

function Log($msg) {
  $line = "{0} {1}" -f (Get-Date).ToString("s"), $msg
  Add-Content -Path $log -Value $line -Encoding UTF8
  Write-Host $line
}

function HttpOk($url) {
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 4
    return ($r.StatusCode -ge 200 -and $r.StatusCode -lt 400)
  } catch {
    return $false
  }
}

function Listening($port, $addr) {
  $hits = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq $port }
  if ($addr) { $hits = $hits | Where-Object { $_.LocalAddress -eq $addr } }
  return [bool]$hits
}

Log "=== start-stack ==="

# 1) Power: High Performance + allow wake timers (best-effort, no admin required for some)
cmd /c "powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c" | Out-Null
cmd /c "powercfg /SETACVALUEINDEX SCHEME_CURRENT SUB_SLEEP RTCWAKE 1" | Out-Null
cmd /c "powercfg /SETDCVALUEINDEX SCHEME_CURRENT SUB_SLEEP RTCWAKE 1" | Out-Null
cmd /c "powercfg /SETACVALUEINDEX SCHEME_CURRENT SUB_SLEEP BD3B718A-0680-4D9D-8AB2-E1D2B4AC806D 1" | Out-Null
cmd /c "powercfg /SETACTIVE SCHEME_CURRENT" | Out-Null

# 2) Tailscale (HTTPS serve + SSH TCP)
$ts = "C:\Program Files\Tailscale\tailscale.exe"
if (Test-Path $ts) {
  Start-Service Tailscale -ErrorAction SilentlyContinue
  & $ts up --unattended --accept-routes=false --accept-dns=false --reset 2>$null
  & $ts serve --bg --yes 3000 2>$null
  & $ts serve --bg --yes --tcp=2222 tcp://127.0.0.1:2222 2>$null
  Log "Tailscale serve HTTPS :3000 + TCP 2222"
} else {
  Log "WARN no tailscale.exe"
}

# 3) ComfyUI :8188
$comfyStart = Join-Path $PSScriptRoot "start-comfyui.ps1"
if (Test-Path $comfyStart) {
  powershell -NoProfile -ExecutionPolicy Bypass -File $comfyStart -Detach
  Log "ComfyUI detach requested"
}

# 4) Next.js :3000
if (-not (HttpOk "http://127.0.0.1:3000")) {
  $nextLog = Join-Path $logDir "next.log"
  $nextBin = Join-Path $web "node_modules\next\dist\bin\next"
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $node) { $node = "$env:ProgramFiles\nodejs\node.exe" }
  if ((Test-Path $nextBin) -and (Test-Path $node)) {
    $runner = Join-Path $logDir "run-next.cmd"
    @(
      "@echo off",
      "cd /d `"$web`"",
      "`"$node`" `"$nextBin`" dev --hostname 0.0.0.0 --port 3000 >> `"$nextLog`" 2>&1"
    ) | Set-Content -Path $runner -Encoding ASCII
    Start-Process -FilePath $runner -WorkingDirectory $web -WindowStyle Hidden
    Log "Next.js starting :3000"
  } else {
    Log "WARN Next binary missing ($nextBin)"
  }
} else {
  Log "Next.js already up"
}

# 5) User sshd on 127.0.0.1:2222 (Tailscale Serve TCP forwards here)
$sshd = "C:\Program Files\OpenSSH\sshd.exe"
$sshdConf = Join-Path $env:USERPROFILE ".ssh\sshd_user.conf"
$sshdLog = Join-Path $env:USERPROFILE ".ssh\sshd_user.log"
if ((Test-Path $sshd) -and (Test-Path $sshdConf)) {
  if (-not (Listening 2222 "127.0.0.1")) {
    Start-Process -FilePath $sshd -ArgumentList @("-f", $sshdConf, "-E", $sshdLog) -WindowStyle Hidden
    Log "sshd 127.0.0.1:2222 started"
  } else {
    Log "sshd already listening"
  }
}

# 6) Wait until the public path is actually up
$deadline = (Get-Date).AddMinutes(3)
do {
  $next = HttpOk "http://127.0.0.1:3000"
  $comfy = HttpOk "http://127.0.0.1:8188/system_stats"
  if ($next -and $comfy) { break }
  Start-Sleep -Seconds 3
} while ((Get-Date) -lt $deadline)
Log ("READY next={0} comfy={1} https://aioscreator.tailc20c39.ts.net" -f (HttpOk "http://127.0.0.1:3000"), (HttpOk "http://127.0.0.1:8188/system_stats"))
