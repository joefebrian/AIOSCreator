"""Local RealESRGAN x4 then crop/scale to 9:16 UHD. Free open weights. No API."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from spandrel import ImageModelDescriptor, ModelLoader


def tiles(h: int, w: int, tile: int, overlap: int):
    step = max(tile - overlap, 1)
    ys = list(range(0, h, step))
    xs = list(range(0, w, step))
    if ys[-1] != max(h - tile, 0):
        ys.append(max(h - tile, 0))
    if xs[-1] != max(w - tile, 0):
        xs.append(max(w - tile, 0))
    out = []
    for y in ys:
        for x in xs:
            out.append((y, x, min(y + tile, h), min(x + tile, w)))
    return out


def upscale(model: ImageModelDescriptor, img: Image.Image, tile: int, overlap: int) -> Image.Image:
    arr = np.array(img.convert("RGB"), dtype=np.float32) / 255.0
    t = torch.from_numpy(arr).permute(2, 0, 1).unsqueeze(0)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    t = t.to(device)
    scale = int(getattr(model, "scale", 4) or 4)
    _, _, h, w = t.shape
    oh, ow = h * scale, w * scale
    acc = torch.zeros(1, 3, oh, ow, device=device)
    wgt = torch.zeros(1, 1, oh, ow, device=device)
    model.to(device).eval()
    with torch.inference_mode():
        for y0, x0, y1, x1 in tiles(h, w, tile, overlap):
            patch = t[:, :, y0:y1, x0:x1]
            up = model(patch)
            oy, ox = y0 * scale, x0 * scale
            acc[:, :, oy : oy + up.shape[2], ox : ox + up.shape[3]] += up
            wgt[:, :, oy : oy + up.shape[2], ox : ox + up.shape[3]] += 1
    out = (acc / wgt.clamp_min(1)).clamp(0, 1).squeeze(0).permute(1, 2, 0).cpu().numpy()
    return Image.fromarray((out * 255).round().astype(np.uint8), "RGB")


def finish(sharp: Image.Image, width: int, height: int) -> Image.Image:
    scale = max(width / sharp.width, height / sharp.height)
    nw, nh = max(width, int(round(sharp.width * scale))), max(height, int(round(sharp.height * scale)))
    resized = sharp.resize((nw, nh), Image.Resampling.LANCZOS)
    left = max(0, (nw - width) // 2)
    top = max(0, (nh - height) // 2)
    return resized.crop((left, top, left + width, top + height))


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--src")
    p.add_argument("--dest")
    p.add_argument("--frames-in")
    p.add_argument("--frames-out")
    p.add_argument("--model", required=True)
    p.add_argument("--width", type=int, default=2160)
    p.add_argument("--height", type=int, default=3840)
    p.add_argument("--tile", type=int, default=192)
    args = p.parse_args()
    loaded = ModelLoader().load_from_file(args.model)
    if not isinstance(loaded, ImageModelDescriptor):
        raise SystemExit("not an image upscale model")

    if args.frames_in and args.frames_out:
        inn = Path(args.frames_in)
        out = Path(args.frames_out)
        out.mkdir(parents=True, exist_ok=True)
        frames = sorted(inn.glob("*.png"))
        if not frames:
            raise SystemExit("no frames")
        for i, fp in enumerate(frames, 1):
            sharp = upscale(loaded, Image.open(fp), args.tile, overlap=16)
            finish(sharp, args.width, args.height).save(out / fp.name, "PNG")
            print(f"frame {i}/{len(frames)}", flush=True)
        print(f"ok {len(frames)} frames -> {out}")
        return 0

    if not args.src or not args.dest:
        raise SystemExit("--src/--dest or --frames-in/--frames-out required")
    src = Image.open(args.src)
    sharp = upscale(loaded, src, args.tile, overlap=16)
    cropped = finish(sharp, args.width, args.height)
    Path(args.dest).parent.mkdir(parents=True, exist_ok=True)
    cropped.save(args.dest, "PNG")
    print(f"ok {args.dest} {cropped.size}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
