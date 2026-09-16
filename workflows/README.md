# Reference workflows (not the product graph)

`minimaxH360SecondSeamlessVideo_v10.json` — Civitai / Reddit “60s on 12GB”.

What it actually is:
- MiniMax H3 **Motion Director** custom node (`j955229`, pin `f9939064`)
- **6 × ~10s T2V** at **640×640** (0.4MP), not one 60s denoise
- Cross-segment continuity (context 22, overlap 5, audio context)
- `clear_vram_between_segments`
- **SageAttention KJ** + KJNodes + INT4 CLIP + LTX latent upscale after
- NVIDIA VSR in post — matches our lock: NVIDIA = upscaler

CreatorOS does **not** load this JSON. Product path: engine `minimax-h3-long` = proven 5s I2V windows, last-frame continue, 5-frame overlap, no SageAttention, no unpinned Director.

Do not `git clone` main. If we ever vendor Director, pin that commit and strip SageAttention.
