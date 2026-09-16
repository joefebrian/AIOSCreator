# AIOSCreator

Local-first **AI Social Media Operating System** (product name in PRD: CreatorOS).

Repo: https://github.com/joefebrian/AIOSCreator  
Vault: `02 Projects/AIOSCreator.md`  
Master PRD: `02 Projects/AIOSCreator/AI_Creator_Commerce_OS_Master_PRD_v2_1.docx` · agent OS: `02 Projects/AIOSCreator/GROK.md`

**Do not build yet.** This folder is a layout + env contract only. No `npm install`, no model download, no ComfyUI until M00 is started on purpose.

## Local-max (this PC)

- GPU: RTX 3060 12GB → draft 480p/720p (FLUX.2 Klein 4B + Wan 2.2 5B)
- DB: SQLite
- Queue: local (no Redis)
- Video: native ffmpeg
- Inference: native ComfyUI (M02)
- **No Docker** in Phase 0

## Layout

```
apps/web/       Next.js control plane (HOME seven-module pipeline)
apps/worker/    Python FastAPI → ComfyUI
data/media/     masters + platform derivatives (gitignored)
data/db/        SQLite (gitignored)
```

## Modules (HOME)

Research → Content Engine → Production Studio → Distribution → Engagement → Analytics → Monetization

Official social APIs only. Local generation has no per-clip fee.

## LLM

LLM: any OpenAI-compatible chat API. Set `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` in `.env.local`. Default example is xAI; not a lock.
