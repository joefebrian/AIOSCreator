# Qwen-Image-Edit-2511 native Comfy-Org weights. Resume-safe.
# INT8 ConvRot DiT for RTX 3060 + Lightning 4-step LoRA.

$ErrorActionPreference = "Stop"
$root = Join-Path $env:LOCALAPPDATA "Programs\ComfyUI\models"

$files = @(
  @{
    Url  = "https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_edit_2511_int8_convrot.safetensors"
    Rel  = "diffusion_models/qwen_image_edit_2511_int8_convrot.safetensors"
  },
  @{
    Url  = "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors"
    Rel  = "text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors"
  },
  @{
    Url  = "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors"
    Rel  = "vae/qwen_image_vae.safetensors"
  },
  @{
    Url  = "https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning/resolve/main/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors"
    Rel  = "loras/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors"
  }
)

function Get-File($item) {
  $dest = Join-Path $root ($item.Rel -replace "/", [IO.Path]::DirectorySeparatorChar)
  $dir = Split-Path $dest -Parent
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  Write-Host ("==> " + $item.Rel)
  if ((Test-Path $dest) -and ((Get-Item $dest).Length -gt 1MB)) {
    Write-Host ("    resume/exists " + [math]::Round((Get-Item $dest).Length / 1MB, 1) + " MB")
  }
  & curl.exe -L --fail --retry 8 --retry-all-errors --retry-delay 5 -C - --output $dest $item.Url
  if ($LASTEXITCODE -ne 0) { throw "download failed: $($item.Rel) exit $LASTEXITCODE" }
  Write-Host ("    ok " + [math]::Round((Get-Item $dest).Length / 1MB, 1) + " MB")
}

foreach ($f in $files) { Get-File $f }
Write-Host "Qwen-Image-Edit-2511 weights done."
