import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { NextResponse } from "next/server";
import { listCharacters } from "@/lib/characters";
import { importProductFromUrl, localizeProductImages, scrapeLooksWeak } from "@/lib/product-import";
import { addProductAsset, listProductThumbs, rememberProductUrls } from "@/lib/product-assets";
import { productFile, productMediaUrl } from "@/lib/paths";
import { createBlankProduct, deleteProduct, getAmazonAssociateTag, getProduct, listProducts, patchProduct, setAmazonAssociateTag, upsertProduct } from "@/lib/products";

export const runtime = "nodejs";

function backfillSkuFromEdits() {
  for (const c of listCharacters()) {
    for (const e of c.edits ?? []) {
      if (e.mode !== "product") continue;
      const urls = (e.baseUrl || "")
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean);
      rememberProductUrls(urls, `SKU · ${c.name}`);
    }
  }
}

export async function GET() {
  backfillSkuFromEdits();
  const products = listProducts();
  return NextResponse.json({
    products,
    thumbs: listProductThumbs(products),
    amazonAssociateTag: getAmazonAssociateTag() ? "set" : "",
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: "import" | "tag" | "delete" | "local-image" | "patch" | "add-image" | "create" | "localize";
    url?: string;
    tag?: string;
    id?: string;
    title?: string;
    features?: string[];
    price?: string;
    category?: string;
    mediaUrl?: string;
  };
  try {
    if (body.action === "local-image") {
      if (!body.id) throw new Error("id required");
      const product = getProduct(body.id);
      if (!product) throw new Error("product not found");
      const src = (product.images || []).find((u) => /^https?:\/\//i.test(u));
      if (!src) throw new Error("no product image URL to download");
      const res = await fetch(src, { redirect: "follow" });
      if (!res.ok) throw new Error(`image HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const ext = src.includes(".png") ? "png" : src.includes(".webp") ? "webp" : "jpg";
      const id = `${product.id.slice(0, 8)}-${randomUUID().slice(0, 6)}`;
      const dest = productFile(id, ext);
      fs.writeFileSync(dest, buf);
      const imageUrl = productMediaUrl(id, ext);
      addProductAsset({ url: imageUrl, title: product.title, productId: product.id, source: "catalog" });
      if (!product.images.includes(imageUrl)) {
        upsertProduct({ ...product, images: [imageUrl, ...product.images], updatedAt: new Date().toISOString() });
      }
      return NextResponse.json({ ok: true, imageUrl });
    }
    if (body.action === "tag") {
      setAmazonAssociateTag(body.tag || "");
      return NextResponse.json({ ok: true, amazonAssociateTag: getAmazonAssociateTag() ? "set" : "" });
    }
    if (body.action === "patch") {
      if (!body.id) throw new Error("id required");
      const patch: { title?: string; features?: string[]; price?: string; category?: string } = {};
      if (typeof body.title === "string") patch.title = body.title.trim();
      if (Array.isArray(body.features)) patch.features = body.features.map((s) => String(s).trim()).filter(Boolean);
      if (typeof body.price === "string") patch.price = body.price.trim();
      if (typeof body.category === "string") patch.category = body.category.trim();
      patchProduct(body.id, patch);
      return NextResponse.json({ ok: true, products: listProducts() });
    }
    if (body.action === "add-image") {
      if (!body.id || !body.mediaUrl) throw new Error("id and mediaUrl required");
      const product = getProduct(body.id);
      if (!product) throw new Error("product not found");
      const images = [body.mediaUrl, ...product.images.filter((u) => u !== body.mediaUrl)].slice(0, 8);
      addProductAsset({ url: body.mediaUrl, title: product.title, productId: product.id, source: "upload" });
      patchProduct(body.id, { images });
      return NextResponse.json({ ok: true, products: listProducts() });
    }
    if (body.action === "delete") {
      if (!body.id) throw new Error("id required");
      deleteProduct(body.id);
      return NextResponse.json({ ok: true, products: listProducts() });
    }
    if (body.action === "create") {
      const row = createBlankProduct(body.title || "", body.category);
      upsertProduct(row);
      return NextResponse.json({ ok: true, product: row, products: listProducts() });
    }
    if (body.action === "localize") {
      if (!body.id) throw new Error("id required");
      const product = getProduct(body.id);
      if (!product) throw new Error("product not found");
      await localizeProductImages(product);
      return NextResponse.json({ ok: true, products: listProducts() });
    }
    const url = (body.url || "").trim();
    if (!url) throw new Error("product URL required");
    let product = await importProductFromUrl(url);
    upsertProduct(product);
    product = await localizeProductImages(product);
    const warning = scrapeLooksWeak(product);
    return NextResponse.json({ ok: true, product, warning, products: listProducts() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
