"""Download Comfy-Org Qwen-Image-2.1 INT8 pack with HTTP Range resume."""
from __future__ import annotations

import os
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.join(os.environ["LOCALAPPDATA"], "Programs", "ComfyUI", "models")
UA = "creatoros-qwen21/1.0"
CHUNK = 8 * 1024 * 1024

FILES = [
    {
        "name": "qwen_image_2.1_int8_convrot.safetensors",
        "url": "https://huggingface.co/Comfy-Org/Qwen-Image-2.1/resolve/main/diffusion_models/qwen_image_2.1_int8_convrot.safetensors",
        "dest": os.path.join(ROOT, "diffusion_models", "qwen_image_2.1_int8_convrot.safetensors"),
        "size": 7_256_783_064,
    },
    {
        "name": "qwen3vl_8b_int8_convrot.safetensors",
        "url": "https://huggingface.co/Comfy-Org/Qwen-Image-2.1/resolve/main/text_encoders/qwen3vl_8b_int8_convrot.safetensors",
        "dest": os.path.join(ROOT, "text_encoders", "qwen3vl_8b_int8_convrot.safetensors"),
        "size": 9_350_798_360,
    },
    {
        "name": "qwen_image_2.1_vae_bf16.safetensors",
        "url": "https://huggingface.co/Comfy-Org/Qwen-Image-2.1/resolve/main/vae/qwen_image_2.1_vae_bf16.safetensors",
        "dest": os.path.join(ROOT, "vae", "qwen_image_2.1_vae_bf16.safetensors"),
        "size": 675_509_688,
    },
]


def log(msg: str) -> None:
    print(msg, flush=True)


def download(item: dict) -> None:
    dest = item["dest"]
    size = item["size"]
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    have = os.path.getsize(dest) if os.path.isfile(dest) else 0
    if have == size:
        log(f"OK {item['name']} already {have}")
        return
    if have > size:
        log(f"TRIM {item['name']} {have} > {size}")
        os.remove(dest)
        have = 0
    log(f"GET {item['name']} from {have} / {size}")
    headers = {"User-Agent": UA}
    if have:
        headers["Range"] = f"bytes={have}-"
    req = urllib.request.Request(item["url"], headers=headers)
    last = time.time()
    with urllib.request.urlopen(req, timeout=120) as resp:
        mode = "ab" if have and resp.status == 206 else "wb"
        if mode == "wb":
            have = 0
        with open(dest, mode) as out:
            while True:
                buf = resp.read(CHUNK)
                if not buf:
                    break
                out.write(buf)
                have += len(buf)
                now = time.time()
                if now - last >= 10:
                    pct = 100.0 * have / size
                    log(f"  {item['name']} {have}/{size} ({pct:.1f}%)")
                    last = now
    final = os.path.getsize(dest)
    if final != size:
        raise SystemExit(f"SIZE {item['name']} got {final} want {size}")
    log(f"DONE {item['name']} {final}")


def main() -> None:
    for item in FILES:
        for attempt in range(1, 8):
            try:
                download(item)
                break
            except (urllib.error.URLError, TimeoutError, OSError) as e:
                log(f"RETRY {item['name']} #{attempt}: {e}")
                time.sleep(min(30, 3 * attempt))
        else:
            raise SystemExit(f"FAIL {item['name']}")
    log("ALL OK")


if __name__ == "__main__":
    sys.exit(main())
