"""Kim: 4 raw fashion looks. Backend tidies then generates. Cloud winners + 2.1."""
from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

WEB = "http://127.0.0.1:3000"
COMFY = "http://127.0.0.1:8188"
CID = "b37ac8f2-260f-48b2-a7d9-b5162c055681"
JOBS = Path(r"C:\Users\USER\Grok\apps\AIOSCreator\data\db\jobs.json")
OUT = Path(r"C:\Users\USER\Grok\apps\AIOSCreator\data\media\images\kim-fashion-looks.json")
LOOKS = [
    (
        "candy-mod",
        "Adult East Asian fashion girl, cobalt blue A-line mini skirt, cream white crew neck, cherry red patent leather boots, Candy Mod",
    ),
    (
        "sporty-doll",
        "Adult East Asian fashion girl, grass green contrast rugby Polo, white puff skirt, orange pink sneakers, Sporty Doll",
    ),
    (
        "toybox",
        "Adult East Asian fashion girl, raspberry red short blazer, sky blue tulip skirt, yellow socks, Toybox Tailoring",
    ),
    (
        "romantic-punk",
        "Adult East Asian fashion girl, cream white ruffled shirt, teal plaid structural mini skirt, burgundy tall boots, Romantic Punk",
    ),
]
ENGINES = ["gpt-image-2.5", "qwen-image-3.0", "seedream-5-lite", "qwen-image-2.1"]


def req(method: str, url: str, data=None, timeout=90):
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


def job_row(job_id: str) -> dict | None:
    data = json.loads(JOBS.read_text(encoding="utf-8"))
    for j in data.get("jobs") or []:
        if j.get("id") == job_id:
            return j
    return None


def free_comfy() -> None:
    try:
        req("POST", f"{COMFY}/free", {"unload_models": True, "free_memory": True}, timeout=30)
    except Exception as e:
        log(f"free skip {e}")


def post_job(engine: str, prompt: str) -> dict:
    req("POST", f"{WEB}/api/settings/engines", {"kind": "image", "id": engine})
    r = req(
        "POST",
        f"{WEB}/api/characters/{CID}?op=edit",
        {
            "baseUrl": f"/api/media/characters/{CID}-identity.png",
            "mode": "chat",
            "aspect": "9:16",
            "prompt": prompt,
        },
    )
    job_id = r.get("jobId") or (r.get("job") or {}).get("id")
    inp = (job_row(job_id) or {}).get("input") or ""
    bait = bool(re.search(r"east asian|fashion girl", inp, re.I))
    log(f"job {engine} {job_id} bait={bait} warnings={r.get('warnings')}")
    return {"engine": engine, "jobId": job_id, "bait": bait, "inputHead": inp[inp.find("Photoreal") :][:500] if "Photoreal" in inp else inp[-500:]}


def wait_job(job_id: str, timeout=8 * 60) -> dict:
    t0 = time.time()
    while time.time() - t0 < timeout:
        j = job_row(job_id)
        if j and j.get("status") in ("completed", "failed"):
            return j
        time.sleep(5)
    raise TimeoutError(job_id)


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    results = []
    for look_id, prompt in LOOKS:
        log(f"==== {look_id} ====")
        queued = []
        for engine in ENGINES:
            if engine.startswith("qwen-image-2.1"):
                continue
            queued.append({**post_job(engine, prompt), "look": look_id})
        for engine in ENGINES:
            if not engine.startswith("qwen-image-2.1"):
                continue
            free_comfy()
            time.sleep(1)
            queued.append({**post_job(engine, prompt), "look": look_id})
        for row in queued:
            j = wait_job(row["jobId"])
            done = {
                **row,
                "status": j.get("status"),
                "error": j.get("error"),
                "mediaUrl": j.get("mediaUrl"),
                "model": j.get("model"),
            }
            log(f"done {look_id} {row['engine']} {done['status']} {done.get('mediaUrl')} {done.get('error') or ''}")
            results.append(done)
            OUT.write_text(json.dumps(results, indent=2), encoding="utf-8")
    log(f"WROTE {OUT}")


if __name__ == "__main__":
    main()
