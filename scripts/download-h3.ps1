# Download MiniMax H3 weights into native ComfyUI models/. Resume-safe.
# Does NOT clone the 318GB repo.

$ErrorActionPreference = "Stop"
$root = Join-Path $env:LOCALAPPDATA "Programs\ComfyUI\models"
$base = "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main"

$files = @(
  @{ Rel = "diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors" },
  @{ Rel = "diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors" },
  @{ Rel = "text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors" },
  @{ Rel = "vae/minimax_h3_video_vae_fp16.safetensors" },
  @{ Rel = "vae/minimax_h3_audio_vae_fp32.safetensors" }
)

function Get-File([string]$rel) {
  $dest = Join-Path $root ($rel -replace "/", [IO.Path]::DirectorySeparatorChar)
  $dir = Split-Path $dest -Parent
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $url = "$base/$rel"
  Write-Host ("==> " + $rel)
  if ((Test-Path $dest) -and ((Get-Item $dest).Length -gt 1MB)) {
    Write-Host ("    resume/exists " + [math]::Round((Get-Item $dest).Length/1GB, 2) + " GB")
  }
  & curl.exe -L --fail --retry 8 --retry-all-errors --retry-delay 5 -C - --output $dest $url
  if ($LASTEXITCODE -ne 0) { throw "download failed: $rel exit $LASTEXITCODE" }
  Write-Host ("    ok " + [math]::Round((Get-Item $dest).Length/1GB, 2) + " GB")
}

foreach ($f in $files) { Get-File $f.Rel }
Write-Host "H3 weights done."
