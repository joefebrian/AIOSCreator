import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataRoot, ensureDataDirs } from "./paths";
import type { PublishMode, SocialPlatform } from "./social-accounts";

export type PostStatus = "draft" | "scheduled" | "publishing" | "published" | "failed" | "exported";
export type Approval = "pending" | "approved" | "rejected";
export type Privacy = "private" | "unlisted" | "public";

export type Publication = {
  id: string;
  accountId: string;
  platform: SocialPlatform;
  characterId?: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  caption: string;
  title?: string;
  tags?: string;
  categoryId?: string;
  disclosure?: string;
  mode: PublishMode;
  privacy: Privacy;
  madeForKids: boolean;
  containsSyntheticMedia: boolean;
  approval: Approval;
  scheduledAt?: string;
  publishedAt?: string;
  status: PostStatus;
  error?: string;
  platformPostId?: string;
  exportPath?: string;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
};

type Store = { posts: Publication[] };

function filePath() {
  ensureDataDirs();
  return path.join(dataRoot(), "db", "publications.json");
}

function nowIso() {
  return new Date().toISOString();
}

function readStore(): Store {
  const file = filePath();
  if (!fs.existsSync(file)) return { posts: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<Store>;
    return { posts: raw.posts || [] };
  } catch {
    return { posts: [] };
  }
}

function writeStore(store: Store) {
  fs.writeFileSync(filePath(), JSON.stringify(store, null, 2), "utf8");
}

export function listPublications(): Publication[] {
  return readStore()
    .posts.slice()
    .sort((a, b) => (b.scheduledAt || b.createdAt).localeCompare(a.scheduledAt || a.createdAt));
}

export function getPublication(id: string): Publication | undefined {
  return readStore().posts.find((p) => p.id === id);
}

export function createPublication(input: Omit<Publication, "id" | "createdAt" | "updatedAt" | "retryCount" | "status"> & { status?: PostStatus }): Publication {
  const store = readStore();
  const now = nowIso();
  const row: Publication = {
    ...input,
    id: randomUUID(),
    retryCount: 0,
    status: input.status || (input.scheduledAt ? "scheduled" : "draft"),
    createdAt: now,
    updatedAt: now,
  };
  store.posts.unshift(row);
  writeStore(store);
  return row;
}

export function updatePublication(id: string, patch: Partial<Publication>): Publication | undefined {
  const store = readStore();
  const i = store.posts.findIndex((p) => p.id === id);
  if (i < 0) return undefined;
  store.posts[i] = { ...store.posts[i], ...patch, id, updatedAt: nowIso() };
  writeStore(store);
  return store.posts[i];
}

export function deletePublication(id: string): boolean {
  const store = readStore();
  const n = store.posts.length;
  store.posts = store.posts.filter((p) => p.id !== id);
  if (store.posts.length === n) return false;
  writeStore(store);
  return true;
}

export function duePublications(now = Date.now()): Publication[] {
  return readStore().posts.filter((p) => {
    if (p.status !== "scheduled" && p.status !== "failed") return false;
    if (p.approval !== "approved") return false;
    if (!p.scheduledAt) return p.status === "failed";
    return Date.parse(p.scheduledAt) <= now;
  });
}
