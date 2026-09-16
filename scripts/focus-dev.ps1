# Focus this PC on Grok Build + AIOSCreator (Next.js + ComfyUI).
# Safe to re-run. Does NOT kill UltraViewer (remote). Does NOT disable Defender.
# User-level by default. Extra Defender exclusions need Admin.

$ErrorActionPreference = "Continue"

function Test-IsAdmin {
  $principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

Write-Host "=== CreatorOS focus-dev ==="

# 1) High Performance -- Dual Xeon parks cores on Balanced.
$high = "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"
cmd /c "powercfg /setactive $high" | Out-Null
Write-Host ("Power: " + (powercfg /getactivescheme))

# 2) Game DVR / Game Bar overlay off (steals GPU).
New-Item -Path "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\GameDVR" -Force | Out-Null
Set-ItemProperty "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\GameDVR" -Name AppCaptureEnabled -Value 0 -Type DWord
if (Test-Path "HKCU:\System\GameConfigStore") {
  Set-ItemProperty "HKCU:\System\GameConfigStore" -Name GameDVR_Enabled -Value 0 -Type DWord
}
Write-Host "Game DVR: off"

# 3) Stop non-dev extras. Keep UltraViewer + grok + node + python.
$stop = @(
  "M365Copilot",
  "Microsoft365Copilot",
  "SearchApp",
  "YourPhone",
  "PhoneExperienceHost",
  "Widgets",
  "XboxGameBar",
  "GameBar",
  "Cortana",
  "OneDrive.Sync.Service"
)
foreach ($n in $stop) {
  Get-Process -Name $n -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}
Write-Host "Stopped overlay/copilot/search extras (UltraViewer kept)"

# 4) Priority: Grok + Node (Next) + Comfy python. Edge below. Chrome/UltraViewer untouched.
foreach ($n in @("grok", "node", "python", "pythonw")) {
  Get-Process -Name $n -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $_.PriorityClass = "High"
      Write-Host ("  {0} pid {1} -> High" -f $_.Name, $_.Id)
    } catch {
      Write-Host ("  {0} pid {1} priority skip" -f $_.Name, $_.Id)
    }
  }
}
Get-Process -Name "msedge" -ErrorAction SilentlyContinue | ForEach-Object {
  try { $_.PriorityClass = "BelowNormal" } catch {}
}
Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "MicrosoftEdgeAutoLaunch_28CC4C91291F97998E40A29656715B1C" -ErrorAction SilentlyContinue

# 5) Admin extras
if (Test-IsAdmin) {
  $paths = @(
    "C:\Users\USER\Grok",
    "C:\Users\USER\AppData\Local\Programs\ComfyUI",
    "C:\Users\USER\AppData\Local\Programs\nodejs"
  )
  foreach ($p in $paths) {
    if (Test-Path $p) {
      Add-MpPreference -ExclusionPath $p -ErrorAction SilentlyContinue
      Write-Host "Defender exclude: $p"
    }
  }
  Set-Service -Name SysMain -StartupType Manual -ErrorAction SilentlyContinue
  Stop-Service SysMain -Force -ErrorAction SilentlyContinue
  Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers" -Name HwSchMode -Value 2 -Type DWord -ErrorAction SilentlyContinue
  Write-Host "SysMain stopped, HwSchMode set"
} else {
  Write-Host "Not admin - skip Defender exclusions + SysMain. Re-run as Admin for that."
}

# 6) ComfyUI autostart (hidden). Skip if :8188 already up.
$comfyStart = Join-Path $PSScriptRoot "start-comfyui.ps1"
if (Test-Path $comfyStart) {
  & powershell -NoProfile -ExecutionPolicy Bypass -File $comfyStart -Detach
} else {
  Write-Host "start-comfyui.ps1 missing - skip Comfy"
}

Write-Host ""
Write-Host "Leave running: grok, node (Studio), python (ComfyUI), UltraViewer."
Write-Host "Optional: close extra Chrome tabs - not killed automatically."
Write-Host "Done."
