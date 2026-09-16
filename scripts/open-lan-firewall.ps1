#requires -RunAsAdministrator
# Allow this PC's LAN (192.168.18.0/24) to ping and hit Next.js :3000.
#   powershell -ExecutionPolicy Bypass -File .\scripts\open-lan-firewall.ps1

$ErrorActionPreference = "Continue"
$logDir = Join-Path $env:LOCALAPPDATA "CreatorOS\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir "firewall-lan.log"

function Log($msg) {
  $line = "{0} {1}" -f (Get-Date).ToString("s"), $msg
  Add-Content -Path $log -Value $line -Encoding UTF8
  Write-Host $line
}

Log "=== open-lan-firewall ==="

netsh advfirewall firewall delete rule name="CreatorOS Next LAN 3000" | Out-Null
netsh advfirewall firewall add rule name="CreatorOS Next LAN 3000" dir=in action=allow protocol=TCP localport=3000 remoteip=192.168.18.0/24 enable=yes profile=any
Log "TCP 3000 rule exit=$LASTEXITCODE"

netsh advfirewall firewall delete rule name="CreatorOS ICMP LAN" | Out-Null
netsh advfirewall firewall add rule name="CreatorOS ICMP LAN" dir=in action=allow protocol=icmpv4:8,any remoteip=192.168.18.0/24 enable=yes profile=any
Log "ICMP echo rule exit=$LASTEXITCODE"

try {
  Set-NetConnectionProfile -InterfaceAlias Ethernet -NetworkCategory Private
  Log "Ethernet NetworkCategory=Private"
} catch {
  Log "Ethernet Private failed: $($_.Exception.Message)"
}

Get-NetFirewallRule -DisplayName "CreatorOS*" | Format-Table DisplayName, Enabled, Direction, Action, Profile -AutoSize | Out-String | ForEach-Object { Log $_.TrimEnd() }
Log "DONE — from Mac: ping 192.168.18.36 then http://192.168.18.36:3000"
Start-Sleep -Seconds 8
