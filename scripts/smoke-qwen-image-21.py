"""Smoke Qwen-Image-2.1 T2I 768x1024 25-step, then one still edit."""
from __future__ import annotations

import json
import shutil
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

COMFY = "http://127.0.0.1:8188"
UNET = "qwen_image_2.1_int8_convrot.safetensors"
CLIP = "qwen3vl_8b_int8_convrot.safetensors"
VAE = "qwen_image_2.1_vae_bf16.safetensors"
W, H, STEPS = 768, 1024, 25
INPUT_DIR = Path.home() / "AppData/Local/Programs/ComfyUI/input"
OUTPUT_DIR = Path.home() / "AppData/Local/Programs/ComfyUI/output"
EDIT_SRC = Path(r"C:\Users\USER\Grok\apps\AIOSCreator\data\media\images\qwen-edit-smoke.png")
EDIT_NAME = "qwen21-edit-src.png"


def log(msg: str) -> None:
    print(msg, flush=True)


def req(method: str, path: str, data: dict | None = None, timeout: int = 60):
    body = None if data is None else json.dumps(data).encode()
    r = urllib.request.Request(
        COMFY + path,
        data=body,
        method=method,
        headers={"Content-Type": "application/json"} if body else {},
    )
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def wait_up() -> None:
    for i in range(60):
        try:
            req("GET", "/system_stats", timeout=5)
            log("Comfy up")
            return
        except Exception as e:
            log(f"wait comfy {i}: {e}")
            time.sleep(3)
    raise SystemExit("Comfy did not start")


def queue(graph: dict, prefix: str) -> Path:
    payload = {"prompt": graph, "client_id": "qwen21-smoke"}
    queued = req("POST", "/prompt", payload, timeout=30)
    pid = queued.get("prompt_id")
    if not pid:
        raise SystemExit(f"queue fail {queued}")
    log(f"queued {prefix} {pid}")
    t0 = time.time()
    while True:
        hist = req("GET", f"/history/{pid}", timeout=30)
        item = hist.get(pid) or {}
        status = item.get("status") or {}
        if status.get("status_str") == "error":
            raise SystemExit(f"{prefix} ERROR {json.dumps(status, default=str)[:2000]}")
        for node in (item.get("outputs") or {}).values():
            for img in node.get("images") or []:
                p = OUTPUT_DIR / img["filename"]
                log(f"{prefix} saved {p} ({time.time()-t0:.0f}s)")
                return p
        if time.time() - t0 > 45 * 60:
            raise SystemExit(f"{prefix} timeout")
        time.sleep(5)


def t2i_graph() -> dict:
    prompt = (
        "handheld phone photo, young woman standing on a city sidewalk at dusk, "
        "natural skin pores, streetlights, candid, 3:4 portrait, no text"
    )
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": UNET, "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": CLIP, "type": "qwen_image", "device": "cpu"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": VAE}},
        "4": {
            "class_type": "TextEncodeQwenImage21",
            "inputs": {"clip": ["2", 0], "prompt": prompt, "negative_prompt": "", "resolution": 1024},
        },
        "5": {"class_type": "EmptyLatentImage", "inputs": {"width": W, "height": H, "batch_size": 1}},
        "6": {
            "class_type": "KSampler",
            "inputs": {
                "seed": 21,
                "steps": STEPS,
                "cfg": 1,
                "sampler_name": "euler",
                "scheduler": "simple",
                "denoise": 1,
                "model": ["1", 0],
                "positive": ["4", 0],
                "negative": ["4", 1],
                "latent_image": ["5", 0],
            },
        },
        "7": {"class_type": "VAEDecode", "inputs": {"samples": ["6", 0], "vae": ["3", 0]}},
        "8": {"class_type": "SaveImage", "inputs": {"filename_prefix": "qwen21-t2i-smoke", "images": ["7", 0]}},
    }


def edit_graph() -> dict:
    prompt = (
        "Keep the character and pose in <image1> unchanged, change the background "
        "to a quiet sunset beach, keep face and clothes, natural light"
    )
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": UNET, "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": CLIP, "type": "qwen_image", "device": "cpu"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": VAE}},
        "4": {"class_type": "LoadImage", "inputs": {"image": EDIT_NAME}},
        "5": {
            "class_type": "QwenImage21Cache",
            "inputs": {"model": ["1", 0], "device": "cpu", "dtype": "int8"},
        },
        "6": {
            "class_type": "TextEncodeQwenImage21",
            "inputs": {
                "clip": ["2", 0],
                "vae": ["3", 0],
                "prompt": prompt,
                "negative_prompt": "",
                "resolution": 768,
                "images.image_1": ["4", 0],
            },
        },
        "7": {
            "class_type": "KSampler",
            "inputs": {
                "seed": 22,
                "steps": STEPS,
                "cfg": 1,
                "sampler_name": "euler",
                "scheduler": "simple",
                "denoise": 1,
                "model": ["5", 0],
                "positive": ["6", 0],
                "negative": ["6", 1],
                "latent_image": ["6", 2],
            },
        },
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["7", 0], "vae": ["3", 0]}},
        "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "qwen21-edit-smoke", "images": ["8", 0]}},
    }


def main() -> None:
    wait_up()
    try:
        req("POST", "/free", {"unload_models": True, "free_memory": True}, timeout=30)
        log("freed VRAM")
    except Exception as e:
        log(f"free skip {e}")
    t2i = queue(t2i_graph(), "T2I")
    if not EDIT_SRC.is_file():
        raise SystemExit(f"missing edit still {EDIT_SRC}")
    INPUT_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(EDIT_SRC, INPUT_DIR / EDIT_NAME)
    try:
        req("POST", "/free", {"unload_models": True, "free_memory": True}, timeout=30)
    except Exception:
        pass
    edit = queue(edit_graph(), "EDIT")
    log(f"SMOKE OK t2i={t2i} edit={edit}")


if __name__ == "__main__":
    sys.exit(main())
