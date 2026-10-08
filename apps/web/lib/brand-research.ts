type ResearchPost = { creationDate?: string; type?: string; url?: string; creatorName?: string };
type ResearchMatch = {
  windowStart?: string;
  windowEnd?: string;
  suggestedTemplateId?: string;
  counts?: Record<string, number>;
  posts?: ResearchPost[];
};

export type BrandExample = { creatorName: string; typeLabel: string; url: string; creationDate: string };
export type BrandCount = { type: string; label: string; count: number; creators: string };
export type BrandResearch = {
  line: string;
  windowLabel: string;
  tie: boolean;
  counts: BrandCount[];
  template: string;
  examples: BrandExample[];
};

const TYPE_LABEL: Record<string, string> = {
  ig_reel: "Reel",
  ig_post: "Post",
  ig_story: "Story",
  fb_reel: "Facebook Reel",
  fb_post: "Facebook Post",
  fb_story: "Facebook Story",
};

const TEMPLATE_LABEL: Record<string, string> = {
  T03: "T03 Talking",
  T04: "T04 Lifestyle",
  S01: "S01 Discovery",
  F03: "F03 Pack / hero",
};

function typeLabel(type: string) {
  return TYPE_LABEL[type] || type || "Konten";
}

function leadRank(type: string) {
  if (type.endsWith("reel")) return 0;
  if (type.endsWith("story")) return 1;
  if (type.endsWith("post")) return 2;
  return 3;
}

export function brandedResearch(match?: ResearchMatch | null): BrandResearch | null {
  if (!match) return null;
  const posts = (match.posts || []).filter((post) => post.url?.startsWith("https://") && post.type);
  const counts = match.counts && Object.keys(match.counts).length
    ? match.counts
    : Object.fromEntries(posts.reduce((map, post) => {
        const type = post.type || "unknown";
        map.set(type, (map.get(type) || 0) + 1);
        return map;
      }, new Map<string, number>()));
  const types = Object.entries(counts).filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1] || leadRank(a[0]) - leadRank(b[0]));
  if (!types.length) return null;
  const topCount = types[0][1];
  const leaders = types.filter(([, count]) => count === topCount).map(([type]) => type).sort((a, b) => leadRank(a) - leadRank(b));
  const countText = types.map(([type, count]) => `${count} ${typeLabel(type)}`).join(", ");
  const windowText = match.windowStart && match.windowEnd ? `${match.windowStart} sampai ${match.windowEnd}` : "jendela pencarian ini";
  const frequency = leaders.length > 1
    ? `Riset ${windowText}: brand ini punya ${countText}. Belum ada format yang lebih sering.`
    : `Riset ${windowText}: yang paling sering ${typeLabel(leaders[0])}. Total ${countText}.`;
  const creatorLine = leaders.map((type) => {
    const ranked = new Map<string, number>();
    for (const post of posts.filter((row) => row.type === type)) {
      const name = post.creatorName || "tanpa nama";
      ranked.set(name, (ranked.get(name) || 0) + 1);
    }
    const rows = [...ranked.entries()].sort((a, b) => b[1] - a[1]);
    if (!rows.length) return "";
    const best = rows[0][1];
    const names = rows.filter(([, count]) => count === best).map(([name, count]) => (count > 1 ? `${name} (${count})` : name));
    return names.length > 1 ? `${typeLabel(type)} dibagi ${names.join(", ")}.` : `${typeLabel(type)} dari ${names[0]}.`;
  }).filter(Boolean).join(" ");
  const template = TEMPLATE_LABEL[match.suggestedTemplateId || ""] || match.suggestedTemplateId || "";
  const recipe = template ? ` Resep yang kita pakai ${template}.` : "";
  const creatorNames = (type: string) => {
    const ranked = new Map<string, number>();
    for (const post of posts.filter((row) => row.type === type)) {
      const name = post.creatorName || "tanpa nama";
      ranked.set(name, (ranked.get(name) || 0) + 1);
    }
    const rows = [...ranked.entries()].sort((a, b) => b[1] - a[1]);
    if (!rows.length) return "";
    const best = rows[0][1];
    return rows.filter(([, count]) => count === best).map(([name, count]) => (count > 1 ? `${name} (${count})` : name)).join(", ");
  };
  const examples = leaders.flatMap((type) => posts
    .filter((post) => post.type === type)
    .sort((a, b) => (b.creationDate || "").localeCompare(a.creationDate || ""))
    .slice(0, 2)
    .map((post) => ({
      creatorName: post.creatorName || "tanpa nama",
      typeLabel: typeLabel(post.type || ""),
      url: post.url || "",
      creationDate: post.creationDate || "",
    })));
  return {
    line: `${frequency} ${creatorLine}${recipe} Examples below show the pattern. Creator videos are not saved. The script still comes from this SKU's facts.`.replace(/\s+/g, " ").trim(),
    windowLabel: windowText,
    tie: leaders.length > 1,
    counts: types.map(([type, count]) => ({ type, label: typeLabel(type), count, creators: creatorNames(type) })),
    template,
    examples,
  };
}
