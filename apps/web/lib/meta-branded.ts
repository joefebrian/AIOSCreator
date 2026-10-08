import fs from "node:fs";
import path from "node:path";
import { dataRoot } from "./paths";
import type { BrandedMatchSet, BrandedPost } from "./products";

const GRAPH = "https://graph.facebook.com/v26.0/branded_content_search";

function token() {
  const file = path.join(dataRoot(), "db", "meta-library.json");
  if (!fs.existsSync(file)) throw new Error("Meta token file is missing.");
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { accessToken?: string };
  const value = parsed.accessToken?.trim();
  if (!value) throw new Error("Meta token file is empty.");
  return value;
}

function day(date: Date) {
  return date.toISOString().slice(0, 10);
}

function suggestTemplate(counts: Record<string, number>) {
  const reel = (counts.ig_reel || 0) + (counts.fb_reel || 0);
  const post = (counts.ig_post || 0) + (counts.fb_post || 0);
  const story = (counts.ig_story || 0) + (counts.fb_story || 0);
  if (reel >= post && reel > 0) return "T03";
  if (story > post && story > 0) return "T04";
  if (post > 0) return "S01";
  return "F03";
}

function metaError(accessToken: string, rawMessage: string) {
  const raw = rawMessage.split(accessToken).join("");
  const message = /invalid instagram account name/i.test(raw)
    ? "No Instagram account uses that username. Type the official handle."
    : raw;
  const error = new Error(message);
  (error as Error & { reduce?: boolean }).reduce = /reduce the amount of data/i.test(message);
  return error;
}

async function fetchWindow(username: string, start: string, end: string, fields: string, limit: number) {
  const accessToken = token();
  const posts: BrandedPost[] = [];
  let after = "";
  for (let page = 0; page < 8; page++) {
    const url = new URL(GRAPH);
    url.searchParams.set("ig_username", username);
    url.searchParams.set("creation_date_min", start);
    url.searchParams.set("creation_date_max", end);
    url.searchParams.set("fields", fields);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("access_token", accessToken);
    if (after) url.searchParams.set("after", after);
    const res = await fetch(url, { signal: AbortSignal.timeout(25_000) });
    const json = (await res.json()) as {
      data?: { creation_date?: string; type?: string; url?: string; creator?: { name?: string } | string }[];
      paging?: { next?: string; cursors?: { after?: string } };
      error?: { message?: string };
    };
    if (json.error) {
      const error = metaError(accessToken, String(json.error.message || "Meta request failed"));
      if ((error as Error & { reduce?: boolean }).reduce && posts.length) return posts;
      throw error;
    }
    for (const row of json.data || []) {
      const creator = row.creator;
      posts.push({
        creationDate: row.creation_date || "",
        type: row.type || "",
        url: row.url || "",
        creatorName: typeof creator === "string" ? creator : creator?.name,
      });
    }
    after = json.paging?.next ? json.paging.cursors?.after || "" : "";
    if (!after) break;
  }
  return posts;
}

export async function matchBrandedContent(rawUsername: string): Promise<BrandedMatchSet> {
  const username = rawUsername.trim().replace(/^@/, "");
  if (!username) throw new Error("Instagram username required.");
  const end = new Date();
  const attempts = [
    { days: 30, limit: 10, fields: "creation_date,type,url,creator{name}" },
    { days: 14, limit: 10, fields: "creation_date,type,url,creator{name}" },
    { days: 7, limit: 5, fields: "creation_date,type,url,creator{name}" },
    { days: 7, limit: 5, fields: "creation_date,type,url" },
  ];
  let posts: BrandedPost[] = [];
  let start = "";
  let found = false;
  for (const attempt of attempts) {
    const from = new Date(end);
    from.setUTCDate(from.getUTCDate() - (attempt.days - 1));
    start = day(from);
    try {
      posts = await fetchWindow(username, start, day(end), attempt.fields, attempt.limit);
      found = true;
      break;
    } catch (err) {
      if (!(err as { reduce?: boolean }).reduce) throw err;
    }
  }
  if (!found) throw new Error("Meta still has too much branded content for this handle. Try again in a minute.");
  const counts: Record<string, number> = {};
  for (const post of posts) counts[post.type || "unknown"] = (counts[post.type || "unknown"] || 0) + 1;
  return {
    searchedAt: new Date().toISOString(),
    windowStart: start,
    windowEnd: day(end),
    suggestedTemplateId: suggestTemplate(counts),
    counts,
    posts,
  };
}
