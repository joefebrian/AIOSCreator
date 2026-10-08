"""Aluna: dead-front body lock + headshot crop. IDs stay ca92a59c."""
from __future__ import annotations

import json
import shutil
import subprocess
import time
import urllib.request
from pathlib import Path

COMFY = "http://127.0.0.1:8188"
ROOT = Path(r"C:\Users\USER\Grok\apps\AIOSCreator")
MEDIA = ROOT / "data" / "media" / "characters"
CHARS = ROOT / "data" / "db" / "characters.json"
JOBS = ROOT / "data" / "db" / "jobs.json"
INPUT = Path.home() / "AppData/Local/Programs/ComfyUI/input"
OUTPUT = Path.home() / "AppData/Local/Programs/ComfyUI/output"
CID = "ca92a59c-0d7e-4c8e-9d4c-0bb448c70801"
FACE = MEDIA / f"{CID}-identity.png"
FACE_NAME = "aluna-identity.png"
UNET = "qwen_image_2.1_int8_convrot.safetensors"
CLIP = "qwen3vl_8b_int8_convrot.safetensors"
VAE = "qwen_image_2.1_vae_bf16.safetensors"
PROMPT = (
    "Keep the same woman as <image1>: same face, same plus-size body, same long dark wavy hair, "
    "same pink ribbed long-sleeve jumpsuit. "
    "Do NOT copy pose, crop, or camera from <image1>. "
    "POSE REQUIRED: dead-front full-length standing, weight even on both feet, arms relaxed straight down at the sides, "
    "hands empty at the thighs, looking at camera, neutral expression. Head to toes in frame, both feet on the floor. "
    "Not a fashion pose. Not hand in hair. Not one hip popped. Not a 3/4 crop. Not sitting. "
    "Place: plain seamless light-gray studio, even light. Photoreal camera photograph."
)


def log(msg: str) -> None:
    print(msg, flush=True)


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


def wait_prompt(pid: str, timeout=20 * 60) -> Path:
    t0 = time.time()
    while time.time() - t0 < timeout:
        hist = req("GET", f"/history/{pid}", timeout=30)
        item = hist.get(pid) or {}
        if (item.get("status") or {}).get("status_str") == "error":
            raise SystemExit(json.dumps(item.get("status"))[:2000])
        for node in (item.get("outputs") or {}).values():
            for img in node.get("images") or []:
                p = OUTPUT / img["filename"]
                log(f"saved {p} ({time.time()-t0:.0f}s)")
                return p
        time.sleep(4)
    raise SystemExit("timeout")


def main() -> None:
    if not FACE.is_file():
        raise SystemExit(f"missing {FACE}")
    INPUT.mkdir(parents=True, exist_ok=True)
    shutil.copy2(FACE, INPUT / FACE_NAME)
    try:
        req("POST", "/free", {"unload_models": True, "free_memory": True})
        log("freed VRAM")
    except Exception as e:
        log(f"free skip {e}")
    graph = {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": UNET, "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": CLIP, "type": "qwen_image", "device": "cpu"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": VAE}},
        "4": {"class_type": "QwenImage21Cache", "inputs": {"model": ["1", 0], "device": "cpu", "dtype": "int8"}},
        "20": {"class_type": "LoadImage", "inputs": {"image": FACE_NAME}},
        "5": {
            "class_type": "TextEncodeQwenImage21",
            "inputs": {
                "clip": ["2", 0],
                "vae": ["3", 0],
                "prompt": PROMPT,
                "negative_prompt": "",
                "resolution": 768,
                "images.image_1": ["20", 0],
            },
        },
        "9": {"class_type": "EmptyLatentImage", "inputs": {"width": 768, "height": 1280, "batch_size": 1}},
        "6": {
            "class_type": "KSampler",
            "inputs": {
                "seed": 42921,
                "steps": 25,
                "cfg": 1,
                "sampler_name": "euler",
                "scheduler": "simple",
                "denoise": 1,
                "model": ["4", 0],
                "positive": ["5", 0],
                "negative": ["5", 1],
                "latent_image": ["9", 0],
            },
        },
        "7": {"class_type": "VAEDecode", "inputs": {"samples": ["6", 0], "vae": ["3", 0]}},
        "8": {"class_type": "SaveImage", "inputs": {"filename_prefix": "aluna-front", "images": ["7", 0]}},
    }
    queued = req("POST", "/prompt", {"prompt": graph, "client_id": "aluna-front"})
    if queued.get("node_errors"):
        raise SystemExit(queued["node_errors"])
    still = wait_prompt(queued["prompt_id"])
    front = MEDIA / f"{CID}-front.png"
    shutil.copy2(still, front)
    head = MEDIA / f"{CID}-headshot.png"
    vf = r"crop=min(iw\,ih*3/4):ih*0.42:(iw-ow)/2:0"
    r = subprocess.run(["ffmpeg", "-y", "-i", str(FACE), "-vf", vf, str(head)], capture_output=True)
    if r.returncode != 0 or not head.is_file() or head.stat().st_size < 1000:
        log(f"ffmpeg crop fail {r.stderr[-400:]}")
        raise SystemExit("headshot crop failed")
    now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    chars = json.loads(CHARS.read_text(encoding="utf-8"))
    rows = chars["characters"] if isinstance(chars, dict) else chars
    for row in rows:
        if row.get("id") != CID:
            continue
        for s in row.get("slots") or []:
            if s.get("key") == "front":
                s["url"] = f"/api/media/characters/{CID}-front.png"
                s["prompt"] = PROMPT
            if s.get("key") == "headshot":
                s["url"] = f"/api/media/characters/{CID}-headshot.png"
        row["updatedAt"] = now
        break
    if isinstance(chars, dict):
        chars["characters"] = rows
        CHARS.write_text(json.dumps(chars, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    else:
        CHARS.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    jobs = json.loads(JOBS.read_text(encoding="utf-8"))
    arr = jobs["jobs"] if isinstance(jobs, dict) else jobs
    arr.append(
        {
            "id": "aluna-front-repose",
            "module": "production",
            "kind": "character",
            "input": PROMPT,
            "status": "completed",
            "createdAt": now,
            "updatedAt": now,
            "model": "qwen-image-2.1",
            "provider": "comfy",
            "characterId": CID,
            "mediaPath": str(front),
            "mediaUrl": f"/api/media/characters/{CID}-front.png",
        }
    )
    if isinstance(jobs, dict):
        jobs["jobs"] = arr
        JOBS.write_text(json.dumps(jobs, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    log(f"DONE front={front.stat().st_size} headshot={head.stat().st_size}")


if __name__ == "__main__":
    main()
