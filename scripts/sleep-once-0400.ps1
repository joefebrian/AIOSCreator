# Daily sleep is 04:00 now. This one-shot is leftover — just hibernate if invoked.
$ErrorActionPreference = "Continue"
& (Join-Path $PSScriptRoot "sleep-night.ps1")
