P2P LABS  ·  PRODUCT REQUIREMENTS DOCUMENT
AIOS Creator — Character Workspace
Version 1.0  ·  12 September 2026  ·  Status: Ready to ticket
Source: 10 screenshots workspace Lili Hung + route /create/characters
Target: https://aioscreator.tailc20c39.ts.net/create/characters
Note: Tailscale URL tidak resolve dari publik. Spec berdasarkan screenshot.
1. One-liner
Character bukan chatbot. Character adalah identity lock: satu wajah yang dipakai generate foto, video, talking avatar, clone, edit, dan subtitle — dengan chip @Character otomatis di setiap prompt.
2. Problem & goal
Masalah: halaman /create/characters berhenti di profil. Tidak ada studio kerja. Identity drift kalau user generate tanpa lock. Tool image/video terpisah-pisah.
Goal:
Selesaikan Create Character di /create/characters.
Redirect ke /create/characters/:id/workspace?tool=generate-image
Rebuild information architecture + 10 tool dari screenshot, rebrand AIOS Creator. Jangan copy pixel brand referensi.
Identity consistency > dekorasi.
Non-goals v1:
Marketplace character orang lain, komentar realtime, NLE timeline, LoRA train 20–80 foto, mobile native, payment gateway baru.
3. Personas
Persona
Job
Sukses
AI influencer
Foto/video 9:16 on-model setiap hari
10 aset konsisten dalam 1 sesi
Agency
Banyak character, public/private, update refs
Handoff image → video tanpa re-upload muka
Hobbyist
Coba 1 character
First generate < 60 detik setelah create
4. Routes
GET /create/characters — list + CTA create
GET /create/characters/new — form create
POST /create/characters — buat entity + train job
GET /create/characters/:id/workspace?tool=&mode= — kanonik
tool values: generate-image | edit-image | storyboard-to-video | image-to-video | edit-video | clone-video | talking-video | text-to-video | extend-video | add-subtitles
GET /create/characters/:id/voice — create voice model
5. Data model
Character { id, ownerId, name, slug, avatarUrl, heroUrl, trainingImages[], tiktokUrl?, instagramUrl?, visibility, embedStatus, voiceModelId?, stats, createdAt }
VoiceModel { id, characterId, status, sampleUrl, providerVoiceId }
Element { id, ownerId, type: character|background|product|style, name, assetId }
GenerationJob { id, characterId, tool, mode, payloadJson, creditsQuoted, creditsCharged, status, outputAssetIds[], error }
Shot { id, jobId, camera?, description, startFrameId?, endFrameId? }
Asset { id, kind, url, width, height, durationS, parentJobId, characterId }
CreditLedger { userId, balance, holds[] }
payloadJson WAJIB menyimpan characterId + embedVersion supaya replay tidak drift setelah Update photos.
6. Create Character
Field
Rule
Name
Required, 2–40 chars
Training photos
Min 1, recommended 8–20, max 30. jpg/png/webp ≤ 15MB
Hero image
Optional; default first photo
Gender / age
Optional, prompt helper only
Language
Default dari account
TikTok / Instagram URL
Optional
Visibility
Private default
Likeness consent
Required checkbox. Submit blocked jika kosong
Submit → queued → toast Training identity → redirect workspace.
embedStatus: queued | training | ready | failed.
Header “100%” di screenshot = credit/plan meter, BUKAN training completeness. Training tampil pill terpisah: Training… / Ready.
Workspace dibuka meski masih training. Banner warning. Generate image best-effort.
Failed: alasan + reupload. Jangan orphan character tanpa foto.
7. Workspace chrome (4 zona)
Grid fixed: App chrome · Character header · Sidebar 240px · Canvas · Sticky generate bar.
App chrome:
Back + name · Gift (opsional) · credit meter + Upgrade
Character header:
Avatar, name, TikTok/IG icons, relative date
+ Create Voice Model (atau Voice ready)
Views, Like, Comment, Share (v1 boleh counter lokal, bukan social graph)
Public toggle, Update, Delete (confirm ketik nama)
Sidebar:
VIDEO: Storyboard to video, Image to video, Edit video, Clone Video, Talking video, Text to video, Extend video, Add subtitles
IMAGE: Generate image, Edit image
Selected token SATU (jangan biru vs oranye campur). Group Image background cream #FFF7ED ok.
Tool belum ready = label Soon, jangan canvas palsu.
Canvas:
Mode tabs · info banner rose dismissible · 2–3 kolom kerja
Sticky bar:
Credits live · settings tool-aware · Generate. Disabled harus kelihatan disabled.
Gallery (terutama Generate image): Generation | Inspiration + filter All / Video / Image / Storyboard
Empty: “It looks like this model is new for you. Let’s try it out!”
8. Shared composer rules
@Character chip locked, tidak removable di workspace ini, selalu masuk payload.
Preset click = insert chip ke composer, bukan hidden setting.
Element cap: 4 di image tools, 50 di storyboard.
Select content = library character ini. Upload drag-drop, dashed rose border.
Job states: queued, running (progress), succeeded (gallery card), failed (retry + reason), cancelled.
Insufficient credits = modal Upgrade, bukan silent disable tanpa alasan.
9. Tool specs
9.1 Generate image — MVP WAJIB
Modes v1: Chat to generate. Stub P3: Complete set, Clone Image (tab ada di SS, isi tidak ada).
Left presets: Art style, Clothing, Architecture, Landscape, Weather + Element 0/4
Right: tokenized description + Template
Bar: 24 credits/image · Quantity 1–4 · Aspect 9:16 default (juga 3:4, 1:1, 16:9, 4:5) · Quality Fast | Ultra 2K | Ultra 4K | UltraS 4K
Valid: credits cukup AND (text ATAU minimal 1 preset)
Acceptance: Given character Ready, when user keeps @Character + preset Weather + Generate 9:16 Ultra 2K, then job deducts quoted credits and gallery shows result with identity preserved.
9.2 Image to video — MVP WAJIB
Reference image wajib (Select / Upload). Last frame opsional + Generate last frame from first.
Motion description. Native audio toggle = synchronized A/V.
+ Element + Voice model + Camera. + Add shot = P2.
Bar: 10 credits/s · Duration default 4s · Resolution 480P · Quality Fast / Ultra / UltraS
9.3 Edit image — P1
Modes: Chat to edit (P1). Stub: Face swap, Edit clothing, Upscale, Remove background.
Base image wajib. Description 0/20000. + Element + Additional image.
Bar: Aspect Keep original · Quality Ultra 4K / UltraS 4K
9.4 Talking video — P1
Modes: Talking Avatar (P1). Lip sync stub P3 (tab tanpa screenshot isi).
Driving image wajib. Create audio | Select audio.
Voice model, mood, script 0/2000, speed 0.5x–2x.
Bar: 20 credits/s · Resolution 720P · Quality Best / Ultra / UltraS
Jika voice kosong: CTA Create Voice Model.
9.5 Text to video — P1
Native audio + Voice model. Presets termasuk Camera movement.
Rule: 1 camera move per shot. Art style global di shot 1 saja.
Bar: 10 credits/s · Aspect 9:16 · Duration 4s · 480P · Fast / Ultra / UltraS
9.6 Clone Video — P2
Base video. Checklist Select all: Outfit, Background, Style, Motion, Product.
Additional details + Element + Template. Rail: reference character image overrides model image.
Link ke Clone Image. Bar: 16 credits/s · 480P/720P/FHD · Best / Ultra / UltraS
9.7 Edit video — P2
Tabs (sebagian stub): Edit character | Edit motion | Edit everything | Video face swap | Edit style | Edit shot | Edit product | Edit background | Upscale
Source video 4–15s. Reference image optional.
Bar: 16 credits/s · Duration auto · 480P · Best / Ultra / UltraS
9.8 Storyboard to video — P3
Platform, Length, Ratio required. Elements 0/50: Characters (auto current), Background, Product.
Video brief 0/20000 + @Character.
9.9 Extend video — P3
Source video + last frame optional. Description 0/2000. Native audio.
Bar: 36 credits/s · Extend 4s · 720P · Fast / Ultra / UltraS
9.10 Add subtitles — P3
Empty player copy persis screenshot. Select / Upload.
V1 min: ASR → edit lines → SRT + optional burned MP4. 2 credits/s.
9.11 Create Voice Model
Dari header, bukan sidebar. Audio 10–60s + consent. Status Uploading / Training / Ready / Failed.
10. Credit & quality matrix
Angka screenshot = UX quote. Source of truth = server price table. Quality taxonomy standar: Fast · Ultra · UltraS, plus resolusi terpisah (480P/720P/FHD atau 2K/4K). Jangan campur Fast vs Best tanpa mapping. Map Best = Ultra quality preset untuk video edit/clone/talking.
Tool
Unit
Quote SS
Default
Generate image
/image
24
9:16 · Fast
Image to video / Text to video
/s
10
4s · 480P
Edit / Clone video
/s
16
source duration
Talking video
/s
20
720P
Extend video
/s
36
extend 4s · 720P
Subtitles
/s
2
source duration
11. Design tokens
Light-first. Accent rose #E11D48. Text #111827. Muted #6B7280.
Surfaces: #FFFFFF / #FAFAFA. Sidebar video #F3F6FB. Image group #FFF7ED.
Preset washes: lime / lilac / peach / mint / lavender / amber outline untuk + Add.
Radius 10 controls, 14 cards. Border 1px #E5E7EB. Dropzone dashed rose.
Type: Inter atau Geist. 12 helper / 14 body / 16 title.
8pt grid. Satu primary CTA per screen. Focus ring visible.
Jangan purple SaaS, jangan glass penuh, jangan copy logo/brand referensi.
Dark mode = P4.
12. Phasing
Phase
Scope
MVP / P0
Create + consent + train status + workspace chrome + Generate image Chat + gallery + I2V single shot + credits bar + Public/Update/Delete
P1
Edit image Chat, Talking Avatar + Voice CTA, Text to video, handoff Animate
P2
Clone Video, Edit video core (character/motion), Add shot I2V
P3
Storyboard, Extend, Subtitles, Complete set, Clone Image, Lip sync, Inspiration tab
P4
Social graph, LoRA 20+ photos, dark mode, mobile polish
13. Acceptance criteria MVP
AC1. After Ready, land workspace?tool=generate-image with locked @Character.
AC2. Header shows name, avatar, Public, Update, Delete, Voice CTA.
AC3. Sidebar lists all 10 tools; unbuilt tools show Soon.
AC4. Empty description → Generate disabled + alasan.
AC5. Valid generate → Generation card + credits charged. Failed job refunds.
AC6. Empty gallery shows first-run copy + CTA.
AC7. I2V rejects generate without reference image.
AC8. Create without consent checkbox cannot submit.
AC9. Delete requires typing character name.
AC10. 1440 = 3 pane. 390 = stacked, no horizontal scroll.
14. Open questions
Q1. 100% di header: quota plan atau training? Keputusan PRD: quota/plan.
Q2. Complete set, Clone Image, Lip sync: tidak ada screenshot isi. Jangan tebak — stub sampai design pass.
Q3. Vendor model per tier?
Q4. Credit source of truth existing ledger AIOS?
Q5. Like/Comment/Share live atau dummy?
Q6. Multi-character storyboard: character lain harus exist dulu?
Q7. Training latency SLA?
15. Keputusan CEO
Ship MVP dulu. Sidebar boleh penuh supaya IA terasa lengkap, canvas palsu jangan. Identity inject adalah jantung product — kalau ini goyah, 8 tool video hanya memperbesar permukaan bug.
Next step: ticket P0 — route redirect, token editor, generate-image job, gallery, credit quote.
End of PRD v1.0 — P2P Labs
