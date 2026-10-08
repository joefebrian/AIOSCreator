"""Kim nightlife candid. Verify framing = full (headshot + front)."""
from __future__ import annotations

import json
import time
import urllib.request
from pathlib import Path

WEB = "http://127.0.0.1:3000"
COMFY = "http://127.0.0.1:8188"
CID = "b37ac8f2-260f-48b2-a7d9-b5162c055681"
JOBS = Path(r"C:\Users\USER\Grok\apps\AIOSCreator\data\db\jobs.json")
OUT = Path(r"C:\Users\USER\Grok\apps\AIOSCreator\data\media\images\kim-nightlife.json")
PROMPT = """9:16, ultra-realistic CCD on-camera flash nightlife candid, 4 a.m. after-club vibe. A clearly adult young Korean female idol with a high-end Korean “world-weary” face, cool-pale skin, slightly messy long black curls, faint freckles, cool-pink nude makeup with blush. Expression is playfully cute 🤪, with a close-to-lens feel.
She wears a black sequined strapless mini bodycon dress with slim silver jewelry. Scene: a street-side taxi stand, slightly wet pavement, leftover neon streaks, taxi lights, scattered people leaving the club in the background.
She holds high heels in both hands, barefoot, one foot slightly lifted toward a ground-level camera; low-angle shot that lengthens the legs. Looks like a long night just ended.
On-camera direct flash lights her skin, with slight highlight bloom on the face. Subject sharp; background has light motion blur, drag, grain, and digital noise.
Overall mood: playfully cute, beautiful, expensive, intimate — like a lucky snapshot a friend took at 4 a.m. when the club let out."""
ENGINES = ["gpt-image-2.5", "qwen-image-3.0", "seedream-5-lite", "qwen-image-2.1"]


def req(method, url, data=None, timeout=90):
    body = None if data is None else json.dumps(data).encode()
    r = urllib.request.Request(
        url, data=body, method=method, headers={"Content-Type": "application/json"} if body else {}
    )
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        raw = resp.read()
        return json.loads(raw.decode()) if raw else {}


def log(m):
    print(m, flush=True)


def job_row(job_id):
    data = json.loads(JOBS.read_text(encoding="utf-8"))
    for j in data.get("jobs") or []:
        if j.get("id") == job_id:
            return j
    return None


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    queued = []
    for engine in ENGINES:
        if engine.startswith("qwen-image-2.1"):
            try:
                req("POST", f"{COMFY}/free", {"unload_models": True, "free_memory": True}, timeout=20)
            except Exception:
                pass
            time.sleep(1)
        log(f"=== {engine} ===")
        req("POST", f"{WEB}/api/settings/engines", {"kind": "image", "id": engine})
        r = req(
            "POST",
            f"{WEB}/api/characters/{CID}?op=edit",
            {
                "baseUrl": f"/api/media/characters/{CID}-identity.png",
                "mode": "chat",
                "aspect": "9:16",
                "prompt": PROMPT,
            },
        )
        job_id = r.get("jobId") or (r.get("job") or {}).get("id")
        log(f"job {job_id} warnings={r.get('warnings')}")
        queued.append({"engine": engine, "jobId": job_id, "warnings": r.get("warnings")})
        if engine.startswith("qwen-image-2.1"):
            break
    # wait cloud first then 2.1 already posted last
    results = []
    for row in queued:
        job_id = row["jobId"]
        t0 = time.time()
        timeout = 8 * 60
        while time.time() - t0 < timeout:
            j = job_row(job_id)
            if j and j.get("status") in ("completed", "failed"):
                done = {
                    **row,
                    "status": j.get("status"),
                    "error": j.get("error"),
                    "mediaUrl": j.get("mediaUrl"),
                    "model": j.get("model"),
                    "inputHead": (j.get("input") or "")[:500],
                }
                log(f"done {row['engine']} {done['status']} {done.get('mediaUrl')} {done.get('error') or ''}")
                results.append(done)
                OUT.write_text(json.dumps(results, indent=2), encoding="utf-8")
                break
            time.sleep(5)
        else:
            results.append({**row, "status": "timeout"})
            log(f"timeout {row['engine']}")
    # 2.1 posted in loop with cloud; if we skipped posting 2.1 until after cloud wait, fix:
    log(f"WROTE {OUT}")


if __name__ == "__main__":
    main()
