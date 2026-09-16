"""Download native Comfy-Org Wan 2.2 5B + HunyuanVideo 1.5 480p I2V (no GGUF)."""
from __future__ import annotations

import os
import shutil
import sys

from huggingface_hub import hf_hub_download

ROOT = os.path.join(os.environ["LOCALAPPDATA"], "Programs", "ComfyUI", "models")

FILES = [
    (
        "Comfy-Org/Wan_2.2_ComfyUI_Repackaged",
        "split_files/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors",
        "diffusion_models",
        "wan2.2_ti2v_5B_fp16.safetensors",
        9_000_000_000,
    ),
    (
        "Comfy-Org/Wan_2.1_ComfyUI_repackaged",
        "split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors",
        "text_encoders",
        "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
        6_000_000_000,
    ),
    (
        "Comfy-Org/Wan_2.2_ComfyUI_Repackaged",
        "split_files/vae/wan2.2_vae.safetensors",
        "vae",
        "wan2.2_vae.safetensors",
        200_000_000,
    ),
    (
        "Comfy-Org/HunyuanVideo_1.5_repackaged",
        "split_files/diffusion_models/hunyuanvideo1.5_480p_i2v_step_distilled_fp8_scaled.safetensors",
        "diffusion_models",
        "hunyuanvideo1.5_480p_i2v_step_distilled_fp8_scaled.safetensors",
        7_000_000_000,
    ),
    (
        "Comfy-Org/HunyuanVideo_1.5_repackaged",
        "split_files/text_encoders/byt5_small_glyphxl_fp16.safetensors",
        "text_encoders",
        "byt5_small_glyphxl_fp16.safetensors",
        100_000_000,
    ),
    (
        "Comfy-Org/HunyuanVideo_1.5_repackaged",
        "split_files/vae/hunyuanvideo15_vae_fp16.safetensors",
        "vae",
        "hunyuanvideo15_vae_fp16.safetensors",
        100_000_000,
    ),
    (
        "Comfy-Org/sigclip_vision_384",
        "sigclip_vision_patch14_384.safetensors",
        "clip_vision",
        "sigclip_vision_patch14_384.safetensors",
        300_000_000,
    ),
]


def main() -> int:
    for repo, filename, folder, dest_name, min_bytes in FILES:
        dest_dir = os.path.join(ROOT, folder)
        os.makedirs(dest_dir, exist_ok=True)
        dest = os.path.join(dest_dir, dest_name)
        if os.path.exists(dest) and os.path.getsize(dest) >= min_bytes:
            print(f"SKIP {dest_name} {os.path.getsize(dest)}", flush=True)
            continue
        print(f"DL {dest_name} from {repo}", flush=True)
        cached = hf_hub_download(repo_id=repo, filename=filename)
        size = os.path.getsize(cached)
        print(f"CACHED {dest_name} {size}", flush=True)
        if size < min_bytes:
            print(f"ERR {dest_name} too small ({size} < {min_bytes})", flush=True)
            return 1
        shutil.copy2(cached, dest)
        print(f"OK {dest} {os.path.getsize(dest)}", flush=True)
    print("ALL_OK", flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as err:
        print(f"ERR {err}", flush=True)
        raise SystemExit(1)
