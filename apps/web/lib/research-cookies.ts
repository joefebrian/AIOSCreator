import fs from "node:fs";
import { researchCookiesFile } from "./paths";

export type CookieRow = {
  domain: string;
  includeSub: boolean;
  path: string;
  secure: boolean;
  name: string;
  value: string;
};

type Store = {
  header: string;
  netscape: string;
  updatedAt: string;
};

function readStore(): Store {
  const file = researchCookiesFile();
  if (!fs.existsSync(file)) return { header: "", netscape: "", updatedAt: "" };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<Store>;
    return {
      header: typeof parsed.header === "string" ? parsed.header : "",
      netscape: typeof parsed.netscape === "string" ? parsed.netscape : "",
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
    };
  } catch {
    return { header: "", netscape: "", updatedAt: "" };
  }
}

function writeStore(store: Store) {
  fs.writeFileSync(researchCookiesFile(), JSON.stringify(store, null, 2), "utf8");
}

export function parseNetscape(text: string): CookieRow[] {
  const rows: CookieRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const parts = s.split("\t");
    if (parts.length < 7) continue;
    const domain = (parts[0] || "").replace(/^\./, "").toLowerCase();
    if (!domain || !parts[5]) continue;
    rows.push({
      domain,
      includeSub: parts[1] === "TRUE" || (parts[0] || "").startsWith("."),
      path: parts[2] || "/",
      secure: parts[3] === "TRUE",
      name: parts[5]!,
      value: parts.slice(6).join("\t"),
    });
  }
  return rows;
}

function parseHeader(header: string): { name: string; value: string }[] {
  return header
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const i = p.indexOf("=");
      if (i < 1) return null;
      return { name: p.slice(0, i).trim(), value: p.slice(i + 1).trim() };
    })
    .filter((x): x is { name: string; value: string } => Boolean(x?.name));
}

function hostMatches(host: string, domain: string, includeSub: boolean) {
  const h = host.toLowerCase();
  const d = domain.toLowerCase().replace(/^\./, "");
  if (h === d) return true;
  return includeSub && h.endsWith(`.${d}`);
}

export function cookieHeaderFor(urlOrHost: string, extraHeader = ""): string {
  const store = readStore();
  let host = urlOrHost.toLowerCase();
  try {
    host = new URL(urlOrHost).hostname.toLowerCase();
  } catch {
    host = urlOrHost.replace(/^https?:\/\//, "").split("/")[0] || urlOrHost;
  }
  const map = new Map<string, string>();
  for (const row of parseHeader(store.header)) map.set(row.name, row.value);
  for (const row of parseNetscape(store.netscape)) {
    if (hostMatches(host, row.domain, row.includeSub)) map.set(row.name, row.value);
  }
  for (const row of parseHeader(extraHeader)) map.set(row.name, row.value);
  return [...map.entries()].map(([n, v]) => `${n}=${v}`).join("; ");
}

export function cookiesStatus() {
  const store = readStore();
  const hosts = new Set<string>();
  for (const row of parseNetscape(store.netscape)) if (row.domain) hosts.add(row.domain);
  const headerCount = parseHeader(store.header).length;
  const netscapeCount = parseNetscape(store.netscape).length;
  return {
    saved: headerCount + netscapeCount > 0,
    headerCount,
    netscapeCount,
    hosts: [...hosts].sort(),
    updatedAt: store.updatedAt,
  };
}

export function saveResearchCookies(input: { header?: string; netscape?: string }) {
  const prev = readStore();
  const header = input.header != null ? input.header.trim() : prev.header;
  const netscape = input.netscape != null ? input.netscape.trim() : prev.netscape;
  const next: Store = { header, netscape, updatedAt: new Date().toISOString() };
  writeStore(next);
  return cookiesStatus();
}

export function clearResearchCookies() {
  writeStore({ header: "", netscape: "", updatedAt: new Date().toISOString() });
  return cookiesStatus();
}

export function writeNetscapeTemp(file: string) {
  const store = readStore();
  const body = store.netscape.trim()
    ? store.netscape
    : "# Netscape HTTP Cookie File\n";
  fs.writeFileSync(file, body, "utf8");
}
