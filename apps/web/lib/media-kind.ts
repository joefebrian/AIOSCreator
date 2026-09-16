export function isVideoMediaUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  return /\.(mp4|webm|mov)(\?|$)/i.test(url) || /\/api\/media\/(motion|uploads)\/[^/?]+\.(mp4|webm|mov)/i.test(url);
}

/** Pack shots / SKU crops — not a person still. Safe for client + server. */
export function isProductMediaUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  return (
    /\/api\/media\/products\//i.test(url) ||
    /\/uploads\/product-/i.test(url) ||
    /product-1-|product-rest-|product-sheet-/i.test(url)
  );
}
