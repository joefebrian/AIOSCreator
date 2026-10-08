# Weekdays: hibernate 04:00, wake 08:00.
# Saturday and Sunday: hibernate 03:00, stay off until 22:00.
# Run once: powershell -ExecutionPolicy Bypass -File .\register-schedule.ps1

$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
$start = Join-Path $here "start-stack.ps1"
$sleep = Join-Path $here "sleep-night.ps1"
$ps = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$weekdays = @("Monday", "Tuesday", "Wednesday", "Thursday", "Friday")
$weekend = @("Saturday", "Sunday")

function Register-CreatorTask([string]$name, [datetime]$at, [string[]]$days, [string]$script, [bool]$wake) {
  $arg = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`""
  $action = New-ScheduledTaskAction -Execute $ps -Argument $arg
  $trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $days -At $at
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries
  $settings.StopIfGoingOnBatteries = $false
  if ($wake) { $settings.WakeToRun = $true }
  Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
  Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings | Out-Null
}

Unregister-ScheduledTask -TaskName "CreatorOS-Sleep-0300" -Confirm:$false -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName "CreatorOS-Sleep-0400-today" -Confirm:$false -ErrorAction SilentlyContinue
Register-CreatorTask "CreatorOS-Sleep-0400" ([datetime]"04:00") $weekdays $sleep $false
Register-CreatorTask "CreatorOS-Wake-0800" ([datetime]"08:00") $weekdays $start $true
Register-CreatorTask "CreatorOS-Sleep-Weekend-0300" ([datetime]"03:00") $weekend $sleep $false
Register-CreatorTask "CreatorOS-Wake-Weekend-2200" ([datetime]"22:00") $weekend $start $true

$startup = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup\CreatorOS-stack.cmd"
@(
  "@echo off",
  "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$start`""
) | Set-Content -Path $startup -Encoding ASCII

Get-ScheduledTask | Where-Object { $_.TaskName -like "CreatorOS-*" } | Format-Table TaskName,State
Write-Host "Startup: $startup"
Write-Host "Mon-Fri 04:00 hibernate, 08:00 wake. Sat-Sun 03:00 hibernate, off until 22:00 wake."
Write-Host "Not a full shutdown. A cold power-off cannot self-boot at 08:00 without BIOS RTC."
