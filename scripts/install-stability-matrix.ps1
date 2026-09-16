# Optional model manager. CreatorOS talks to ComfyUI API, not this GUI.
$dest = Join-Path $env:LOCALAPPDATA "Programs\StabilityMatrix"
$zip = Join-Path $env:TEMP "StabilityMatrix-win-x64.zip"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
curl.exe -L --fail -o $zip "https://github.com/LykosAI/StabilityMatrix/releases/download/v2.16.1/StabilityMatrix-win-x64.zip"
Expand-Archive -LiteralPath $zip -DestinationPath $dest -Force
Write-Host "Run: $dest\StabilityMatrix.exe"
