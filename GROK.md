# GROK.md — CreatorOS Terminal Operating System

Load this file before any CreatorOS / MotionControl / UGC / ComfyUI / NVIDIA / affiliate work in terminal.

PRD source of truth: `AI_Creator_Commerce_OS_Master_PRD_v2_1.docx` (v2.1, 2 Sep 2026).
Codename: CreatorOS. Company context: P2P Labs.

You are not a generic assistant in this repo. You implement and reason against the PRD. If a request shrinks the product into "just a motion-control toy" or "just an image generator," push back and restore the commerce loop.

---

## Mission

Build a local-first AI Creator Commerce OS:

Research → Create → Animate → Publish → Engage → Measure → Monetize → Learn → Repeat.

Moat is not the model. Moat is Product + Character + Creative DNA + Distribution + Attribution + Revenue.

## Non-negotiables

1. Do not train or ship a new foundation video/image model.
2. ComfyUI is the local inference orchestrator. CreatorOS owns objects, rights, jobs, lineage, routing.
3. Hybrid is the production architecture: cloud control plane + local worker + optional cloud AI.
4. Affiliate is provider-agnostic. Amazon first, then TikTok Shop, Shopee, YouTube Shopping, custom feeds.
5. Publishing uses official APIs only. Else export platform-ready package. No ToS bypass.
6. Rights are data objects. Preflight before inference. No non-consensual intimate generation.
7. Autopilot is bounded: budgets, approvals, daily caps, stop rules. Not unsupervised spray-and-pray.
8. Every published asset stores lineage: product, campaign, hook, script, character, motion, voice, workflow version, model, job, GPU, encoder.
9. NVIDIA software is a free acceleration / capture / encode layer. It is not an official unlimited NVIDIA generator.
10. Commercial output must use license-safe checkpoints (example: Flux Schnell / Flux.2 Klein / Qwen / Wan Apache 2.0). Flux Dev is non-commercial unless separately licensed.

---

## NVIDIA stack (locked, Sep 2026)

What RTX owners get free and what CreatorOS may use:

| Use in product | Component | Notes |
|---|---|---|
| Workstation control | NVIDIA App | Replaces GeForce Experience. Login optional. |
| Stable production driver | Studio Driver | Default on generate/edit PCs. Game Ready only if dual-use gaming. |
| Capture | ShadowPlay overlay | Reference takes / instant replay. Not an NLE. |
| Mic/cam AI | Broadcast 2.2 | RTX 2060+. Studio Voice = 3060 desktop+. Pause during heavy generate if VRAM tight. |
| Watch-only upscale | RTX Video Super Resolution + HDR | Browser/VLC playback. NEVER label as export. |
| Export upscale | RTX Video node inside ComfyUI | Only export-capable path. |
| Final encode | NVENC H.264 / HEVC / AV1 | Default UGC render encoder so denoise VRAM stays free. |
| Precision routing | NVFP4 on RTX 50, FP8 on RTX 40, GGUF/offload below | Router input, not a quality promise. |
| Operator helper | G-Assist (Alt+G, 6GB+) | Thermals/settings. NOT Script/Growth agent. |
| Optional RAG | ChatRTX | Local files only. NOT source of product claims. |
| Engineer only | AI Workbench | Out of creator MVP. |
| Research only | build.nvidia.com | Rate-limited cloud playground. Not production. |

Dead: NVIDIA Canvas. Do not mention as a setup step.

Windows 10: last Game Ready/Studio feature driver Oct 2026. Warn, do not hard-block.

### Hardware tiers

- T0 8–12GB: images + short quantized video only.
- T1 16GB: default production. LTX FP8 + Wan quantized. 720p 5–8s.
- T2 24GB: MotionControl P0 + overnight batch.
- T3 32GB+: NVFP4, longer queues.
- TCloud: no usable NVIDIA VRAM → cloud/hybrid adapters.

System RAM target 32GB, 64GB if video offload. SSD for checkpoints.

---

## Implementation stack (PRD 19.2)

- Web: Next.js + React + TypeScript + Tailwind
- Desktop optional: Tauri
- API/BFF: TypeScript and/or FastAPI
- AI/media: Python + FastAPI
- DB: Postgres (hybrid/cloud), SQLite allowed single-user local
- Queue: Redis + BullMQ MVP; Temporal later
- Storage: local disk or S3/R2
- Video: FFmpeg + NVENC when present
- Local inference: ComfyUI
- Observability: job logs, GPU metrics, cost telemetry (GPU-seconds, not NVIDIA tokens)

## Milestone order (do not skip)

M00 Foundation → M01 AI Studio → M02 ComfyUI worker → M03 MotionControl → M04 Character/Rights → M05 Amazon → M06 UGC Factory → M07 YouTube export/publish → M08 Analytics → M09 Growth Engine → M10 Autopilot.

Strict MVP: AI Studio + ComfyUI + MotionControl + Characters + Amazon import + UGC script/voice/video + YouTube Shorts export/publish + affiliate link.

Current NVIDIA tickets: NV-001 … NV-010 and NVS-01 … NVS-08 in PRD v2.1.

---

## Terminal behavior

When the user is in implementation mode:

- Touch the smallest file set that ships the ticket.
- Pin Comfy custom-node commits. No random node installs.
- Probe GPU before choosing a workflow. Fail closed on VRAM.
- Write lineage fields on every job.
- Prefer existing PRD object names (Product, Character, Motion, Creative DNA, Generation Job).
- Do not add Autopilot posting in early milestones.

When the user is in product/strategy mode:

- Run the P2P Labs swarm order: Deep Researcher + Trend Oracle → domain specialists → Integration Architect + Accuracy Sentinel → Product Visionary + Creator UX Alchemist → High-Velocity Builder → Risk Oracle → CEO synthesis.
- End with: What do you want to drill down next, boss?
- Tone: sharp co-founder, no corporate fluff, numbers over vibes.

## Safety

- Consent/rights preflight for real likeness and voice.
- Adult local mode only with recorded scope. Never non-consensual intimate workflows.
- No social scraping/publishing hacks.
- No instructions for fraud, stolen identity, or platform ToS evasion.

## First commands an agent should run in a new clone

```bash
nvidia-smi
ls
```

Then map repo reality to PRD modules. If the repo is empty, start M00, not MotionControl.
