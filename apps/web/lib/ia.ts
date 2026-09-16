export const IA: Record<string, { title: string; note: string }> = {
  "/intelligence/research": {
    title: "Research",
    note: "Image/video → prompt (Qwen VL + yt-dlp). Library in Inspector.",
  },
  "/intelligence/trends": {
    title: "Trends",
    note: "Extract mix + operator URLs + YouTube mostPopular. No TikTok Research API.",
  },
  "/intelligence/opportunities": {
    title: "Opportunities",
    note: "Scored SKUs and extract topics. Pin / exclude operator-owned.",
  },
  "/commerce/products": {
    title: "Products",
    note: "Amazon first. Normalize to Product schema. Affiliate URL + disclosure live on the object.",
  },
  "/commerce/programs": {
    title: "Affiliate Programs",
    note: "Provider-agnostic. Amazon → TikTok Shop → Shopee → YouTube Shopping.",
  },
  "/commerce/campaigns": {
    title: "Campaigns",
    note: "Product lists, tags, assignment. Not a generator folder.",
  },
  "/create/studio": {
    title: "AI Studio",
    note: "Product hub. On-model = character + SKU. Faceless = pack/hands UGC. Prompt on card or auto.",
  },
  "/create/ugc-factory": {
    title: "UGC Factory",
    note: "Product → script → still → clip → VoiceStudio VO (waits for GPU) → Calendar. Faceless VO uses /v1/audio/speech.",
  },
  "/create/motion": {
    title: "MotionControl",
    note: "Identity still + drive clip. Kling 2.6 / 3.0 locks the face from the still; video is motion only.",
  },
  "/create/characters": {
    title: "Characters",
    note: "Library of character objects. Identity = GPT Image 2 / Seedream 5.0 Pro when keyed, else Klein. Then GEN set. Voice/rights = M04.",
  },
  "/create/motion-library": {
    title: "Motion Library",
    note: "Reusable motion assets for MotionControl.",
  },
  "/create/assets": {
    title: "Assets",
    note: "Masters + derivatives. Lineage required before publish.",
  },
  "/create/short-drama": {
    title: "ShortDrama",
    note: "Script → shots → still → I2V → stitch. Jellyfish-style board on CreatorOS engines. Huobao not vendored (CC-BY-NC-SA).",
  },
  "/distribute/calendar": {
    title: "Calendar",
    note: "Schedule. YouTube first. Approval before public. Tick while the page is open.",
  },
  "/distribute/queue": {
    title: "Publish Queue",
    note: "Official APIs or export pack. Idempotent retry.",
  },
  "/distribute/accounts": {
    title: "Accounts",
    note: "Official YouTube / TikTok Inbox / Instagram OAuth. Tokens in data/db. Export pack always available.",
  },
  "/grow/engagement": {
    title: "Engagement",
    note: "Intent from comments/DMs. No unofficial inbox bots.",
  },
  "/grow/analytics": {
    title: "Analytics",
    note: "Winner hooks from scripts and Research. Pin to send back into the loop. No invented GMV.",
  },
  "/grow/revenue": {
    title: "Revenue",
    note: "Attributed clicks/GMV only. No invented chips.",
  },
  "/grow/engine": {
    title: "Growth Engine",
    note: "Scale Winner: mutate one variable. Autopilot is last.",
  },
  "/system/workflows": {
    title: "Workflows",
    note: "Stable CreatorOS workflow IDs above ComfyUI graphs.",
  },
  "/system/usage": {
    title: "Usage",
    note: "Paid calls this PC actually sent. Spend + cost per result per provider and model. Estimates from published list rates.",
  },
  "/system/models": {
    title: "Models",
    note: "Job → model → provider → top-up. Daily stack only. Keys in Settings. Spend on Usage. One GPU owner.",
  },
  "/system/comfyui": {
    title: "ComfyUI",
    note: "Preferred local runtime. Native install, no Docker. SD 1.5 image workflow wired to Studio Image node.",
  },
  "/system/rights": {
    title: "Identity Rights",
    note: "Permission is a data object. Non-consensual intimate generation unsupported.",
  },
  "/system/settings": {
    title: "Settings",
    note: "LLM keys live here (OpenRouter free, xAI, OpenAI, custom). Local json, gitignored. ComfyUI is separate.",
  },
};
