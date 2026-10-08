"""Queue GPT 2.5 Sunburst + Flare against the same autumn Generate prompt. Cloud-only; can run beside Comfy."""
from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

WEB = "http://127.0.0.1:3000"
CID = "ca92a59c-0d7e-4c8e-9d4c-0bb448c70801"
JOBS = Path(r"C:\Users\USER\Grok\apps\AIOSCreator\data\db\jobs.json")
OUT = Path(r"C:\Users\USER\Grok\apps\AIOSCreator\data\media\images\lock-compare-4-gpt.json")
PROMPT = Path(r"C:\Users\USER\Grok\apps\AIOSCreator\scripts\generate-lock-compare.py").read_text(encoding="utf-8")
# reuse the same PROMPT string from the main script via a tiny extract
import ast

src = Path(r"C:\Users\USER\Grok\apps\AIOSCreator\scripts\generate-lock-compare.py").read_text(encoding="utf-8")
PROMPT = ast.literal_eval(src.split("PROMPT = ", 1)[1].split("\nENGINES", 1)[0].strip())
ENGINES = ["gpt-image-2.5", "gpt-image-2.5-flare"]


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


def job_row(job_id: str) -> dict | None:
    data = json.loads(JOBS.read_text(encoding="utf-8"))
    for j in data.get("jobs") or []:
        if j.get("id") == job_id:
            return j
    return None


def wait_job(job_id: str, timeout=12 * 60) -> dict:
    t0 = time.time()
    while time.time() - t0 < timeout:
        j = job_row(job_id)
        if j and j.get("status") in ("completed", "failed"):
            return j
        time.sleep(5)
    raise SystemExit(f"timeout {job_id}")


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    queued = []
    for engine in ENGINES:
        log(f"=== {engine} ===")
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
            queued.append({"engine": engine, "status": "http_error", "error": err})
            continue
        job_id = r.get("jobId") or (r.get("job") or {}).get("id")
        log(f"job {job_id} warnings={r.get('warnings')}")
        queued.append({"engine": engine, "jobId": job_id, "warnings": r.get("warnings"), "raw_status": "queued"})
        OUT.write_text(json.dumps(queued, indent=2), encoding="utf-8")
        if job_id:
            q = job_row(job_id)
            inp = (q or {}).get("input") or ""
            if re.search(r"east asian|chestnut-brown|curtain bangs|8K", inp, re.I):
                log("STRIP_FAIL identity words still in compiled prompt")
                raise SystemExit("strip failed")

    results = []
    for row in queued:
        engine = row["engine"]
        job_id = row.get("jobId")
        if not job_id:
            results.append(row)
            continue
        j = wait_job(job_id)
        done = {
            "engine": engine,
            "jobId": job_id,
            "status": j.get("status"),
            "error": j.get("error"),
            "mediaUrl": j.get("mediaUrl"),
            "model": j.get("model"),
            "inputHead": (j.get("input") or "")[:800],
            "warnings": row.get("warnings"),
        }
        log(f"done {done['status']} {done['mediaUrl']} {done.get('error') or ''}")
        results.append(done)
        OUT.write_text(json.dumps(results, indent=2), encoding="utf-8")
    log(f"WROTE {OUT}")


if __name__ == "__main__":
    main()
