# AIOS Creator

**Local-first AI Creator Commerce OS** by [P2P Labs](https://p2plabs.asia)

Research → Create → Animate → Publish → Engage → Measure → Monetize → Learn.

The moat is not the model. The moat is **Product + Character + Creative DNA + Distribution + Attribution**.

[github.com/joefebrian/AIOSCreator](https://github.com/joefebrian/AIOSCreator)

---

## What it is

AIOS Creator is a workstation OS for UGC and affiliate operators. You lock a character, import a SKU, generate on-model stills, animate, and push toward official publish APIs — mostly on **your GPU**, with optional paid cloud when a job needs it.

It is **not** a generic image playground. Characters, products, jobs, spend, and lineage stay in one loop.

Built for a **single-owner RTX box** (reference: RTX 3060 12GB). ComfyUI is the local inference runtime. Next.js is the control plane.

## Who it is for

- Affiliate / UGC operators who need the same face on many SKUs
- Studios that want local generation without a per-clip SaaS meter
- Operators who mix local (Qwen / Klein / MiniMax H3) with paid cloud (GPT Image, Seedream, Wan 3.0, Kling)

## Loop

| Step | Module | Role |
|---|---|---|
| Research | Intelligence | Image/video → prompt, trends, opportunities, winner hooks |
| Product | Commerce | Catalog SKUs (Amazon, Shopee, Tokopedia, Lazada, TikTok Shop) |
| Create | Characters / Studio | Identity lock, stills, on-model, faceless pack, clone |
| Animate | Motion / Character I2V | Still → clip (H3 local, Wan / Kling / Seedance cloud) |
| Publish | Distribute | Official APIs or export pack. No ToS bypass. |
| Grow | Analytics | Measure, then mutate one variable |

---

## Features (what is live)

### Intelligence
- **Research** — drop a still or clip, or fetch TikTok / YouTube / Instagram / X via yt-dlp. VL extract → photoreal prompt. Mega checklist from the same pass (no second paid generate). Cookies in System → Settings.
- **Trends / Opportunities / Winner hooks** — ranked from extracts and operator URLs.

### Commerce
- **Products** — import listing URL or add SKU by hand. Photos saved to disk so Comfy can use them. Search, category, price, Amazon associate tag, localize remote images.
- **Affiliate video** lives on the **character workspace**, not Faceless VO.
- Programs / Campaigns are stubs that point back at the catalog.

### Create
- **Characters** — GPT Image 2.5 for first identity (when keyed), then local Qwen Image Edit for keep-face / keep-body. Generate, Edit, Clone, aspect ratios (9:16, 3:4, 1:1, 16:9, 4:5).
- **AI Studio** — product hub: on-model (character + SKU), faceless pack, mixed keroyok. Save/load workflows, Autoflow, camera presets.
- **MotionControl** — still → clip. Engine picker first.
- **ShortDrama** — Script → Board → Generate → Export (one shot at a time).
- **Faceless VO** — UGC Factory scripts; VoiceStudio TTS when the local server is up.

### Character workspace (image + video)
Ready: Generate image, Edit image, Affiliate video, Image to video, Complete set.  
Not ready: storyboard / talking / extend / subtitles (shown as soon).

### System
- **Settings** — LLM, image, and motion keys (never commit these).
- **Models** — which engine GEN uses.
- **ComfyUI** — GPU runtime health (`/api/comfy/status`), not `nvidia-smi`.
- **Usage** — cloud spend; monthly cap.

---

## Engines

### Local stills (ComfyUI, T0 12GB)

| Engine | Use |
|---|---|
| FLUX.2 Klein 4B FP8 | Fast identity / vibe |
| Z-Image Turbo | Photoreal “new person” plates |
| Qwen Image Edit 2511 | Keep-face + body, new pose/scene (default edit) |
| Klein vibe + Qwen lock | 2-pass: Klein scene, Qwen faceswap |

GPT Image / Seedream **block sexual content**. Swimwear and NSFW go to **Qwen / Klein / Z-Image**. Local Comfy does not use that filter.

### Local motion

| Engine | Use |
|---|---|
| MiniMax H3 I2V | Default I2V + audio. Native 640×1152 / 20 step. Turbo LoRA v4 = 6 step at 576×1024 on 3060 |
| H3 R2V | Copy motion from a reference clip (448×800) |
| Wan 2.2 5B / Hunyuan | Alternate local I2V when weights are installed |
| LTX-2 | Avoid on 12GB (kills Comfy) |

### Cloud (keyed in Settings)

| Engine | Use |
|---|---|
| GPT Image 2 / 2.5 Sunburst | First identity plates |
| Seedream 4.5 / 5 Pro | Cloud stills |
| Wan 3.0 std / prime | DashScope Singapore — **WAN key is separate from Qwen LLM key** |
| Kling 2.6 / 3.0, DreamActor V2 | Paid motion / identity-lock video |
| Seedance 2.0 / 2.5 | Paid I2V |

Spend cap applies to all paid routes.

---

## Stack

| Layer | Choice |
|---|---|
| Control plane | Next.js 16 + React 19 + TypeScript + Tailwind 4 |
| Local inference | ComfyUI (`127.0.0.1:8188`, `--lowvram --reserve-vram 3` on 12GB) |
| Encode | ffmpeg + NVENC when present |
| Data | JSON under `data/db` (gitignored). SQLite path reserved |
| Queue | In-process jobs. One GPU owner — switching menus does not cancel |
| Hybrid | Cloud APIs optional; local worker always owns the box |

NVIDIA: Studio Driver, NVENC for export. RTX Video Super Resolution is **watch-only**, not an export label.

---

## Quick start

### Requirements

- Windows 10/11, Node 20+, [pnpm](https://pnpm.io) 11
- Python + ComfyUI under `%LOCALAPPDATA%\Programs\ComfyUI`
- ffmpeg on `PATH` (or `FFMPEG_PATH`)
- Optional: Tailscale for LAN HTTPS

### App

```powershell
git clone https://github.com/joefebrian/AIOSCreator.git
cd AIOSCreator
copy .env.example apps\web\.env.local
cd apps\web
pnpm install
pnpm dev
```

Open `http://127.0.0.1:3000` (listens on `0.0.0.0:3000` for LAN).

From repo root:

```powershell
pnpm dev
```

### ComfyUI

```powershell
.\scripts\start-comfyui.ps1 -Detach
```

Full stack (app + Comfy, does not kill other remote-desktop tools):

```powershell
.\scripts\start-stack.ps1
```

GPU status in the header is Comfy HTTP, not VGA. **GPU Off** means `:8188` is down.

### First operator loop

1. **Commerce → Products** — paste a listing URL or **Add SKU manually** and upload pack shots.
2. **Create → Characters** — lock identity (GPT 2.5 if keyed, else local).
3. Open the character workspace → **Generate / Edit** stills (pick aspect). For swimwear/NSFW use **Qwen Image Edit**.
4. **Affiliate video** or **Image to video** (H3 local, Wan cloud if keyed).
5. Keep paid jobs under **System → Usage** spend cap.

---

## Environment

Copy `.env.example` → `apps/web/.env.local`. **Never commit `.env.local`.**

| Variable | Purpose |
|---|---|
| `LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL` | Chat / revamp (any OpenAI-compatible API) |
| `COMFYUI_URL` | Default `http://127.0.0.1:8188` |
| `FFMPEG_PATH` | ffmpeg binary if not on PATH |
| `CREATOROS_DATA_DIR` | Override data root (default `../../data` from `apps/web`) |
| `AMAZON_ASSOCIATE_TAG` | Optional; also save in Products UI |
| `DASHSCOPE_API_KEY` | Qwen LLM (Alibaba) |
| `DASHSCOPE_WAN_API_KEY` | Wan 3.0 video only — **separate key**, Singapore |
| `OPENAI_API_KEY` | GPT Image (Character_Generation) |

Prefer **System → Settings** for live keys. Env is fallback.

`.gitignore` excludes `.env`, `.env.*` (except `.env.example`), `data/db/`, `data/media/`, `data/tmp*`.

---

## Repository layout

```
apps/web/          Next.js control plane
apps/worker/       Reserved Python worker
data/db/           Jobs, characters, products (gitignored)
data/media/        Stills, motion, product shots (gitignored)
docs/              PRD notes
scripts/           Comfy, stack, downloads, smokes
workflows/         Comfy API graphs
```

---

## Hardware tiers

| Tier | VRAM | Intent |
|---|---|---|
| T0 | 8–12GB | Images + short quantized video (this repo’s 3060 path) |
| T1 | 16GB | Default production 720p 5–8s |
| T2 | 24GB | Longer MotionControl / overnight |
| T3 | 32GB+ | Long queues |
| TCloud | none | Cloud/hybrid adapters only |

H3 I2V turbo on 12GB: **576×1024**, 6 steps. Native 20-step can stay 640×1152. Do not mix nude LoRA with turbo. Do not upgrade PyTorch to cu130 unless the driver is 580+.

---

## Product rules (short)

1. Do not train a new foundation model.
2. ComfyUI infers. AIOS Creator owns objects, rights, jobs, routing.
3. Affiliate is provider-agnostic. Amazon first; Shopee / Tokopedia / TikTok Shop URLs import too.
4. Publish via official APIs only, else export a pack.
5. One GPU owner. A running job stays on the box if you change pages.
6. Commercial stills should use license-safe checkpoints (Klein 4B / Qwen / Wan Apache where applicable). Klein Base 9B is research / non-commercial.

---

## License and company

© P2P Labs — [p2plabs.asia](https://p2plabs.asia)

Internal operator software. Checkpoints keep their upstream licenses (Apache-2.0, OpenAI API ToS, DashScope, Flux non-commercial, etc.). Do not redistribute weights from this repo; they are not vendored.

---

## Status

Active workstation build. Some nav items (Engagement, Revenue, Growth Engine, several video tools) are parked or stubbed on purpose. The production path that is meant to work today:

**Product catalog → Character lock → On-model still → H3 / Wan I2V.**
