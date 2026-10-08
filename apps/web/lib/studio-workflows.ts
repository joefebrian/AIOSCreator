import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { studioWorkflowsFile } from "./paths";

export type StudioWorkflow = {
  id: string;
  name: string;
  nodes: unknown[];
  edges: unknown[];
  createdAt: string;
  updatedAt: string;
};

type Store = { workflows: StudioWorkflow[] };

function readStore(): Store {
  const file = studioWorkflowsFile();
  if (!fs.existsSync(file)) return { workflows: [] };
  try {
    const p = JSON.parse(fs.readFileSync(file, "utf8")) as Store;
    return { workflows: Array.isArray(p.workflows) ? p.workflows : [] };
  } catch {
    return { workflows: [] };
  }
}

function writeStore(store: Store) {
  fs.writeFileSync(studioWorkflowsFile(), JSON.stringify(store, null, 2), "utf8");
}

export function listStudioWorkflows() {
  return readStore()
    .workflows.slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(({ nodes, edges, ...meta }) => meta);
}

export function getStudioWorkflow(id: string) {
  return readStore().workflows.find((w) => w.id === id);
}

export function saveStudioWorkflow(input: { id?: string; name: string; nodes: unknown[]; edges: unknown[] }) {
  const store = readStore();
  const now = new Date().toISOString();
  const name = input.name.trim() || "Untitled workflow";
  const byId = input.id ? store.workflows.find((w) => w.id === input.id) : undefined;
  const byName = store.workflows.find((w) => w.name.toLowerCase() === name.toLowerCase());
  const existing =
    byId && byId.name.toLowerCase() !== "product-ugc" && name.toLowerCase() === "product-ugc"
      ? undefined
      : byId || byName;
  const row: StudioWorkflow = {
    id: existing?.id || randomUUID(),
    name,
    nodes: input.nodes,
    edges: input.edges,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  store.workflows = [row, ...store.workflows.filter((w) => w.id !== row.id)];
  writeStore(store);
  return row;
}

export function deleteStudioWorkflow(id: string) {
  const store = readStore();
  const n = store.workflows.length;
  store.workflows = store.workflows.filter((w) => w.id !== id);
  if (store.workflows.length === n) return false;
  writeStore(store);
  return true;
}
