"""Sequential Generate Image lock test. Round 4: autumn editorial, auto-revamp, skip Grok."""
from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

WEB = "http://127.0.0.1:3000"
COMFY = "http://127.0.0.1:8188"
CID = "ca92a59c-0d7e-4c8e-9d4c-0bb448c70801"
JOBS = Path(r"C:\Users\USER\Grok\apps\AIOSCreator\data\db\jobs.json")
OUT = Path(r"C:\Users\USER\Grok\apps\AIOSCreator\data\media\images\lock-compare-4.json")
PROMPT = """Ultra-realistic luxury autumn street fashion editorial of a beautiful young East Asian woman sitting gracefully on wide stone steps outside an elegant historic European building.

She has long chestnut-brown hair styled in soft voluminous curls with full wispy curtain bangs, half-up hairstyle secured with a cream ribbon hair clip. Her skin is fair with a natural satin glow, soft rosy cheeks, delicate facial features, subtle brown eye makeup, long curled eyelashes, naturally full brows, and muted rose lips.

She wears a crisp oversized ivory button-up shirt tucked into a high-waisted brown plaid pleated mini skirt, paired with a slim chocolate-brown necktie. She wears sheer dark espresso tights and glossy dark burgundy knee-high leather boots with square toes and elegant block heels.

A luxurious burgundy leather shoulder bag rests beside her as she searches through it with one hand while casually holding a hardcover book and a takeaway coffee cup in the other. Small pearl stud earrings and delicate minimal jewelry complete the outfit.

She sits naturally on the stone staircase with one knee slightly bent and her body leaning forward as she looks down into her handbag, creating a candid everyday moment. Her posture feels relaxed, feminine, and effortless.

Behind her stands a grand dark walnut wooden doorway with classic European architectural details, aged stone walls, and wide granite steps. The atmosphere suggests a quiet autumn morning in Paris, London, or Milan.

Soft overcast daylight creates diffused natural lighting with gentle shadows, muted highlights, and rich earthy colors. The overall palette consists of espresso brown, burgundy, ivory, taupe, charcoal, and warm gray, producing a timeless vintage editorial mood.

Luxury autumn campaign, old money aesthetic, dark academia fashion, European street style, Korean fashion editorial, vintage city lifestyle, quiet luxury.

Shot on a Leica M11 with a Summilux-M 50mm f/1.4 ASPH lens, shallow depth of field, Kodak Portra 400 color grading, soft analog film grain, RAW photography, ultra realistic skin texture, photorealistic, 8K, highly detailed."""
ENGINES = [
    "seedream-5-pro",
    "qwen-image-2.1",
    "qwen-image-2.1-gguf",
    "flux2-klein-4b",
    "gpt-image-2.5",
    "gpt-image-2.5-flare",
]


def req(method: str, url: str, data=None, timeout=60):
    body = None if data is None else json.dumps(data).encode()
    r = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={"Content-Type": "application/json"} if body else {},
    )
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        raw = resp.read()
        return json.loads(raw.decode()) if raw else {}


def log(msg: str) -> None:
    print(msg, flush=True)


def free_comfy() -> None:
    try:
        req("POST", f"{COMFY}/free", {"unload_models": True, "free_memory": True}, timeout=30)
    except Exception as e:
        log(f"free skip {e}")


def job_row(job_id: str) -> dict | None:
    data = json.loads(JOBS.read_text(encoding="utf-8"))
    for j in data.get("jobs") or []:
        if j.get("id") == job_id:
            return j
    return None


def wait_job(job_id: str, timeout=20 * 60) -> dict:
    t0 = time.time()
    while time.time() - t0 < timeout:
        j = job_row(job_id)
        if j and j.get("status") in ("completed", "failed"):
            return j
        time.sleep(5)
    raise SystemExit(f"timeout {job_id}")


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    results = []
    for engine in ENGINES:
        log(f"=== {engine} ===")
        if engine.startswith("qwen") or engine.startswith("flux"):
            free_comfy()
            time.sleep(2)
        sel = req("POST", f"{WEB}/api/settings/engines", {"kind": "image", "id": engine})
        log(f"selected {sel.get('selected', {}).get('image')}")
        try:
            r = req(
                "POST",
                f"{WEB}/api/characters/{CID}?op=edit",
                {
                    "baseUrl": f"/api/media/characters/{CID}-identity.png",
                    "mode": "chat",
                    "aspect": "9:16",
                    "prompt": PROMPT,
                },
                timeout=90,
            )
        except urllib.error.HTTPError as e:
            err = e.read().decode("utf-8", "replace")[:800]
            log(f"HTTP {e.code} {err}")
            results.append({"engine": engine, "status": "http_error", "error": err})
            OUT.write_text(json.dumps(results, indent=2), encoding="utf-8")
            continue
        job_id = r.get("jobId") or (r.get("job") or {}).get("id")
        log(f"job {job_id} warnings={r.get('warnings')}")
        if not job_id:
            results.append({"engine": engine, "status": "no_job", "raw": r})
            OUT.write_text(json.dumps(results, indent=2), encoding="utf-8")
            continue
        queued = job_row(job_id)
        queued_input = (queued or {}).get("input") or ""
        if re.search(r"east asian|chestnut-brown|curtain bangs|8K", queued_input, re.I):
            log("STRIP_FAIL identity words still in compiled prompt")
            raise SystemExit("strip failed; abort remaining engines")
        j = wait_job(job_id)
        row = {
            "engine": engine,
            "jobId": job_id,
            "status": j.get("status"),
            "error": j.get("error"),
            "mediaUrl": j.get("mediaUrl"),
            "model": j.get("model"),
            "inputHead": (j.get("input") or "")[:800],
            "warnings": r.get("warnings"),
        }
        log(f"done {row['status']} {row['mediaUrl']} {row.get('error') or ''}")
        results.append(row)
        OUT.write_text(json.dumps(results, indent=2), encoding="utf-8")
    log(f"WROTE {OUT}")


if __name__ == "__main__":
    main()
