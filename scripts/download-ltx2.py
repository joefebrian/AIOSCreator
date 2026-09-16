"""Download native Comfy LTX-2 19B distilled fp8 + Gemma FP4 (no GGUF, no 2.3)."""
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
        "Lightricks/LTX-2",
        "ltx-2-19b-distilled-fp8.safetensors",
        "checkpoints",
        "ltx-2-19b-distilled-fp8.safetensors",
        25_000_000_000,
    ),
    (
        "Comfy-Org/ltx-2",
        "split_files/text_encoders/gemma_3_12B_it_fp4_mixed.safetensors",
        "text_encoders",
        "gemma_3_12B_it_fp4_mixed.safetensors",
        9_000_000_000,
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
