# Silent until H3 weights are complete or the downloader died.
$root = Join-Path $env:LOCALAPPDATA "Programs\ComfyUI\models"
$need = @(
  @{ Rel = "diffusion_models\minimax_h3_fl2va_pruned_int8_convrot.safetensors"; Min = 18GB },
  @{ Rel = "diffusion_models\minimax_h3_ref2va_pruned_int8_convrot.safetensors"; Min = 18GB },
  @{ Rel = "text_encoders\qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors"; Min = 13GB },
  @{ Rel = "vae\minimax_h3_video_vae_fp16.safetensors"; Min = 4GB },
  @{ Rel = "vae\minimax_h3_audio_vae_fp32.safetensors"; Min = 400MB }
)

function Complete {
  foreach ($f in $need) {
    $p = Join-Path $root $f.Rel
    if (-not (Test-Path $p)) { return $false }
    if ((Get-Item $p).Length -lt $f.Min) { return $false }
  }
  return $true
}

while ($true) {
  if (Complete) {
    Write-Host "DONE: MiniMax H3 weights on disk"
    exit 0
  }
  $curl = Get-Process curl -ErrorAction SilentlyContinue
  $ps = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and ($_.CommandLine -match "download-h3.ps1") }
  if (-not $curl -and -not $ps) {
    Write-Host "FAILED: download-h3.ps1 / curl stopped before all weights landed"
    exit 1
  }
  Start-Sleep -Seconds 30
}
