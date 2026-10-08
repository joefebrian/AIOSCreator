import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { affiliateForSku, readCarousel } from "@/lib/factory-carousel";
import { exportCarouselFiles } from "@/lib/factory-carousel-export";
import { dataRoot } from "@/lib/paths";
import { readSharedCatalog } from "@/lib/shared-catalog";
import { readFactoryV2 } from "@/lib/ugc-factory-v2";

export const runtime = "nodejs";

function fileFor(url: string) {
  const rel = url.replace(/^\/api\/media\//, "");
  return path.join(dataRoot(), "media", rel);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const productionId = url.searchParams.get("production") || "";
  const slide = url.searchParams.get("slide");
  const { production, carousel } = readCarousel(productionId);
  if (!carousel || carousel.slides.length !== 5) {
    return NextResponse.json({ error: "Generate the five slides before exporting." }, { status: 400 });
  }
  const db = readFactoryV2();
  const sku = db.skus.find((row) => row.id === production.skuId);
  const catalog = readSharedCatalog();
  const catalogSku = catalog.skus.find((row) => row.legacyProductId === sku?.catalogProductId || row.id === sku?.catalogProductId);
  const copy = catalogSku ? affiliateForSku({ skuId: catalogSku.id, market: production.market, listings: catalog.listings, destinations: catalog.destinations, preferences: catalog.preferences || [] }) : { action: "add-listing" as const };
  const affiliateUrl = copy.action === "copy" ? copy.url : null;
  const media = new Map((catalog.media || []).filter((row) => row.skuId === catalogSku?.id).map((row) => [row.id, row.url]));
  const rendered = await exportCarouselFiles({
    productionId,
    revision: production.revision,
    doc: carousel,
    mediaPath: (id) => fileFor(media.get(id) || ""),
    manifest: {
      productionId,
      revision: production.revision,
      skuId: catalogSku?.id || production.skuId,
      market: production.market,
      locale: production.locale,
      fixture: carousel.fixture,
      modelId: carousel.modelId,
      slides: carousel.slides.map((row, index) => ({ order: index + 1, id: row.id, role: row.role, mediaId: row.mediaId, layout: row.layout })),
      affiliateUrl,
    },
  });
  if (slide) {
    const index = Number(slide);
    const file = rendered.pngs[index - 1];
    if (!file) return NextResponse.json({ error: "That slide is not in this carousel." }, { status: 404 });
    return new NextResponse(fs.readFileSync(file), { headers: { "Content-Type": "image/png", "Content-Disposition": `attachment; filename="slide-0${index}.png"` } });
  }
  return new NextResponse(fs.readFileSync(rendered.zipPath), { headers: { "Content-Type": "application/zip", "Content-Disposition": "attachment; filename=\"carousel.zip\"" } });
}
