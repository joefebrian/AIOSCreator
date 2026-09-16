export function inferCategory(p: { category?: string; title?: string }) {
  if (p.category?.trim()) return p.category.trim();
  const t = (p.title || "").toLowerCase();
  if (/dress|baju|lingerie|sleepwear|tanktop|hoodie|jeans|pakaian|fashion|daster|yukensi|hijab|sepatu|tas|jaket|kaos/.test(t)) return "Fashion";
  if (/skincare|serum|makeup|lip|beauty|cosmetic|parfum|sabun|shampoo/.test(t)) return "Beauty";
  if (/phone|gadget|charger|earbud|electronic|kabel|lampu/.test(t)) return "Electronics";
  if (/vitamin|suplemen|obat|herbal|health/.test(t)) return "Health";
  if (/snack|makan|minum|kopi|tea|food/.test(t)) return "Food";
  if (/home|kitchen|decor|rumah|panci/.test(t)) return "Home";
  return "Uncategorized";
}
