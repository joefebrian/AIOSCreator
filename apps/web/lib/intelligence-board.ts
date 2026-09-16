import { listJobs } from "./store";
import { listProducts } from "./products";
import { listResearchExtracts } from "./research";
import { getIntelligence, platformFromUrl } from "./intelligence";
import { listSocialAccounts } from "./social-accounts";
import { refreshYoutube } from "./social-publish";

export type TrendRow = {
  id: string;
  platform: string;
  title: string;
  url?: string;
  views?: number;
  source: "extract" | "youtube" | "observation";
  count?: number;
  createdAt: string;
};

export type OpportunityRow = {
  id: string;
  kind: "product" | "topic";
  title: string;
  score: number;
  why: string;
  href?: string;
  image?: string;
  pinned: boolean;
  excluded: boolean;
};

export type HookRow = {
  id: string;
  text: string;
  source: string;
  platform: string;
  saved: boolean;
  createdAt: string;
};

function words(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

async function youtubePopular(region: string): Promise<{ rows: TrendRow[]; note: string }> {
  const acc = listSocialAccounts().find((a) => a.platform === "youtube" && a.connectionState === "connected" && a.accessToken);
  if (!acc) {
    return { rows: [], note: "Connect a YouTube account in Distribute → Accounts to pull mostPopular (Data API, legal)." };
  }
  try {
    const fresh = await refreshYoutube(acc);
    const token = fresh.accessToken;
    if (!token) return { rows: [], note: "YouTube token missing after refresh." };
    const q = new URLSearchParams({
      part: "snippet,statistics",
      chart: "mostPopular",
      regionCode: region,
      maxResults: "12",
    });
    const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${q}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as {
      error?: { message?: string };
      items?: { id: string; snippet?: { title?: string; publishedAt?: string }; statistics?: { viewCount?: string } }[];
    };
    if (!res.ok) return { rows: [], note: json.error?.message || `YouTube Data API HTTP ${res.status}` };
    const rows: TrendRow[] = (json.items || []).map((it) => ({
      id: `yt-${it.id}`,
      platform: "youtube",
      title: it.snippet?.title || it.id,
      url: `https://www.youtube.com/watch?v=${it.id}`,
      views: Number(it.statistics?.viewCount || 0) || undefined,
      source: "youtube" as const,
      createdAt: it.snippet?.publishedAt || new Date().toISOString(),
    }));
    return { rows, note: `YouTube mostPopular · ${region}` };
  } catch (err) {
    return { rows: [], note: err instanceof Error ? err.message : String(err) };
  }
}

export async function intelligenceBoard(region = "ID") {
  const intel = getIntelligence();
  const extracts = listResearchExtracts();
  const products = listProducts();
  const jobs = listJobs().filter((j) => j.status === "completed");

  const byPlatform: Record<string, number> = {};
  for (const e of extracts) {
    const p = platformFromUrl(e.url);
    byPlatform[p] = (byPlatform[p] || 0) + 1;
  }

  const extractTrends: TrendRow[] = Object.entries(byPlatform)
    .sort((a, b) => b[1] - a[1])
    .map(([platform, count]) => ({
      id: `ext-${platform}`,
      platform,
      title: `${count} extract${count === 1 ? "" : "s"} from ${platform}`,
      source: "extract" as const,
      count,
      createdAt: extracts[0]?.createdAt || new Date().toISOString(),
    }));

  const obsTrends: TrendRow[] = intel.observations.map((o) => ({
    id: o.id,
    platform: o.platform,
    title: o.note || o.url,
    url: o.url,
    source: "observation" as const,
    createdAt: o.createdAt,
  }));

  const yt = await youtubePopular(region);

  const blob = extracts.map((e) => `${e.imagePrompt} ${e.motionPrompt}`).join(" ").toLowerCase();
  const opportunities: OpportunityRow[] = products.map((p) => {
    const id = `product:${p.id}`;
    const hit = words(p.title).some((w) => blob.includes(w));
    const score = Math.min(100, p.score + (hit ? 12 : 0) + (intel.pins.includes(id) ? 8 : 0));
    return {
      id,
      kind: "product" as const,
      title: p.title,
      score,
      why: hit
        ? `Catalog score ${p.score} · mentioned in Research extracts`
        : `Catalog score ${p.score} · ${p.category || p.provider}`,
      href: `/commerce/products`,
      image: p.images[0],
      pinned: intel.pins.includes(id),
      excluded: intel.excludes.includes(id),
    };
  });

  const topicCount = new Map<string, number>();
  for (const e of extracts) {
    const topic = words(e.imagePrompt).slice(0, 6).join(" ");
    if (topic.length < 8) continue;
    topicCount.set(topic, (topicCount.get(topic) || 0) + 1);
  }
  for (const [topic, count] of topicCount) {
    const id = `topic:${topic}`;
    opportunities.push({
      id,
      kind: "topic",
      title: topic,
      score: Math.min(100, 40 + count * 15 + (intel.pins.includes(id) ? 8 : 0)),
      why: `${count} extract${count === 1 ? "" : "s"} in Research library`,
      href: "/intelligence/research",
      pinned: intel.pins.includes(id),
      excluded: intel.excludes.includes(id),
    });
  }

  opportunities.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.score - a.score;
  });

  const hooks: HookRow[] = [];
  const seen = new Set<string>();
  const pushHook = (row: HookRow) => {
    const key = row.text.toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    hooks.push(row);
  };

  for (const h of intel.hooks) {
    pushHook({ id: h.id, text: h.text, source: h.source, platform: h.platform, saved: true, createdAt: h.createdAt });
  }
  for (const j of jobs) {
    const hook = j.script?.hook?.trim();
    if (!hook) continue;
    pushHook({
      id: `job-${j.id}`,
      text: hook,
      source: j.script?.title || "script job",
      platform: (j.script?.platforms || [])[0] || "any",
      saved: false,
      createdAt: j.createdAt,
    });
  }
  for (const e of extracts) {
    const motion = e.motionPrompt?.trim();
    if (motion) {
      pushHook({
        id: `mot-${e.id}`,
        text: motion.split(/[.!?]/)[0]!.slice(0, 180),
        source: "research motion",
        platform: platformFromUrl(e.url),
        saved: false,
        createdAt: e.createdAt,
      });
    }
  }

  return {
    stats: {
      extracts: extracts.length,
      products: products.length,
      scripts: jobs.filter((j) => j.script?.hook).length,
      observations: intel.observations.length,
      savedHooks: intel.hooks.length,
    },
    trends: {
      youtubeNote: yt.note,
      rows: [...yt.rows, ...obsTrends, ...extractTrends],
      byPlatform,
    },
    opportunities: opportunities.filter((o) => !o.excluded || o.pinned),
    hooks: hooks.slice(0, 80),
  };
}

export type IntelligenceBoard = Awaited<ReturnType<typeof intelligenceBoard>>;
export type { SavedHook };
