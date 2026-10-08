import fs from "node:fs";
import path from "node:path";
import { comfyTxt2Img } from "./comfy";
import { dataRoot, ensureDataDirs, mediaUrlToPath } from "./paths";
import { getFashionProject, readFashionDb, writeFashionDb, type FashionProject } from "./ugc-fashion";

export const FASHION_PROMPT_MODELS = [
  { id: "deepseek-ai/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash" },
  { id: "z-ai/glm-5.3", label: "GLM 5.3" },
  { id: "meta/muse-glimmer-30b", label: "Muse Glimmer 30B" },
] as const;

const CHAT = "https://integrate.api.nvidia.com/v1/chat/completions";

function config() {
  const file = path.join(dataRoot(), "db", "nvidia.json");
  if (!fs.existsSync(file)) return { apiKey: "", imageModel: "" };
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as { apiKey?: string; imageModel?: string };
  } catch {
    return { apiKey: "", imageModel: "" };
  }
}

function scrub(message: string) {
  const key = config().apiKey || "";
  return String(message || "NVIDIA request failed").split(key).join("").slice(0, 280);
}

export function fashionPromptModel(id?: string) {
  return FASHION_PROMPT_MODELS.some((row) => row.id === id) ? id! : FASHION_PROMPT_MODELS[0].id;
}

export async function rewriteFashionPrompt(project: FashionProject, model = FASHION_PROMPT_MODELS[0].id) {
  const key = config().apiKey?.trim();
  if (!key) throw new Error("NVIDIA API key is missing.");
  const chosen = fashionPromptModel(model);
  const facts = [
    `Person: ${project.gender}, age ${project.age}.`,
    `Scene style: ${project.style}. Framing: ${project.framing}. Lighting: ${project.lighting}. Market: ${project.market}.`,
    `Additional instructions: ${project.instructions || "none"}.`,
    "Products:",
    ...project.items.map((item, index) => `${index + 1}. slot ${item.slot}: ${item.title.replace(/&#x27;|&#39;/gi, "'").slice(0, 180)}`),
  ].join("\n");
  const res = await fetch(CHAT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: chosen,
      temperature: 0.2,
      max_tokens: 1600,
      reasoning_effort: "low",
      messages: [
        {
          role: "system",
          content: "Rewrite this into one fashion still prompt. Output only the prompt. One adult person. One scene: if the style and the extra note disagree, follow the extra note. Name each product once, short, no marketplace, no size, no HTML. A bag is a bag and shoes are shoes. Do not ask for brand names printed on clothes. End with: no extra people, no text, no watermark. Under 700 characters.",
        },
        { role: "user", content: facts },
      ],
    }),
    signal: AbortSignal.timeout(150_000),
  });
  const json = await res.json().catch(() => ({})) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
  if (!res.ok) throw new Error(scrub(json.error?.message || `NVIDIA ${res.status}`));
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("NVIDIA returned an empty prompt.");
  return text.replace(/^["']|["']$/g, "").slice(0, 1200);
}

async function qwenStill(project: FashionProject) {
  const files = project.items
    .map((item) => (item.imageUrl?.startsWith("/api/media/") ? mediaUrlToPath(item.imageUrl) : ""))
    .filter((file) => file && fs.existsSync(file));
  const refs = { scene: files[0], body: files[1], extra: files.slice(2, 5) };
  const result = await comfyTxt2Img(project.prompt, refs, "qwen-image-2.1", { width: 768, height: 1024, kind: "scene" });
  return result.buffer;
}

export async function renderQueuedFashionStills(projectIds: string[]) {
  const saved: { projectId: string; candidateId: string; url?: string; error?: string }[] = [];
  for (const projectId of projectIds) {
    const project = getFashionProject(projectId);
    if (!project) continue;
    const queued = (project.candidates || []).filter((candidate) => candidate.source === "planned" && candidate.status === "queued" && !candidate.url);
    for (const candidate of queued) {
      try {
        const bytes = await qwenStill(project);
        const url = saveStill(candidate.id, bytes);
        markStill(projectId, candidate.id, url);
        saved.push({ projectId, candidateId: candidate.id, url });
      } catch (err) {
        const message = scrub(err instanceof Error ? err.message : String(err));
        markStill(projectId, candidate.id, "", message);
        saved.push({ projectId, candidateId: candidate.id, error: message });
      }
    }
  }
  return saved;
}

function saveStill(id: string, bytes: Buffer) {
  const dir = path.join(ensureDataDirs(), "media", "fashion");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.jpg`), bytes);
  return `/api/media/fashion/${id}.jpg`;
}

function markStill(projectId: string, candidateId: string, url: string, error = "") {
  const db = readFashionDb();
  const project = db.projects.find((row) => row.id === projectId);
  const candidate = project?.candidates?.find((row) => row.id === candidateId);
  if (!project || !candidate) return;
  if (url) {
    candidate.status = "ready";
    candidate.source = "comfy";
    candidate.url = url;
    candidate.decision = "pending";
    delete candidate.blocked;
    if (!project.stillUrl) project.stillUrl = url;
  } else {
    candidate.blocked = error || "Qwen still failed.";
  }
  const pending = (project.candidates || []).some((row) => row.revision === project.revision && row.status === "queued" && !row.blocked);
  const ready = (project.candidates || []).some((row) => row.revision === project.revision && row.status === "ready" && row.url);
  if (!pending && ready) project.stage = "AWAITING_LOOK_APPROVAL";
  project.updatedAt = new Date().toISOString();
  writeDbSafe(db);
}

function writeDbSafe(db: ReturnType<typeof readFashionDb>) {
  writeFashionDb(db);
}
