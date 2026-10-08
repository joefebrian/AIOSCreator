export const PRODUCT_CATEGORIES = ["Fashion", "Bags", "Sleepwear", "Beauty", "Electronics", "Health", "Food", "Home"] as const;

/** Match a try-on upload to a known category. Blank or unknown stays blank. */
export function uploadCategory(raw: string) {
  const t = raw.trim();
  return PRODUCT_CATEGORIES.find((c) => c.toLowerCase() === t.toLowerCase()) || "";
}

/** Filename from a manual try-on upload. A hash file has no product name yet. */
export function uploadProductTitle(raw: string) {
  const t = String(raw || "")
    .replace(/^Deal:\s*/i, "")
    .replace(/^Amazon\.com[:|]\s*/i, "")
    .replace(/\s*\|\s*Amazon\.com\s*$/i, "")
    .replace(/^Jual\s+/i, "")
    .replace(/\.(jpe?g|png|webp)$/i, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/[_|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t || /^[0-9a-f-]{16,}$/i.test(t)) return "Uploaded SKU";
  return t.slice(0, 140);
}

export function inferCategory(p: { category?: string; title?: string }) {
  const stored = p.category?.trim();
  if (stored) {
    if (/^bags?$/i.test(stored)) return "Bags";
    return stored;
  }
  const t = (p.title || "").toLowerCase();
  if (/pajama|pj set|sleepwear|loungewear|nightwear|nightgown|night gown/.test(t)) return "Sleepwear";
  if (/tote|handbag|briefcase|laptop bag|purse|backpack|messenger bag|\bbags?\b/.test(t)) return "Bags";
  if (/dress|baju|lingerie|tanktop|hoodie|jeans|pakaian|fashion|daster|yukensi|hijab|sepatu|jaket|kaos|romper|camisole|shorts|knit/.test(t)) return "Fashion";
  if (/skincare|serum|makeup|lip|beauty|cosmetic|parfum|sabun|shampoo/.test(t)) return "Beauty";
  if (/phone|gadget|charger|earbud|electronic|kabel|lampu/.test(t)) return "Electronics";
  if (/vitamin|suplemen|obat|herbal|health/.test(t)) return "Health";
  if (/snack|makan|minum|kopi|tea|food/.test(t)) return "Food";
  if (/home|kitchen|decor|rumah|panci/.test(t)) return "Home";
  return "Uncategorized";
}
