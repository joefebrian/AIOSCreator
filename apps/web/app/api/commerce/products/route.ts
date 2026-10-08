import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { ensureCatalogTidied, fashionPick, importProductFromUrl, localizeProductImages, scrapeLooksWeak, skuIdentityUrl, tidyProductImages } from "@/lib/product-import";
import { addProductAsset, forgetProductAsset, listProductThumbs, purgeOrphanBagUploads, purgeUncategorizedSkuAssets, rememberProductUrls, syncTryOnUploads } from "@/lib/product-assets";
import { dataRoot, mediaUrlToPath, productFile, productMediaUrl } from "@/lib/paths";
import { matchBrandedContent } from "@/lib/meta-branded";
import { classifyAdUrl, importReferenceAd, listReferenceAds } from "@/lib/reference-ads";
import { tidyStoredProduct } from "@/lib/product-copy";
import { regenProductPhoto } from "@/lib/product-photo";
import { createBlankProduct, deleteProduct, getAmazonAssociateTag, getProduct, listProducts, patchProduct, removeProductImage, setAmazonAssociateTag, setProductBrand, setProductDefaultImage, upsertProduct } from "@/lib/products";

export const runtime = "nodejs";
export const maxDuration = 900;

export async function GET() {
  ensureCatalogTidied();
  syncTryOnUploads();
  const products = listProducts();
  purgeUncategorizedSkuAssets(products);
  purgeOrphanBagUploads(products);
  const fresh = listProducts();
  return NextResponse.json({
    products: fresh,
    referenceAds: listReferenceAds(),
    thumbs: listProductThumbs(fresh),
    amazonAssociateTag: getAmazonAssociateTag() ? "set" : "",
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: "import" | "tag" | "delete" | "local-image" | "patch" | "add-image" | "remove-image" | "set-default" | "create" | "localize" | "tidy" | "tidy-copy" | "instagram" | "branded-search" | "regen-photo" | "set-brand";
    brand?: string;
    instagramUsername?: string;
    url?: string;
    tag?: string;
    id?: string;
    title?: string;
    features?: string[];
    price?: string;
    category?: string;
    affiliateUrl?: string;
    mediaUrl?: string;
    instruction?: string;
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
    if (body.action === "set-brand") {
      if (!body.id || typeof body.brand !== "string") throw new Error("id and brand required");
      setProductBrand(body.id, body.brand);
      return NextResponse.json({ ok: true, products: listProducts() });
    }
    if (body.action === "patch") {
      if (!body.id) throw new Error("id required");
      if (typeof body.brand === "string" && body.brand.replace(/\s+/g, " ").trim().length > 80) throw new Error("Keep the brand under 80 characters.");
      const patch: { title?: string; features?: string[]; price?: string; category?: string; affiliateUrl?: string } = {};
      if (typeof body.title === "string") patch.title = body.title.trim();
      if (Array.isArray(body.features)) patch.features = body.features.map((s) => String(s).trim()).filter(Boolean);
      if (typeof body.price === "string") patch.price = body.price.trim();
      if (typeof body.category === "string") patch.category = body.category.trim();
      if (typeof body.affiliateUrl === "string") patch.affiliateUrl = body.affiliateUrl.trim();
      if (Object.keys(patch).length) patchProduct(body.id, patch);
      if (typeof body.brand === "string") setProductBrand(body.id, body.brand);
      return NextResponse.json({ ok: true, products: listProducts() });
    }
    if (body.action === "set-default") {
      if (!body.id || !body.mediaUrl) throw new Error("id and mediaUrl required");
      const product = setProductDefaultImage(body.id, body.mediaUrl);
      if (!product) throw new Error("That photo is not on this SKU.");
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
    if (body.action === "remove-image") {
      if (!body.id || !body.mediaUrl) throw new Error("id and mediaUrl required");
      const product = removeProductImage(body.id, body.mediaUrl);
      if (!product) throw new Error("That photo is not on this SKU.");
      const stillUsed = listProducts().some((row) => row.images.includes(body.mediaUrl!));
      if (!stillUsed && body.mediaUrl.startsWith("/api/media/products/")) {
        forgetProductAsset(body.mediaUrl);
        const abs = path.resolve(mediaUrlToPath(body.mediaUrl));
        const productsDir = path.resolve(dataRoot(), "media", "products");
        const rel = path.relative(productsDir, abs);
        if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) {
          if (fs.existsSync(abs)) fs.rmSync(abs);
          const thumbDir = path.join(dataRoot(), "media", "thumbs");
          const name = path.basename(abs);
          const prefix = `products__${name}`;
          if (name && fs.existsSync(thumbDir)) {
            for (const file of fs.readdirSync(thumbDir)) {
              if (file === prefix || file.startsWith(`${prefix}.w`)) fs.rmSync(path.join(thumbDir, file));
            }
          }
        }
      }
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
    if (body.action === "instagram") {
      if (!body.id || typeof body.instagramUsername !== "string") throw new Error("id and instagramUsername required");
      const handle = body.instagramUsername.trim().replace(/^@/, "");
      patchProduct(body.id, { instagramUsername: handle });
      return NextResponse.json({ ok: true, products: listProducts() });
    }
    if (body.action === "branded-search") {
      const product = body.id ? getProduct(body.id) : undefined;
      const handle = (typeof body.instagramUsername === "string" ? body.instagramUsername : product?.instagramUsername || "").trim();
      const matches = await matchBrandedContent(handle);
      if (product) patchProduct(product.id, { instagramUsername: handle.replace(/^@/, ""), brandedMatches: matches });
      return NextResponse.json({ ok: true, matches, products: listProducts() });
    }
    if (body.action === "tidy") {
      for (const p of listProducts()) tidyProductImages(p);
      return NextResponse.json({ ok: true, products: listProducts() });
    }
    if (body.action === "tidy-copy") {
      if (!body.id) throw new Error("id required");
      const product = await tidyStoredProduct(body.id, { title: body.title, features: body.features });
      return NextResponse.json({ ok: true, product, products: listProducts() });
    }
    if (body.action === "regen-photo") {
      if (!body.id || !body.mediaUrl || typeof body.instruction !== "string") throw new Error("id, mediaUrl, and instruction required");
      const cleaned = await regenProductPhoto(body.id, body.mediaUrl, body.instruction);
      return NextResponse.json({ ok: true, ...cleaned, products: listProducts() });
    }
    const url = (body.url || "").trim();
    if (!url) throw new Error("product URL required");
    if (classifyAdUrl(url)) {
      const imported = await importReferenceAd(url);
      if ("error" in imported && imported.error) throw new Error(imported.error);
      return NextResponse.json({
        ok: true,
        product: imported.product,
        ad: imported.ad,
        warning: imported.ad?.note,
        products: listProducts(),
        referenceAds: listReferenceAds(),
      });
    }
    let product = await importProductFromUrl(url);
    const extra = product as { affiliateWarning?: string; copyWarning?: string };
    const affiliateWarning = extra.affiliateWarning || "";
    const copyWarning = extra.copyWarning || "";
    upsertProduct(product);
    product = await localizeProductImages(product);
    const warning = [scrapeLooksWeak(product), affiliateWarning, copyWarning].filter(Boolean).join(" ");
    return NextResponse.json({ ok: true, product, warning, products: listProducts(), fashion: fashionPick(product) });
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).replace(/sk-[A-Za-z0-9_-]+/g, "sk-…").replace(/EAA[A-Za-z0-9]+/g, "");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
