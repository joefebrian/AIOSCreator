# Research brief — Screen recording 2026-09-15 (Lili Hung workspace)

Source video: `C:\Users\USER\Downloads\Screen Recording 2026-09-15 at 12.24.29 AM.mov`
Duration: 112.7s · 1706×1322 · 60fps · recorded on Mac 15.4.1
Frames extracted: `docs/screenrec-2026-09-15/f-001.jpg` … `f-056.jpg` (1 frame / 2s)

## What the recording is

Operator walkthrough of **APOB.ai** character workspace for public model **Lili Hung** (P2P Labs). Confirmed by Community modal watermark `apob`, Follow chip, Pricing/Log in, and the exact 10-tool sidebar already listed in `docs/AIOS_Creator_Character_Workspace_PRD_v1.md`.

This is **not Higgsfield Soul**. Higgsfield is a different identity stack (Soul ID + Seedance/Kling). APOB is the pixel reference the operator recorded. CreatorOS must **rebrand** (v1 already forbids copying APOB logo/brand) but **keep the IA**.

## Operator intent (inferred)

Ship CreatorOS `/create/characters/:id/workspace` so a locked character can run the same production chain as APOB: stills → I2V → clone/edit video → talking → T2V/storyboard → extend → subtitles, with `@Character` chips, presets, select-content library, and live cost.

## Walk order in the recording

1. Add subtitles empty canvas (select/upload video)
2. Storyboard to video (platform, length dropdown, ratio, elements, video brief)
3. Image to video (ref image, last frame, elements 0/25, native audio, camera, 200 credits/s)
4. Select content modal — Generation | Community (community marketplace of other models)
5. Edit video tabs (character / motion / everything / face swap / style / shot / product / background / upscale)
6. Clone Video (preserve outfit/bg/style/motion/product, 240 credits/s)
7. Hover Talking video (canvas not fully shown)
8. Text to video (presets + chips, 200 credits/s, −1000 credits for 5s)
9. Hover Extend video (canvas stayed on T2V)
10. Add subtitles again + Image group (Generate image / Edit image)

## Tool inventory (from frames)

### Chrome (every screen)
- Back · character avatar + name + “9 days ago”
- Views 164 · Like · Comment · Share
- Pricing · Log in
- Org: P2P Labs · Follow
- Left sidebar: Video tools then Image group
- Gallery under canvas: Generation | Inspiration · filters All / Video / Image / Storyboard
- Inspiration already has 3 beach stills of Lili

### Storyboard to video (f-003…f-009)
Banner: “Select a platform, length, and ratio. Enter your video brief, @Lili Hung, optionally add additional characters, a background, or products, then hit Generate.”
- Platform: Please select
- Length: 15s, 30s, 45s, 1 minute, 3 minutes, 5 minutes, 10 minutes
- Ratio: Please select
- Element (0/50): Characters (+ Add), Background, Product (optional)
- Video brief 0/20000 with locked `@Lili Hung` chip
- Generate disabled until required fields

### Image to video (f-011…f-014, f-020)
- Reference image: Select content | Upload image
- Add last frame + “Generate last frame from first frame”
- Audio: Native audio toggle = “Synchronized audio-video generation”
- Voice model
- Elements (0/25) — many + Add element rows
- Description placeholder (camera/smile/jacket/rain window)
- + Camera · + Template · + Add shot (right rail)
- Camera menu visible: Station, Handheld, Zoom Out, Zoom In, Around Char.
- Bar: **200 credits/s** · Duration **5s** · Resolution **720P** · Quality Fast / Ultra / UltraS
- v1 PRD said 10 credits/s, 4s, 480P — **recording supersedes v1 quotes**

### Select content modal (f-016, f-018, f-052)
Tabs: Generation | Community
Community is a public masonry of other users’ clips/stills (Yuno, Alexandra, APOB_IRO, Jazial infographics, fitness UGC). Not required for CreatorOS v2 (single-operator). Generation tab = this character’s library.

### Edit video (f-022…f-028)
Tabs: Edit character | Edit motion | Edit everything | Video face swap | Edit style | Edit shot | Edit product | Edit background | Upscale
- Source: Select content | Upload video · “Use a video between 4 and 15 s.”
- Edit character: optional reference image (Select / Generate / Upload). Copy: “If you don’t provide a reference image, we’ll choose one automatically.” Link: “To make your character follow the video’s motion, use Edit motion.”
- Edit style: style description 0/4000 + preset grid (Steampunk, Marble Sculpture, Japanese Anime, Pencil Sketch, Pixel Art, Claymation, Ukiyo-e, Spirited Away, Moe Anime, Pixar, Golden Age Disney, My Little Pony, Bronze Sculpture, Candy, 3D Chibi, Fabric, …)
- Edit background: Image+Prompt | Prompt · upload PNG/JPG ≤10MB · optional caption 0/4000
- Bar: **36 credits/s** · Duration auto · 720P · Quality **Best** / Ultra / UltraS
- v1 said 16 credits/s · 480P

### Clone Video (f-029)
- Base video: Select content | Click to upload
- Clone options: Select all 5/5 — Outfit, Background, Style, Motion, Product
- Additional details + Element + Template
- Right rail: “+ Add reference character image · Overrides model image”
- Link: “Want to clone an image instead? Switch to Clone Image”
- Bar: **240 credits/s** · Duration auto · 720P / FHD · Best / Ultra / UltraS
- v1 said 16 credits/s

### Text to video (f-030…f-049)
Banner: “Each shot allows one camera movement selection, while art style is set globally in the first shot only.”
- Native audio + Voice model
- Presets: Art style, Camera movement, Clothing, Architecture, Landscape, Weather
- Description with chips: @Lili Hung, Cafe, Rainy Day, Hot summer, Realistic, Follow Char., later Swimwear, Underwater
- + Add shot rail · Template
- Art style tiles: Customize, Vintage Anime, Anime Sketch, Chinese Anime, Cute 3d, Cute comic, Linear Manga, Ghibli, Realistic
- Clothing: Casual, Suit, Kimono, Tuxedo, Sportswear, Swimwear, Overcoat, Hoodie, Formal, Business casual, Cold winter
- Landscape: Underwater, Grove, Desert, Cliff, Forest, Volcano, Waterfall, Onsen
- Bar: **200 credits/s** · Aspect **9:16 / 3:4 / 16:9 / 4:3 / 1:1** · Duration 5s · Resolution **720P / FHD / QHD / 4K** · Fast / Ultra / UltraS
- Generate button shows **−1000 credits** at 5s × 200/s
- v1 said 10 credits/s · 4s · 480P

### Add subtitles (f-001, f-055)
Empty player: “Your reference video will appear here once you select content or upload a video.”
Select content | Upload video · **2 credits/s** · Generate

### Image group
Generate image + Edit image listed. Recording did not open those canvases (v1 already specced generate/edit image).

## CreatorOS today (gap)

`CharacterStudio.tsx`:
- Ready: generate-image, edit-image, image-to-video (thin I2V canvas)
- Soon: storyboard, edit-video, clone-video, talking-video, text-to-video, extend-video, add-subtitles

Engines already wired:
- Stills: Klein / Z-Image / Qwen Image Edit (local 3060)
- I2V cloud: Wan 3.0 in **AI Studio** (not MotionControl) · `$0.14/s` Prime 720P Singapore
- Copy-motion: Kling 2.6/3.0 + DreamActor V2 on **MotionControl** (still + drive)
- VO: VoiceStudio :3900
- Spend: System → Usage (list rates, $ / result)
- Identity: character identityUrl + look-lock prompts, not LoRA train
- Product SKUs: separate catalog, max 3 refs, not mixed into character stills

## Mapping APOB tools → CreatorOS (proposal for PRD)

Do not invent a fake credit ledger. Quote **USD from `lib/cloud-rates.ts`** on the sticky bar.

| APOB tool | CreatorOS engine | Notes |
|---|---|---|
| Generate image | Klein / Qwen local | Already P0 |
| Edit image | Qwen Image Edit | Already P0 · chat/product/undress |
| Image to video | Wan 3.0 I2V (cloud) or MiniMax H3 (GPU) | Default Wan; last-frame = Wan first+last if we add it later |
| Text to video | Wan 3.0 (still optional) | Preset chips already exist in `prompt-presets.ts` |
| Clone Video / Edit character+motion | Kling Motion Control | Drive = base video, identity = character still |
| Edit style/background/product on video | Not native Kling | P2: restyle still then re-I2V, or skip |
| Talking video | VoiceStudio speech + Wan/H3 I2V | True lipsync = later (no LivePortrait wired) |
| Storyboard | N shots of I2V chained | Length 15s+ = multiple jobs, GPU/cloud queue |
| Extend | Wan with last frame of previous clip | |
| Add subtitles | ffmpeg + Whisper/local ASR | 2 credits/s → quote $0 local |
| Community tab | Out of scope | Single operator |
| Soul-style LoRA train | Out of scope v2 | Identity lock from stills |

## Constraints the PRD must keep
- One GPU owner (3060). Cloud jobs (Wan/Kling/fal) do not occupy GPU.
- Singapore Wan key ≠ Qwen LLM key.
- Kling stays MotionControl copy-motion; Wan stays Studio/workspace I2V.
- Do not mix product SKUs into character gallery.
- Do not copy APOB rose-as-brand if it fights CreatorOS purple — v1 said rose accent for this workspace; decide explicitly.
- NSFW allowed on local Qwen path; cloud safety may reject.
- Failed Wan jobs are not billed (official). Show $0 on fail in Usage.

## Credit number reality check
APOB quotes in the recording (200/s I2V, 240/s clone) are **their credit currency**, not USD. 5s T2V = 1000 credits. Do not port those integers. Convert operator UX to: “Wan 3.0 · ~$0.70 / 5s 720P” etc.

## Existing PRD
`docs/AIOS_Creator_Character_Workspace_PRD_v1.md` (12 Sep 2026) is chrome + generate-image + thin I2V. This recording is the missing video-tool pass. v2 should **extend** v1, not rewrite stills/consent/create.
