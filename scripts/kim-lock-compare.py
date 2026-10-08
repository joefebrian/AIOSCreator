"""Kim Generate lock: fashion editorial 3:4, all current Generate engines. Skip Grok."""
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
OUT = Path(r"C:\Users\USER\Grok\apps\AIOSCreator\data\media\images\kim-lock-office.json")
PROMPT = """## [Subject Description]

A photorealistic full-body portrait of a **young adult East Asian woman**, seated naturally in a black ergonomic office chair. She has a soft oval face, delicate feminine features, dark almond-shaped eyes, natural straight eyebrows, a small straight nose, soft pink lips, and a calm, gentle expression with a subtle closed-mouth smile. Her medium-length dark brown hair is softly layered, parted slightly off-center, with wispy bangs framing her face.

She wears a crisp white long-sleeve button-up office shirt with the sleeves casually rolled to the forearms, a dark gray fitted knee-length pencil skirt, sheer black pantyhose, and a dark navy employee lanyard with a rectangular ID badge. A simple wristwatch is worn on her left wrist. She holds a smartphone in her right hand and looks toward its screen. Her posture is relaxed and slightly reclined, with her legs extended forward and crossed naturally at the ankles,barefoot

She possesses the best head-to-body ratio, a perfect, curvaceous, S-shaped female figure,Hourglass figure,long legs with perfect leg lines, and a slender waist, perfect foots,perfect foot lines

## [Scene / Background]

A realistic modern Japanese office during the daytime. The woman sits beside a white workstation covered with a computer monitor, keyboard, mouse, pens, notebooks, paperwork, a desk calendar, small plants, and stationery. Sticky notes and handwritten Japanese motivational notes are visible around the desk. Other office desks, shelves, binders, a seated coworker seen from behind, office equipment, and a large window showing distant city buildings create an authentic working environment. Her black high-heeled pumps have been removed and are casually placed on the carpet near her feet.

## [Lighting / Ambience]

Soft natural daylight enters through the large office window, supplemented by neutral overhead fluorescent lighting. Gentle, diffuse illumination with realistic indoor shadows, subtle reflections, natural skin tones, and a quiet everyday Japanese corporate-office atmosphere. Slightly warm, understated photographic color grading.

## [Composition / View]

full-body framing from a low seated-camera perspective near desk height. The entire woman and both feet are visible without cropping, including the shoes on the floor. Three-quarter frontal view, with the camera positioned slightly to her left. Natural perspective with moderate environmental context, realistic proportions, and accurate anatomy. The woman remains the primary focal point while the office environment is clearly recognizable. Smartphone, hands, ID badge, chair, desk, and removed shoes remain visible.

## [Style Reference]

Photorealistic high-end lifestyle photography, authentic Japanese office candid aesthetic, natural human appearance, realistic facial details, realistic skin and hair texture, physically accurate clothing and fabric, natural hands and fingers, realistic anatomy and body proportions, subtle photographic imperfections, understated editorial quality. Avoid overly glamorous retouching, artificial beauty-filter effects, exaggerated curves, plastic skin, cartoon/anime rendering, or CGI appearance.

## [Image Quality Parameters]

Ultra-detailed photorealism, high-resolution photography, sharp subject details, realistic skin pores and fabric texture, natural depth of field, balanced exposure, subtle background separation, realistic lens rendering, fine tonal transitions, clean image structure, natural color reproduction, professional full-frame camera look ,No cropped limbs or truncated feet."""
CLOUD = [
    "gpt-image-2.5",
    "gpt-image-2.5-flare",
    "muse-image-1.0",
    "qwen-image-3.0",
    "seedream-5-lite",
    "seedream-4-5",
    "seedream-5-pro",
]
LOCAL = [
    "qwen-image-2.1",
    "qwen-image-2.1-gguf",
    "flux2-klein-4b",
]


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


def post_job(engine: str) -> dict:
    log(f"=== {engine} ===")
    req("POST", f"{WEB}/api/settings/engines", {"kind": "image", "id": engine})
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
        )
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", "replace")[:800]
        log(f"HTTP {e.code} {err}")
        return {"engine": engine, "status": "http_error", "error": err}
    job_id = r.get("jobId") or (r.get("job") or {}).get("id")
    log(f"job {job_id} warnings={r.get('warnings')}")
    if not job_id:
        return {"engine": engine, "status": "no_job", "raw": r}
    inp = (job_row(job_id) or {}).get("input") or ""
    bait = bool(re.search(r"east asian|hourglass|slender waist|wispy bangs|almond-shaped|oval face|chestnut|8K|ultra-detailed photorealism", inp, re.I))
    if bait:
        log(f"STRIP_WARN identity/hair words still in compiled prompt for {engine}")
    return {"engine": engine, "jobId": job_id, "warnings": r.get("warnings"), "stripWarn": bait}


def wait_job(job_id: str, timeout: int) -> dict:
    t0 = time.time()
    while time.time() - t0 < timeout:
        j = job_row(job_id)
        if j and j.get("status") in ("completed", "failed"):
            return j
        time.sleep(5)
    raise TimeoutError(job_id)


def finish(row: dict, j: dict | None = None) -> dict:
    if not row.get("jobId"):
        return row
    if j is None:
        try:
            j = wait_job(row["jobId"], 10 * 60 if row["engine"] == "seedream-5-pro" else 8 * 60)
        except TimeoutError:
            done = {**row, "status": "timeout"}
            log(f"timeout {row['engine']}")
            return done
    done = {
        **row,
        "status": j.get("status"),
        "error": j.get("error"),
        "mediaUrl": j.get("mediaUrl"),
        "model": j.get("model"),
        "inputHead": (j.get("input") or "")[:600],
    }
    log(f"done {row['engine']} {done['status']} {done.get('mediaUrl')} {done.get('error') or ''}")
    return done


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    results: list[dict] = []
    cloud_q = []
    for engine in CLOUD:
        cloud_q.append(post_job(engine))
        OUT.write_text(json.dumps(results + cloud_q, indent=2), encoding="utf-8")
    for row in cloud_q:
        done = finish(row)
        results.append(done)
        OUT.write_text(json.dumps(results, indent=2), encoding="utf-8")
    for engine in LOCAL:
        free_comfy()
        time.sleep(2)
        row = post_job(engine)
        done = finish(row)
        results.append(done)
        OUT.write_text(json.dumps(results, indent=2), encoding="utf-8")
    log(f"WROTE {OUT}")


if __name__ == "__main__":
    main()
