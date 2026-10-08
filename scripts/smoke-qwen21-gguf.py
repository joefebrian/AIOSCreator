"""Smoke Qwen-Image-2.1 GGUF Q5_K_M T2I 768x1024 25-step."""
from __future__ import annotations

import json
import time
import urllib.request
from pathlib import Path

COMFY = "http://127.0.0.1:8188"
OUTPUT = Path.home() / "AppData/Local/Programs/ComfyUI/output"


def req(method: str, path: str, data=None, timeout=60):
    body = None if data is None else json.dumps(data).encode()
    r = urllib.request.Request(
        COMFY + path,
        data=body,
        method=method,
        headers={"Content-Type": "application/json"} if body else {},
    )
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        raw = resp.read()
        return json.loads(raw.decode()) if raw else {}


def main() -> None:
    try:
        req("POST", "/free", {"unload_models": True, "free_memory": True})
    except Exception:
        pass
    graph = {
        "1": {"class_type": "UnetLoaderGGUF", "inputs": {"unet_name": "qwen-image-2.1-Q5_K_M.gguf"}},
        "2": {
            "class_type": "CLIPLoader",
            "inputs": {
                "clip_name": "qwen3vl_8b_int8_convrot.safetensors",
                "type": "qwen_image",
                "device": "cpu",
            },
        },
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "qwen_image_2.1_vae_bf16.safetensors"}},
        "4": {
            "class_type": "TextEncodeQwenImage21",
            "inputs": {
                "clip": ["2", 0],
                "prompt": "handheld phone photo, young woman on a city sidewalk at dusk, candid, no text",
                "negative_prompt": "",
                "resolution": 1024,
            },
        },
        "5": {"class_type": "EmptyLatentImage", "inputs": {"width": 768, "height": 1024, "batch_size": 1}},
        "6": {
            "class_type": "KSampler",
            "inputs": {
                "seed": 51,
                "steps": 25,
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
        "8": {"class_type": "SaveImage", "inputs": {"filename_prefix": "qwen21-gguf-smoke", "images": ["7", 0]}},
    }
    queued = req("POST", "/prompt", {"prompt": graph, "client_id": "gguf-smoke"})
    if queued.get("node_errors"):
        raise SystemExit(queued["node_errors"])
    pid = queued["prompt_id"]
    print(f"queued {pid}", flush=True)
    t0 = time.time()
    while time.time() - t0 < 20 * 60:
        hist = req("GET", f"/history/{pid}", timeout=30)
        item = hist.get(pid) or {}
        if (item.get("status") or {}).get("status_str") == "error":
            raise SystemExit(json.dumps(item.get("status"))[:2500])
        for node in (item.get("outputs") or {}).values():
            for img in node.get("images") or []:
                p = OUTPUT / img["filename"]
                print(f"OK {p} ({time.time()-t0:.0f}s)", flush=True)
                return
        time.sleep(4)
    raise SystemExit("timeout")


if __name__ == "__main__":
    main()
