"""Qwen 2.1 Kim studio still with long wavy hair, then ReActor headshot."""
from __future__ import annotations

import json
import shutil
import time
import urllib.request
import uuid
from pathlib import Path

COMFY = "http://127.0.0.1:8188"
ROOT = Path(r"C:\Users\USER\Grok\apps\AIOSCreator")
MEDIA = ROOT / "data" / "media" / "characters"
JOBS = ROOT / "data" / "db" / "jobs.json"
CHARS = ROOT / "data" / "db" / "characters.json"
INPUT = Path.home() / "AppData/Local/Programs/ComfyUI/input"
OUTPUT = Path.home() / "AppData/Local/Programs/ComfyUI/output"
CHAR_ID = "b37ac8f2-260f-48b2-a7d9-b5162c055681"
FACE = MEDIA / f"{CHAR_ID}-headshot.png"
FACE_NAME = "kim-headshot.png"
UNET = "qwen_image_2.1_int8_convrot.safetensors"
CLIP = "qwen3vl_8b_int8_convrot.safetensors"
VAE = "qwen_image_2.1_vae_bf16.safetensors"
PROMPT = (
    "Keep the face identity from <image1>. Do not copy clothes or crop from <image1>. "
    "HAIR REQUIRED: long wavy dark-brown hair down past the shoulders, loose, over the chest, "
    "face-framing strands. Not a bob. Not chin-length. Not a pixie. Not a bun. Not tied up. Not short. "
    "Pose: sitting on a low stool, one arm behind her head, head turned softly toward camera, small smile. "
    "Clothes: fitted black spaghetti-strap bustier top and high-waisted beige wide-leg trousers, midriff visible. "
    "Place: dark slate-blue studio wall. "
    "Light: cyan-blue and magenta-purple circular spotlight halo behind her, sharp silhouette shadow to the left. "
    "Photoreal camera photograph, visible pores, not 3D, not CGI, not Pixar."
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


def wait_prompt(pid: str, prefix: str, timeout=20 * 60) -> Path:
    t0 = time.time()
    while time.time() - t0 < timeout:
        hist = req("GET", f"/history/{pid}", timeout=30)
        item = hist.get(pid) or {}
        status = item.get("status") or {}
        if status.get("status_str") == "error":
            raise SystemExit(f"{prefix} ERROR {json.dumps(status)[:2000]}")
        for node in (item.get("outputs") or {}).values():
            for img in node.get("images") or []:
                p = OUTPUT / img["filename"]
                log(f"{prefix} saved {p} ({time.time()-t0:.0f}s)")
                return p
        time.sleep(4)
    raise SystemExit(f"{prefix} timeout")


def queue(graph: dict, prefix: str) -> Path:
    queued = req("POST", "/prompt", {"prompt": graph, "client_id": "kim-longhair"})
    if queued.get("node_errors"):
        raise SystemExit(queued["node_errors"])
    pid = queued["prompt_id"]
    log(f"queued {prefix} {pid}")
    return wait_prompt(pid, prefix)


def save_edit(src: Path, prompt: str, model: str, base: str) -> str:
    edit_id = str(uuid.uuid4())
    short = edit_id[:8]
    dest = MEDIA / f"{CHAR_ID}-edit-{short}.png"
    shutil.copy2(src, dest)
    url = f"/api/media/characters/{CHAR_ID}-edit-{short}.png"
    now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    job_id = str(uuid.uuid4())
    jobs = json.loads(JOBS.read_text(encoding="utf-8"))
    arr = jobs["jobs"] if isinstance(jobs, dict) else jobs
    arr.append(
        {
            "id": job_id,
            "module": "production",
            "kind": "character",
            "input": prompt,
            "status": "completed",
            "createdAt": now,
            "updatedAt": now,
            "model": model,
            "provider": "comfy",
            "characterId": CHAR_ID,
            "mediaPath": str(dest),
            "mediaUrl": url,
        }
    )
    if isinstance(jobs, dict):
        jobs["jobs"] = arr
        JOBS.write_text(json.dumps(jobs, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    else:
        JOBS.write_text(json.dumps(arr, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    chars = json.loads(CHARS.read_text(encoding="utf-8"))
    rows = chars["characters"] if isinstance(chars, dict) else chars
    for row in rows:
        if row.get("id") == CHAR_ID:
            row.setdefault("edits", []).insert(
                0,
                {
                    "id": edit_id,
                    "url": url,
                    "prompt": prompt,
                    "baseUrl": base,
                    "mode": "chat" if model == "qwen-image-2.1" else "face-swap",
                    "jobId": job_id,
                    "model": model,
                    "provider": "comfy",
                    "createdAt": now,
                },
            )
            row["updatedAt"] = now
            break
    if isinstance(chars, dict):
        chars["characters"] = rows
        CHARS.write_text(json.dumps(chars, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    else:
        CHARS.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    log(f"library {url}")
    return url


def main() -> None:
    if not FACE.is_file():
        raise SystemExit(f"missing headshot {FACE}")
    INPUT.mkdir(parents=True, exist_ok=True)
    shutil.copy2(FACE, INPUT / FACE_NAME)
    try:
        req("POST", "/interrupt")
        log("interrupted leftover queue")
        time.sleep(2)
    except Exception:
        pass
    try:
        req("POST", "/free", {"unload_models": True, "free_memory": True})
        log("freed VRAM")
    except Exception as e:
        log(f"free skip {e}")

    t2i = {
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
        "9": {"class_type": "EmptyLatentImage", "inputs": {"width": 768, "height": 1024, "batch_size": 1}},
        "6": {
            "class_type": "KSampler",
            "inputs": {
                "seed": 210921,
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
        "8": {"class_type": "SaveImage", "inputs": {"filename_prefix": "qwen21-kim-longhair", "images": ["7", 0]}},
    }
    still = queue(t2i, "T2I")
    t2i_url = save_edit(still, PROMPT, "qwen-image-2.1", f"/api/media/characters/{CHAR_ID}-headshot.png")
    shutil.copy2(still, INPUT / "kim-longhair-scene.png")

    reactor = {
        "1": {"class_type": "LoadImage", "inputs": {"image": "kim-longhair-scene.png"}},
        "2": {"class_type": "LoadImage", "inputs": {"image": FACE_NAME}},
        "3": {
            "class_type": "ReActorFaceSwap",
            "inputs": {
                "enabled": True,
                "input_image": ["1", 0],
                "source_image": ["2", 0],
                "swap_model": "inswapper_128.onnx",
                "facedetection": "retinaface_resnet50",
                "face_restore_model": "none",
                "face_restore_visibility": 1,
                "codeformer_weight": 0.5,
                "detect_gender_input": "no",
                "detect_gender_source": "no",
                "input_faces_index": "0",
                "source_faces_index": "0",
                "console_log_level": 1,
            },
        },
        "4": {"class_type": "SaveImage", "inputs": {"filename_prefix": "reactor-kim-longhair", "images": ["3", 0]}},
    }
    swapped = queue(reactor, "REACTOR")
    swap_url = save_edit(
        swapped,
        "ReActor Kim headshot onto 2.1 long-hair studio still.",
        "reactor",
        t2i_url,
    )
    log(f"DONE t2i={t2i_url} reactor={swap_url}")


if __name__ == "__main__":
    main()
