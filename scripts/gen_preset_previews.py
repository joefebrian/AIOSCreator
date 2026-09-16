"""Generate missing Character Workspace preset thumbs via local Z-Image."""
from __future__ import annotations

import json
import shutil
import time
import urllib.request
from pathlib import Path

DEST = Path(r"C:\Users\USER\Grok\apps\AIOSCreator\data\media\presets")
OUT = Path(r"C:\Users\USER\AppData\Local\Programs\ComfyUI\output")
SUBJECT = (
    "photoreal photograph of a fictional adult East Asian woman, 28 years old, one person, "
    "natural skin pores, looking toward camera, "
)

JOBS = [
    ("art-style-photoreal", SUBJECT + "photoreal photograph, visible skin pores and peach fuzz, catchlights, not CGI"),
    ("art-style-editorial", SUBJECT + "editorial fashion photograph, 85mm, precise lighting, magazine cover grade, linen dress"),
    ("art-style-cinematic", SUBJECT + "cinematic still, anamorphic bokeh, filmic contrast, shallow depth, night practicals"),
    ("art-style-analog", SUBJECT + "shot on 35mm portra-like film, fine grain, slight halation, imperfect exposure"),
    ("art-style-ugc-selfie", SUBJECT + "front-camera phone selfie, slight wide-angle, casual bedroom light"),
    ("art-style-flash", SUBJECT + "direct on-camera flash, hard shadow on wall, nightlife snapshot"),
    ("art-style-studio", SUBJECT + "beauty dish lighting, dual catchlights, clean seamless backdrop"),
    ("art-style-lookbook", SUBJECT + "full-body fashion lookbook, even catalog light, straight stance, summer dress"),
    ("art-style-85mm", SUBJECT + "85mm f/1.8 portrait, compressed background, creamy falloff, eye-sharp"),
    ("art-style-mirror-ugc", SUBJECT + "bathroom mirror phone photo, flash bounce, outfit check, candid"),
    ("clothing-street", SUBJECT + "oversized tee, baggy denim, sneakers, streetwear, full-body"),
    ("clothing-evening", SUBJECT + "going-out evening dress, heel, night fabric sheen, full-body"),
    ("clothing-lounge", SUBJECT + "at-home loungewear, silk, relaxed drape, indoor"),
    ("clothing-swim", SUBJECT + "swimwear at a pool, wet skin highlights, late afternoon"),
    ("clothing-office", SUBJECT + "smart casual blazer, tailored trousers, office-ready, full-body"),
    ("clothing-athleisure", SUBJECT + "fitted sportswear, clean gym aesthetic, full-body"),
    ("clothing-knit", SUBJECT + "chunky knit sweater, winter layers, wool texture"),
    ("clothing-summer-dress", SUBJECT + "light summer dress, breeze in fabric, sun on skin, full-body"),
    ("clothing-blazer", SUBJECT + "oversized blazer over a tee, fashion-week street, full-body"),
    ("clothing-denim", SUBJECT + "classic denim jacket, worn-in texture, casual full-body"),
    ("architecture-apartment", SUBJECT + "standing in a modern apartment interior, warm lamps, city window"),
    ("architecture-hotel", SUBJECT + "in a hotel room, floor-to-ceiling city view, rumpled sheets behind"),
    ("architecture-cafe", SUBJECT + "seated in a small cafe, wood tables, warm pendant lamps"),
    ("architecture-loft", SUBJECT + "in an industrial loft, concrete, brick, large factory windows"),
    ("architecture-penthouse", SUBJECT + "in a penthouse, glass wall, night skyline bokeh"),
    ("architecture-bathroom", SUBJECT + "in a marble bathroom, vanity lights, steamed mirror"),
    ("architecture-kitchen", SUBJECT + "in an open kitchen, morning window light"),
    ("architecture-balcony", SUBJECT + "on a narrow apartment balcony at dusk, city below"),
    ("architecture-conv-store", SUBJECT + "in a night convenience store aisle, fluorescent lights"),
    ("architecture-gym", SUBJECT + "in a modern gym, rubber floor, mirror wall"),
    ("landscape-city-night", SUBJECT + "on a wet city street at night, neon signs, reflections"),
    ("landscape-beach", SUBJECT + "at the beach waterline, late afternoon, salt air"),
    ("landscape-park", SUBJECT + "on a city park path, trees, dappled sun"),
    ("landscape-rooftop", SUBJECT + "on a rooftop at golden hour, skyline out of focus"),
    ("landscape-alley", SUBJECT + "in a narrow textured alley, one practical light"),
    ("landscape-bedroom", SUBJECT + "in a bedroom, rumpled sheets, curtain-filtered window"),
    ("landscape-living", SUBJECT + "in a lived-in living room, sofa, lamp, casual"),
    ("landscape-seamless", SUBJECT + "full-body on a seamless paper studio backdrop, catalog"),
    ("landscape-parking", SUBJECT + "in a concrete parking garage, fluorescent strips"),
    ("landscape-subway", SUBJECT + "on a subway platform, tiles, train-light"),
    ("weather-golden", SUBJECT + "golden hour, warm rim light on hair, long shadows, outdoors"),
    ("weather-overcast", SUBJECT + "open shade overcast, soft wrap, no hard nose shadow"),
    ("weather-rain", SUBJECT + "rain on glass behind her, wet skin highlights, cool street"),
    ("weather-hot", SUBJECT + "hard summer sun, slight sweat sheen, high contrast outdoors"),
    ("weather-blue-hour", SUBJECT + "blue hour dusk, cool ambient, one warm practical"),
    ("weather-neon-night", SUBJECT + "neon night, magenta and cyan spill on skin"),
    ("weather-morning", SUBJECT + "soft morning window, curtains, slow light on face"),
    ("weather-noon", SUBJECT + "harsh noon sun overhead, short hard shadows outdoors"),
    ("weather-tungsten", SUBJECT + "warm tungsten lamps, indoor night, orange practicals"),
    ("weather-ring", SUBJECT + "ring-light catchlight, influencer UGC, slightly cool LED"),
    ("art-style-window-rake", SUBJECT + "north-facing window as key, 50mm f/1.8, raking daylight across pores and fabric, rectangular catchlights, falloff into room shadow"),
    ("art-style-disposable-flash", SUBJECT + "cheap disposable-camera snapshot, direct flash, magenta-green color shift, heavy 400-speed grain, hard wall shadow"),
    ("art-style-medium-format", SUBJECT + "Hasselblad 80mm f/2.8 medium-format look, razor fabric weave, creamy skin microtexture, square-crop compression, muted highlight roll-off"),
    ("art-style-rear-cam-ugc", SUBJECT + "iPhone rear 1x, slight barrel, HDR skin, handheld waist-high, mixed tungsten and window, unstyled UGC"),
    ("clothing-leather-trench", SUBJECT + "long wet-look leather trench, specular highlights along seams, heavy hem drape, 85mm on-model, raking street light, full-body"),
    ("clothing-silk-slip", SUBJECT + "bias-cut silk slip, window light transmitting through fabric, visible weave and hem catch, skin-to-silk contrast, 50mm"),
    ("clothing-rumpled-linen", SUBJECT + "open rumpled linen shirt, coarse weave in 45-degree side light, collar roll and cuff texture, casual on-model, 35mm"),
    ("clothing-camel-cashmere", SUBJECT + "oversized camel cashmere coat, pile texture raked at 45 degrees, weighty drape at shoulders, 85mm lookbook, cool daylight, full-body"),
    ("architecture-wood-library", SUBJECT + "standing in wood library stacks, tungsten sconces, dust in window shafts, leather spines, 35mm environmental portrait"),
    ("architecture-glass-elevator", SUBJECT + "in a glass elevator at night, city reflections on panes, cool LED strips, chrome handrail, 24mm wide, on-model"),
    ("architecture-commuter-car", SUBJECT + "in a commuter-train interior, fluorescent strips, scratched windows, vinyl seats, handheld 35mm, mixed sodium outside"),
    ("architecture-wine-bar", SUBJECT + "in a dim wine bar, walnut booth, candle plus tungsten mix, bottle-glass speculars, 50mm f/1.4, warm falloff"),
    ("landscape-wet-cobbles", SUBJECT + "on rain-slick cobblestones, shop-window spill, puddle reflections of neon, 35mm street, wet asphalt grain"),
    ("landscape-fog-pier", SUBJECT + "on a foggy wooden pier, sodium lamps in mist, wet plank grain, distant water bokeh, 85mm compressed"),
    ("landscape-desert-asphalt", SUBJECT + "on an empty desert highway, heat shimmer over asphalt, hard noon, 50mm, tar texture and chrome glints"),
    ("landscape-blossom-path", SUBJECT + "on a cherry-blossom path, petal-lit dappled sun, 85mm compressed bokeh, pink rim on hair, wet pavement patches"),
    ("weather-fog-wrap", SUBJECT + "dense morning fog, wrap light with no hard nose shadow, sodium streetglow, wet asphalt, 50mm"),
    ("weather-snow-flash", SUBJECT + "falling snow at night, on-camera flash catching flakes, tungsten storefronts, wet blacktop, 35mm snapshot"),
    ("weather-storm-key", SUBJECT + "brief storm-break hard key, wet asphalt speculars, cool overcast fill, rain on fabric, 85mm"),
    ("weather-haze-shafts", SUBJECT + "late-day atmospheric haze, long warm shafts through dust, rim on hair, 85mm, portra-warm highlight roll-off"),
]


def graph(prompt: str, prefix: str, seed: int):
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "z_image_turbo_int8_convrot.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen_3_4b.safetensors", "type": "lumina2", "device": "cpu"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "ae.safetensors"}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["2", 0]}},
        "5": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["4", 0]}},
        "6": {"class_type": "EmptySD3LatentImage", "inputs": {"width": 512, "height": 768, "batch_size": 1}},
        "7": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["1", 0], "shift": 3}},
        "8": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed,
                "steps": 8,
                "cfg": 1,
                "sampler_name": "res_multistep",
                "scheduler": "simple",
                "denoise": 1,
                "model": ["7", 0],
                "positive": ["4", 0],
                "negative": ["5", 0],
                "latent_image": ["6", 0],
            },
        },
        "9": {"class_type": "VAEDecode", "inputs": {"samples": ["8", 0], "vae": ["3", 0]}},
        "10": {"class_type": "SaveImage", "inputs": {"filename_prefix": prefix, "images": ["9", 0]}},
    }


def post(body: dict) -> str:
    req = urllib.request.Request(
        "http://127.0.0.1:8188/prompt",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())["prompt_id"]


def history(pid: str):
    with urllib.request.urlopen("http://127.0.0.1:8188/history/" + pid, timeout=10) as r:
        return json.loads(r.read().decode()).get(pid)


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    pending: list[tuple[str, str]] = []
    for i, (name, prompt) in enumerate(JOBS):
        dest = DEST / f"{name}.png"
        if dest.exists() and dest.stat().st_size > 10000:
            print("skip", name)
            continue
        pid = post({"prompt": graph(prompt, "creatoros-preset-" + name, 41000 + i), "client_id": name})
        print("queued", name, pid)
        pending.append((name, pid))

    t0 = time.time()
    done: dict[str, str] = {}
    while pending and time.time() - t0 < 90 * 60:
        still = []
        for name, pid in pending:
            if pid in done:
                continue
            h = history(pid)
            if not h:
                still.append((name, pid))
                continue
            st = h.get("status") or {}
            blob = json.dumps(h).lower()
            if "out of memory" in blob:
                print("OOM", name)
                done[pid] = "oom"
                continue
            if st.get("status_str") == "error":
                print("ERR", name, json.dumps(st)[:300])
                done[pid] = "err"
                continue
            if not st.get("completed"):
                still.append((name, pid))
                continue
            fn = None
            for _n, o in (h.get("outputs") or {}).items():
                for im in o.get("images") or []:
                    fn = im.get("filename")
            if not fn:
                done[pid] = "empty"
                continue
            src = next(OUT.rglob(fn), None)
            if not src:
                print("NOFILE", name, fn)
                done[pid] = "nofile"
                continue
            shutil.copy2(src, DEST / f"{name}.png")
            print("SAVED", name)
            done[pid] = "ok"
        pending = still
        if pending:
            time.sleep(4)
    print("RESULT", done)
    print("left", [n for n, _ in pending])


if __name__ == "__main__":
    main()
