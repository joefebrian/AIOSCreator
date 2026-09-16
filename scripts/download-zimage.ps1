# Download Z-Image Turbo (Comfy-Org) into native ComfyUI models/. Resume-safe.
# INT8 ConvRot for RTX 3060 12GB. Reuses existing qwen_3_4b text encoder.

$ErrorActionPreference = "Stop"
$root = Join-Path $env:LOCALAPPDATA "Programs\ComfyUI\models"
$base = "https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files"

$files = @(
  @{ Rel = "diffusion_models/z_image_turbo_int8_convrot.safetensors" },
  @{ Rel = "vae/ae.safetensors" }
)

function Get-File([string]$rel) {
  $dest = Join-Path $root ($rel -replace "/", [IO.Path]::DirectorySeparatorChar)
  $dir = Split-Path $dest -Parent
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $url = "$base/$rel"
  Write-Host ("==> " + $rel)
  if ((Test-Path $dest) -and ((Get-Item $dest).Length -gt 1MB)) {
    Write-Host ("    resume/exists " + [math]::Round((Get-Item $dest).Length / 1MB, 1) + " MB")
  }
  & curl.exe -L --fail --retry 8 --retry-all-errors --retry-delay 5 -C - --output $dest $url
  if ($LASTEXITCODE -ne 0) { throw "download failed: $rel exit $LASTEXITCODE" }
  Write-Host ("    ok " + [math]::Round((Get-Item $dest).Length / 1MB, 1) + " MB")
}

$te = Join-Path $root "text_encoders\qwen_3_4b.safetensors"
if (-not (Test-Path $te)) { throw "missing text_encoders/qwen_3_4b.safetensors (shared with Klein)" }
Write-Host ("TE ok " + [math]::Round((Get-Item $te).Length / 1GB, 2) + " GB")

foreach ($f in $files) { Get-File $f.Rel }
Write-Host "Z-Image Turbo weights done."
