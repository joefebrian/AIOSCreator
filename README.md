# AIOS Creator

Local-first creator OS: characters, stills, motion, and affiliate UGC on your GPU.

Repo: https://github.com/joefebrian/AIOSCreator

## Run

```powershell
cd apps/web
pnpm install
pnpm dev
```

Copy `.env.example` to `apps/web/.env.local` for keys. **Never commit `.env.local`.**

- App: Next.js in `apps/web`
- GPU: ComfyUI on `127.0.0.1:8188`
- Data: `data/db` and `data/media` (gitignored)

## Secrets

API keys live in `apps/web/.env.local` and System → Settings. `.gitignore` excludes `.env` and `.env.*` except `.env.example`.
