"""Download Qwen-Image-2.1 Q5_K_M GGUF with HTTP Range resume."""
from __future__ import annotations

import os
import sys
import time
import urllib.error
import urllib.request

DEST = os.path.join(
    os.environ["LOCALAPPDATA"],
    "Programs",
    "ComfyUI",
    "models",
    "diffusion_models",
    "qwen-image-2.1-Q5_K_M.gguf",
)
URL = "https://huggingface.co/abenzerps/Qwen-Image-2.1-Uncensored-GGUF/resolve/main/qwen-image-2.1-Q5_K_M.gguf"
SIZE = 5_221_284_512
UA = "creatoros-qwen21-gguf/1.0"
CHUNK = 8 * 1024 * 1024


def log(msg: str) -> None:
    print(msg, flush=True)


def download() -> None:
    os.makedirs(os.path.dirname(DEST), exist_ok=True)
    have = os.path.getsize(DEST) if os.path.isfile(DEST) else 0
    if have == SIZE:
        log(f"OK already {have}")
        return
    if have > SIZE:
        os.remove(DEST)
        have = 0
    log(f"GET from {have} / {SIZE}")
    headers = {"User-Agent": UA}
    if have:
        headers["Range"] = f"bytes={have}-"
    req = urllib.request.Request(URL, headers=headers)
    last = time.time()
    with urllib.request.urlopen(req, timeout=120) as resp:
        mode = "ab" if have and resp.status == 206 else "wb"
        if mode == "wb":
            have = 0
        with open(DEST, mode) as out:
            while True:
                buf = resp.read(CHUNK)
                if not buf:
                    break
                out.write(buf)
                have += len(buf)
                now = time.time()
                if now - last >= 10:
                    log(f"  {have}/{SIZE} ({100.0 * have / SIZE:.1f}%)")
                    last = now
    final = os.path.getsize(DEST)
    if final != SIZE:
        raise SystemExit(f"SIZE got {final} want {SIZE}")
    log(f"DONE {final}")


def main() -> None:
    for attempt in range(1, 8):
        try:
            download()
            return
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            log(f"RETRY #{attempt}: {e}")
            time.sleep(min(30, 3 * attempt))
    raise SystemExit("FAIL")


if __name__ == "__main__":
    sys.exit(main())
