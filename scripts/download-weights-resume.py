"""Resume Wan Animate 2 + LTX Gemma via HTTP Range. Reuses HF incomplete blobs."""
from __future__ import annotations

import os
import shutil
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.join(os.environ["LOCALAPPDATA"], "Programs", "ComfyUI", "models")
HUB = os.path.join(os.environ["USERPROFILE"], ".cache", "huggingface", "hub")
UA = "creatoros-resume/1.0"

FILES = [
    {
        "name": "wan_animate_2_int8_convrot.safetensors",
        "url": "https://huggingface.co/Comfy-Org/Wan-Animate-2/resolve/main/diffusion_models/wan_animate_2_int8_convrot.safetensors",
        "dest": os.path.join(ROOT, "diffusion_models", "wan_animate_2_int8_convrot.safetensors"),
        "size": 16_653_175_528,
        "sha": "0580ecdd65e47e97c30df9670d13a6c4a131d26de5a1faf2ccc78392d5167584",
        "repo": "models--Comfy-Org--Wan-Animate-2",
    },
    {
        "name": "lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors",
        "url": "https://huggingface.co/Comfy-Org/Wan-Animate-2/resolve/main/loras/lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors",
        "dest": os.path.join(ROOT, "loras", "lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors"),
        "size": 738_005_744,
        "sha": "85c4a61c30e0497aa44b91d93a893b624708461a56fe5485183b28fa07e2dfb3",
        "repo": "models--Comfy-Org--Wan-Animate-2",
    },
    {
        "name": "clip_vision_h.safetensors",
        "url": "https://huggingface.co/Comfy-Org/Wan-Animate-2/resolve/main/clip_vision/clip_vision_h.safetensors",
        "dest": os.path.join(ROOT, "clip_vision", "clip_vision_h.safetensors"),
        "size": 1_264_219_396,
        "sha": "64a7ef761bfccbadbaa3da77366aac4185a6c58fa5de5f589b42a65bcc21f161",
        "repo": "models--Comfy-Org--Wan-Animate-2",
    },
    {
        "name": "Wan2_1_VAE_bf16.safetensors",
        "url": "https://huggingface.co/Comfy-Org/Wan-Animate-2/resolve/main/vae/Wan2_1_VAE_bf16.safetensors",
        "dest": os.path.join(ROOT, "vae", "Wan2_1_VAE_bf16.safetensors"),
        "size": 253_806_278,
        "sha": "1ab9a32cc2c740f6e39d80d367ce5dcc28db8c71b79b28670546b8973e9d75f9",
        "repo": "models--Comfy-Org--Wan-Animate-2",
    },
    {
        "name": "ltx-2-19b-distilled-fp8.safetensors",
        "url": "https://huggingface.co/Lightricks/LTX-2/resolve/main/ltx-2-19b-distilled-fp8.safetensors",
        "dest": os.path.join(ROOT, "checkpoints", "ltx-2-19b-distilled-fp8.safetensors"),
        "size": 25_000_000_000,
        "sha": "",
        "repo": "",
        "skip_if_min": 25_000_000_000,
    },
    {
        "name": "gemma_3_12B_it_fp4_mixed.safetensors",
        "url": "https://huggingface.co/Comfy-Org/ltx-2/resolve/main/split_files/text_encoders/gemma_3_12B_it_fp4_mixed.safetensors",
        "dest": os.path.join(ROOT, "text_encoders", "gemma_3_12B_it_fp4_mixed.safetensors"),
        "size": 9_447_702_218,
        "sha": "aaca463d11e6d8d2a4bdb0d6299214c15ef78a3f73e0ef8113d5a9d0219b3f6d",
        "repo": "models--Comfy-Org--ltx-2",
    },
]


def largest_incomplete(repo: str, sha: str) -> str | None:
    if not repo or not sha:
        return None
    blob_dir = os.path.join(HUB, repo, "blobs")
    if not os.path.isdir(blob_dir):
        return None
    hits: list[str] = []
    for name in os.listdir(blob_dir):
        if name.startswith(sha) and (name.endswith(".incomplete") or name == sha):
            hits.append(os.path.join(blob_dir, name))
    if not hits:
        return None
    hits.sort(key=lambda p: os.path.getsize(p), reverse=True)
    return hits[0]


def adopt_part(spec: dict) -> str:
    dest = spec["dest"]
    part = dest + ".part"
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if os.path.exists(part):
        return part
    found = largest_incomplete(spec.get("repo") or "", spec.get("sha") or "")
    if found and os.path.getsize(found) > 0:
        print(f"ADOPT {spec['name']} from {found} {os.path.getsize(found)}", flush=True)
        shutil.move(found, part)
    return part


def download(spec: dict) -> None:
    dest = spec["dest"]
    expected = spec["size"]
    min_ok = spec.get("skip_if_min", expected)
    if os.path.exists(dest) and os.path.getsize(dest) >= min_ok:
        print(f"SKIP {spec['name']} {os.path.getsize(dest)}", flush=True)
        return
    part = adopt_part(spec)
    have = os.path.getsize(part) if os.path.exists(part) else 0
    if have >= expected:
        os.replace(part, dest)
        print(f"OK {dest} {os.path.getsize(dest)}", flush=True)
        return
    print(f"DL {spec['name']} resume={have} target={expected}", flush=True)
    headers = {"User-Agent": UA}
    if have:
        headers["Range"] = f"bytes={have}-"
    req = urllib.request.Request(spec["url"], headers=headers)
    last_report = have
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            mode = "ab" if have else "wb"
            with open(part, mode) as out:
                while True:
                    chunk = resp.read(8 * 1024 * 1024)
                    if not chunk:
                        break
                    out.write(chunk)
                    have += len(chunk)
                    if have - last_report >= 64 * 1024 * 1024:
                        last_report = have
                        pct = 100.0 * have / expected
                        dt = max(time.time() - t0, 1)
                        print(f"PROG {spec['name']} {have}/{expected} {pct:.1f}% {have/dt/1e6:.1f}MB/s", flush=True)
    except urllib.error.HTTPError as err:
        print(f"ERR {spec['name']} HTTP {err.code} {err.reason}", flush=True)
        raise
    got = os.path.getsize(part)
    if got < min_ok:
        print(f"ERR {spec['name']} too small ({got} < {min_ok})", flush=True)
        raise SystemExit(1)
    os.replace(part, dest)
    print(f"OK {dest} {os.path.getsize(dest)}", flush=True)


def main() -> int:
    for spec in FILES:
        download(spec)
    print("ALL_OK", flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception as err:
        print(f"ERR {err}", flush=True)
        raise SystemExit(1)
