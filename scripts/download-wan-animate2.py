"""Download native Comfy-Org Wan Animate 2 INT8 ConvRot (no GGUF)."""
from __future__ import annotations

import os
import shutil
import sys

os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

from huggingface_hub import hf_hub_download

ROOT = os.path.join(os.environ["LOCALAPPDATA"], "Programs", "ComfyUI", "models")

FILES = [
    (
        "Comfy-Org/Wan-Animate-2",
        "diffusion_models/wan_animate_2_int8_convrot.safetensors",
        "diffusion_models",
        "wan_animate_2_int8_convrot.safetensors",
        16_000_000_000,
    ),
    (
        "Comfy-Org/Wan-Animate-2",
        "loras/lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors",
        "loras",
        "lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors",
        700_000_000,
    ),
    (
        "Comfy-Org/Wan-Animate-2",
        "clip_vision/clip_vision_h.safetensors",
        "clip_vision",
        "clip_vision_h.safetensors",
        1_200_000_000,
    ),
    (
        "Comfy-Org/Wan-Animate-2",
        "vae/Wan2_1_VAE_bf16.safetensors",
        "vae",
        "Wan2_1_VAE_bf16.safetensors",
        200_000_000,
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
