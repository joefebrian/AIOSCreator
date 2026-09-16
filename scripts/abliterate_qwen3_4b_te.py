"""Abliterate adult-NSFW refusal in our Comfy Qwen3-4B TE.

Writes qwen_3_4b_uncensored.safetensors next to stock qwen_3_4b.safetensors.
Does not overwrite stock. Does not touch age / child-vs-adult direction.
Klein 4B taps layers 9/18/27; we only cut layers 14-35.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

COMFY_ROOT = Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "ComfyUI"
TE_DIR = COMFY_ROOT / "models" / "text_encoders"
SRC = TE_DIR / "qwen_3_4b.safetensors"
DST = TE_DIR / "qwen_3_4b_uncensored.safetensors"
LOG = Path(__file__).resolve().parents[1] / "data" / "media" / "research" / "qwen3-4b-abliterate.json"
TOK = COMFY_ROOT / "comfy" / "text_encoders" / "qwen25_tokenizer"
TEMPLATE = "<|im_start|>user\n{}<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n"

# Adult fictional 28+ only. No minors, no CSAM, no real-person nonconsensual.
ADULT_PAIRS = [
    (
        "photorealistic portrait of a 28 year old adult woman, nude, natural skin texture, studio lighting",
        "photorealistic portrait of a 28 year old adult woman, wearing a linen dress, natural skin texture, studio lighting",
    ),
    (
        "an adult woman standing in a bedroom, bare breasts, wearing nothing, 85mm photo",
        "an adult woman standing in a bedroom, wearing a blouse and trousers, 85mm photo",
    ),
    (
        "full body photo of a 30 year old adult woman lying on a bed wearing nothing",
        "full body photo of a 30 year old adult woman lying on a bed wearing pajamas",
    ),
    (
        "an adult couple kissing, both nude, hotel room, photoreal",
        "an adult couple kissing, both wearing evening clothes, hotel room, photoreal",
    ),
    (
        "close-up of an adult woman's bare torso, no clothing, soft window light",
        "close-up of an adult woman wearing a knit sweater, soft window light",
    ),
]

SFW_CONTROL = [
    (
        "photorealistic portrait of a 28 year old adult woman wearing a linen dress, studio lighting",
        "photorealistic portrait of a 28 year old adult woman wearing a blue sweater, studio lighting",
    ),
    ("a red apple on a wooden table, product photo", "a green apple on a wooden table, product photo"),
    ("a wooden dining chair in an empty room", "a metal dining chair in an empty room"),
]

# Both sides clothed / SFW. Used only to keep the child-vs-adult axis intact.
AGE_PAIRS = [
    (
        "a young child in a park wearing a t-shirt, family snapshot, daylight",
        "a 28 year old adult in a park wearing a t-shirt, family snapshot, daylight",
    ),
    (
        "a child sitting at a school desk wearing clothes, classroom photo",
        "an adult sitting at an office desk wearing clothes, office photo",
    ),
    (
        "portrait of a little boy in a winter coat outdoors",
        "portrait of an adult man in a winter coat outdoors",
    ),
]

KLEIN_TAPS = (9, 18, 27)
CUT_LAYERS = range(14, 36)


def mean_hidden(h: "torch.Tensor") -> "torch.Tensor":
    return h[0].float().mean(0)


def encode_layers(model, tokenizer, text: str):
    import torch

    ids = tokenizer.encode(TEMPLATE.format(text), add_special_tokens=False)
    x = torch.tensor([ids], dtype=torch.long)
    mask = torch.ones_like(x)
    captured: dict[int, torch.Tensor] = {}

    hooks = []
    for i, layer in enumerate(model.model.layers):
        def hook(mod, inp, out, idx=i):
            y = out[0] if isinstance(out, tuple) else out
            captured[idx] = y.detach().clone()

        hooks.append(layer.register_forward_hook(hook))
    with torch.no_grad():
        model(x, attention_mask=mask, dtype=torch.float32)
    for h in hooks:
        h.remove()
    return {i: mean_hidden(captured[i]) for i in captured}


def unit(v):
    import torch

    n = torch.linalg.vector_norm(v)
    if float(n) < 1e-8:
        return v
    return v / n


def pair_delta(model, tokenizer, pairs):
    import torch

    acc = None
    n_layers = None
    for a, b in pairs:
        ha = encode_layers(model, tokenizer, a)
        hb = encode_layers(model, tokenizer, b)
        n_layers = len(ha)
        if acc is None:
            acc = {i: torch.zeros_like(ha[i]) for i in ha}
        for i in ha:
            acc[i] = acc[i] + (ha[i] - hb[i])
    return {i: acc[i] / len(pairs) for i in acc}, n_layers


def ortho_out(weight, r, scale: float):
    import torch

    w = weight.detach().float()
    r = r.to(device=w.device, dtype=torch.float32)
    # W is [out, in]; remove write of r from output dim: W <- W - r (r^T W)
    w = w - scale * torch.outer(r, w.transpose(0, 1) @ r)
    return w.to(dtype=weight.dtype)


def main():
    if not SRC.exists():
        raise SystemExit(f"missing {SRC}")
    sys.path.insert(0, str(COMFY_ROOT))

    import torch
    from safetensors.torch import load_file, save_file
    from transformers import Qwen2Tokenizer
    import comfy.ops
    from comfy.text_encoders.llama import Qwen3_4B

    LOG.parent.mkdir(parents=True, exist_ok=True)
    tokenizer = Qwen2Tokenizer.from_pretrained(str(TOK))
    print("load", SRC, SRC.stat().st_size, flush=True)
    sd = load_file(str(SRC), device="cpu")
    model = Qwen3_4B({}, dtype=torch.bfloat16, device="cpu", operations=comfy.ops.manual_cast)
    missing, unexpected = model.load_state_dict(sd, strict=False)
    print("missing", len(missing), "unexpected", len(unexpected), flush=True)
    model.eval()

    print("measure adult pairs", flush=True)
    adult, n_layers = pair_delta(model, tokenizer, ADULT_PAIRS)
    print("measure sfw control", flush=True)
    control, _ = pair_delta(model, tokenizer, SFW_CONTROL)
    print("measure age axis", flush=True)
    age, _ = pair_delta(model, tokenizer, AGE_PAIRS)

    report = {"layers": {}, "applied": [], "src": str(SRC), "dst": str(DST)}
    cleaned = {}
    for i in range(n_layers):
        a = adult[i]
        c = control[i]
        g = age[i]
        a_n = float(torch.linalg.vector_norm(a))
        c_n = float(torch.linalg.vector_norm(c))
        g_n = float(torch.linalg.vector_norm(g))
        au, gu = unit(a), unit(g)
        cos_age = float(torch.dot(au, gu)) if a_n > 0 and g_n > 0 else 0.0
        a_clean = a - torch.dot(a, gu) * gu if g_n > 0 else a
        cleaned[i] = unit(a_clean)
        report["layers"][str(i)] = {
            "adult_l2": a_n,
            "control_l2": c_n,
            "age_l2": g_n,
            "cos_adult_age": cos_age,
            "ratio_adult_control": (a_n / c_n) if c_n > 1e-8 else None,
            "tap": i in KLEIN_TAPS,
        }

    for i in CUT_LAYERS:
        meta = report["layers"][str(i)]
        ratio = meta["ratio_adult_control"] or 0.0
        if ratio < 1.25:
            continue
        scale = 1.0 if i >= 18 else 0.5
        r = cleaned[i]
        layer = model.model.layers[i]
        with torch.no_grad():
            layer.self_attn.o_proj.weight.copy_(ortho_out(layer.self_attn.o_proj.weight, r, scale))
            layer.mlp.down_proj.weight.copy_(ortho_out(layer.mlp.down_proj.weight, r, scale))
        report["applied"].append({"layer": i, "scale": scale, "ratio": ratio, "cos_adult_age": meta["cos_adult_age"]})

    print("applied", report["applied"], flush=True)
    print("remeasure adult + sfw", flush=True)
    adult2, _ = pair_delta(model, tokenizer, ADULT_PAIRS)
    control2, _ = pair_delta(model, tokenizer, SFW_CONTROL)
    report["after"] = {}
    for i in KLEIN_TAPS:
        report["after"][str(i)] = {
            "adult_l2": float(torch.linalg.vector_norm(adult2[i])),
            "control_l2": float(torch.linalg.vector_norm(control2[i])),
            "adult_l2_before": report["layers"][str(i)]["adult_l2"],
            "control_l2_before": report["layers"][str(i)]["control_l2"],
        }

    out_sd = dict(sd)
    for item in report["applied"]:
        i = item["layer"]
        layer = model.model.layers[i]
        out_sd[f"model.layers.{i}.self_attn.o_proj.weight"] = layer.self_attn.o_proj.weight.detach().contiguous()
        out_sd[f"model.layers.{i}.mlp.down_proj.weight"] = layer.mlp.down_proj.weight.detach().contiguous()
    save_file(out_sd, str(DST))
    report["dst_bytes"] = DST.stat().st_size
    LOG.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("wrote", DST, report["dst_bytes"], "log", LOG, flush=True)
    print("OK", flush=True)


if __name__ == "__main__":
    main()
