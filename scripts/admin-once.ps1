# Run once: right-click PowerShell → Run as administrator → 
#   powershell -ExecutionPolicy Bypass -File .\scripts\admin-once.ps1
# Enables Windows long paths. Optionally installs VS Build Tools (C++).

#requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'

New-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' `
  -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force | Out-Null
Write-Host "LongPathsEnabled = 1"

$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (-not (Test-Path $vswhere)) {
  Write-Host "Installing VS 2022 Build Tools (C++ workload) — this takes several minutes..."
  winget install --id Microsoft.VisualStudio.2022.BuildTools -e --accept-package-agreements --accept-source-agreements --disable-interactivity --override "--wait --quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
} else {
  Write-Host "VS installer already present — skip Build Tools"
}

# Defender skip-hitch on the two workloads we care about.
foreach ($p in @(
  "C:\Users\USER\Grok",
  "C:\Users\USER\AppData\Local\Programs\ComfyUI",
  "C:\Users\USER\AppData\Local\Programs\nodejs"
)) {
  if (Test-Path $p) {
    Add-MpPreference -ExclusionPath $p -ErrorAction SilentlyContinue
    Write-Host "Defender exclude: $p"
  }
}

powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c
Write-Host "Power plan: High performance"

# Superfetch / SysMain fights Comfy + node on a 44c Xeon. Hardware-accelerated GPU scheduling on.
Set-Service -Name SysMain -StartupType Manual -ErrorAction SilentlyContinue
Stop-Service SysMain -Force -ErrorAction SilentlyContinue
Set-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers" -Name HwSchMode -Value 2 -Type DWord -ErrorAction SilentlyContinue
Write-Host "SysMain stopped (Manual). HwSchMode=2"

Write-Host "Done. Reboot is not required for long paths; new terminals pick it up. Build Tools may need a new terminal."
Write-Host "Also run: scripts\focus-dev.ps1 each session (user-level is enough for priority + Game DVR)."
