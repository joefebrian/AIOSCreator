"""ReActor: Kim headshot onto Qwen 2.1 studio still bc37be2e."""
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
SCENE = MEDIA / f"{CHAR_ID}-edit-bc37be2e.png"
FACE = MEDIA / f"{CHAR_ID}-headshot.png"
SCENE_NAME = "reactor-kim-scene.png"
FACE_NAME = "reactor-kim-face.png"
GFP = Path.home() / "AppData/Local/Programs/ComfyUI/models/facerestore_models/GFPGANv1.4.pth"
RESTORE = "GFPGANv1.4.pth" if GFP.is_file() else "none"


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


def log(msg: str) -> None:
    print(msg, flush=True)


def main() -> None:
    if not SCENE.is_file() or not FACE.is_file():
        raise SystemExit(f"missing still or headshot: {SCENE.exists()} {FACE.exists()}")
    INPUT.mkdir(parents=True, exist_ok=True)
    shutil.copy2(SCENE, INPUT / SCENE_NAME)
    shutil.copy2(FACE, INPUT / FACE_NAME)
    try:
        req("POST", "/free", {"unload_models": True, "free_memory": True}, timeout=30)
        log("freed VRAM")
    except Exception as e:
        log(f"free skip {e}")
    graph = {
        "1": {"class_type": "LoadImage", "inputs": {"image": SCENE_NAME}},
        "2": {"class_type": "LoadImage", "inputs": {"image": FACE_NAME}},
        "3": {
            "class_type": "ReActorFaceSwap",
            "inputs": {
                "enabled": True,
                "input_image": ["1", 0],
                "source_image": ["2", 0],
                "swap_model": "inswapper_128.onnx",
                "facedetection": "retinaface_resnet50",
                "face_restore_model": RESTORE,
                "face_restore_visibility": 1,
                "codeformer_weight": 0.5,
                "detect_gender_input": "no",
                "detect_gender_source": "no",
                "input_faces_index": "0",
                "source_faces_index": "0",
                "console_log_level": 1,
            },
        },
        "4": {"class_type": "SaveImage", "inputs": {"filename_prefix": "creatoros-reactor-kim", "images": ["3", 0]}},
    }
    queued = req("POST", "/prompt", {"prompt": graph, "client_id": "reactor-kim"})
    if queued.get("node_errors"):
        raise SystemExit(queued["node_errors"])
    pid = queued["prompt_id"]
    log(f"queued {pid}")
    t0 = time.time()
    out_path = None
    while time.time() - t0 < 15 * 60:
        hist = req("GET", f"/history/{pid}", timeout=30)
        item = hist.get(pid) or {}
        status = item.get("status") or {}
        if status.get("status_str") == "error":
            raise SystemExit(json.dumps(status)[:2000])
        for node in (item.get("outputs") or {}).values():
            for img in node.get("images") or []:
                out_path = OUTPUT / img["filename"]
                break
        if out_path:
            break
        time.sleep(2)
    if not out_path or not out_path.is_file():
        raise SystemExit("ReActor produced no image")
    log(f"comfy out {out_path} ({time.time()-t0:.0f}s)")
    edit_id = str(uuid.uuid4())
    short = edit_id[:8]
    dest = MEDIA / f"{CHAR_ID}-edit-{short}.png"
    shutil.copy2(out_path, dest)
    url = f"/api/media/characters/{CHAR_ID}-edit-{short}.png"
    now = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    job_id = str(uuid.uuid4())
    jobs = json.loads(JOBS.read_text(encoding="utf-8"))
    jobs.append(
        {
            "id": job_id,
            "module": "production",
            "kind": "character",
            "input": "ReActor: Kim headshot onto 2.1 studio still bc37be2e. Keep pose/clothes/halo.",
            "status": "completed",
            "createdAt": now,
            "updatedAt": now,
            "model": "reactor",
            "provider": "comfy",
            "characterId": CHAR_ID,
            "mediaPath": str(dest),
            "mediaUrl": url,
        }
    )
    JOBS.write_text(json.dumps(jobs, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    chars = json.loads(CHARS.read_text(encoding="utf-8"))
    for row in chars:
        if row.get("id") == CHAR_ID:
            row.setdefault("edits", []).insert(
                0,
                {
                    "id": edit_id,
                    "url": url,
                    "prompt": "ReActor: Kim headshot onto 2.1 studio still. Keep pose, clothes, cyan-magenta halo.",
                    "baseUrl": f"/api/media/characters/{CHAR_ID}-edit-bc37be2e.png",
                    "mode": "face-swap",
                    "jobId": job_id,
                    "model": "reactor",
                    "provider": "comfy",
                    "createdAt": now,
                },
            )
            row["updatedAt"] = now
            break
    CHARS.write_text(json.dumps(chars, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    log(f"SAVED {url}")


if __name__ == "__main__":
    main()
