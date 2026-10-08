# Repository discovery — M0

Checked 2 October 2026 against `C:\Users\USER\Grok\apps\AIOSCreator`. This session is Grok 4.7 inside Grok Build. The CLI build number was not printed, and it was not changed.

## What the Factory page was

- Route: `apps/web/app/create/ugc-factory/page.tsx`. Shell hides the right Inspector on `/create/ugc-factory`.
- The previous board is kept, unrouted, at `apps/web/app/create/ugc-factory/legacy-board.tsx`. Its API `POST /api/ugc-factory/board` is unchanged.
- Live `data/db/ugc-factory-board.json` is an empty variant list, cleared 1 October 2026. The previous cards are in `data/db/ugc-factory-board.cleared-2026-10-01.json`. They were not restored.
- Creating a production on the old page selected several markets and wrote one variant per market. The default template pool was the 33 recipes in `apps/web/lib/ugc-factory-recipes.ts`.
- There is no workspace or login layer. Data is a JSON file under `data/db` via `lib/paths.ts` `dataRoot()`.
- Catalog products live in `data/db/products.json` (`lib/products.ts`). A product is one marketplace listing, not a family of physical SKUs. `market` on a product is a host hint, not the new five-market registry.
- Jobs are `data/db/jobs.json`. Factory media is `data/media/UGC_Factory`. ffmpeg is `C:\ffmpeg\bin\ffmpeg.exe`.
- No app test script exists in `apps/web/package.json`.

## Provider bindings found in code

These are code mappings. This audit did not make a paid call.

| Role | Code id | Binding seen in the repo |
| --- | --- | --- |
| Astra scripts | `gpt-6-astra` | `factoryScriptLlm()` / Factory LLM env. Not rechecked live. |
| Jev | `jev-1.13.0` | TypeSafe skill is installed. Not called for this audit. |
| Wan 3.0 Prime | `wan-3-0` | DashScope slug `wan3.0-video-prime` in `lib/dashscope-wan.ts`. |
| Wan 3.0 | `wan-3-0-std` | DashScope slug `wan3.0-video`. Silent swap is not allowed by the new plan. |
| Seedance 2.5 | `seedance-2-5` | Higgsfield `bytedance/seedance-2.5/image-to-video`. |
| Voice | market neural names, VoiceStudio on port 3900 | Used by the old assembler. Not probed in this audit. |
| ASR | none found | Speech on the benchmark stays unknown until a real ASR path exists. |

## Benchmark

Original file name `Download.mp4`. Stored copy `data/media/UGC_Factory/benchmarks/joe-benchmark-2026-10-02.mp4`.

- sha256 `63d0689dbeb2ba5e99609da92a901b506a80e1f0e652e642f070c6d900932c46`
- 35.805 seconds, 576×1024, H.264 + AAC
- Role: quality benchmark. Campaign performance: unknown. Breakdown: not reviewed.

## Not verified

Live Astra, Jev, Wan, Seedance, and VoiceStudio calls. A multimodal reviewer. Workspace isolation, because the app has one local data directory.
