# Register daily 03:00 hibernate + 08:00 wake+stack.
# Run once: powershell -ExecutionPolicy Bypass -File .\register-schedule.ps1

$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$start = Join-Path $here "start-stack.ps1"
$sleep = Join-Path $here "sleep-night.ps1"
$ps = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"

function Register-CreatorTask([string]$name, [datetime]$at, [string]$script, [bool]$wake) {
  $arg = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`""
  $action = New-ScheduledTaskAction -Execute $ps -Argument $arg
  $trigger = New-ScheduledTaskTrigger -Daily -At $at
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries
  $settings.StopIfGoingOnBatteries = $false
  if ($wake) { $settings.WakeToRun = $true }
  Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
  Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings | Out-Null
}

Register-CreatorTask "CreatorOS-Sleep-0300" ([datetime]"03:00") $sleep $false
Register-CreatorTask "CreatorOS-Wake-0800" ([datetime]"08:00") $start $true

$startup = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup\CreatorOS-stack.cmd"
@(
  "@echo off",
  "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$start`""
) | Set-Content -Path $startup -Encoding ASCII

Get-ScheduledTask | Where-Object { $_.TaskName -like "CreatorOS-*" } | Format-Table TaskName,State
Write-Host "Startup: $startup"
Write-Host "03:00 hibernate (skip if Comfy busy). 08:00 wake + Tailscale HTTPS + Next + Comfy + sshd."
Write-Host "Not a full shutdown. A cold power-off cannot self-boot at 08:00 without BIOS RTC."
