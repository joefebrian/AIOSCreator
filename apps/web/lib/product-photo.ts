import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { comfyCutout, comfyTxt2Img } from "./comfy";
import { jevPhotoTextGate } from "./jev";
import { addProductAsset } from "./product-assets";
import { mediaUrlToPath, productFile, productMediaUrl } from "./paths";
import { getProduct, setProductDefaultImage, setProductImages, type Product } from "./products";

const TEXT_JOB = /\b(te(?:xt|ks)|tulisan|watermark|banner|overlay|caption|subtitle|harga|price tag|star ratings?|hapus tulisan|hilangkan tulisan|clean(?:\s*up)? text|cleanup text)\b/i;
const MATTE_JOB = /\b(backgrounds?|backgrouds?|latar|transparan|transparant|transparent|cut ?outs?|no bg)\b/i;

/** Text cleanup redraws with local Qwen. A transparent background is a BiRefNet cutout and does not redraw the product. */
export function productPhotoPlan(instruction: string) {
  const text = TEXT_JOB.test(instruction);
  const matte = MATTE_JOB.test(instruction);
  if (!text && !matte) return { edit: true, matte: false };
  return { edit: text, matte };
}

export function productEditPrompt(instruction: string) {
  return [
    "Edit the product photo in <image1>.",
    "Keep the same product: same color, shape, logo, material, and proportions.",
    "Do not add a person, hands, a room, or a different product.",
    `Only change this: ${instruction}`,
    "Keep a brand name only when it is already printed on the product in the source photo.",
    "Do not add a logo, wordmark, icon, lettering, watermark, or pattern that is not already in the source photo.",
    "A plain garment stays plain. Never invent a brand name or a chest print.",
    "Extra text means only shop overlay that is not part of the product: prices, discount banners, star ratings, marketplace watermarks, and captions beside the product.",
  ].join(" ");
}

function writePng(product: Product, buffer: Buffer) {
  const fileId = `${product.id.slice(0, 8)}-${randomUUID().slice(0, 6)}`;
  const dest = productFile(fileId, "png");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buffer);
  return productMediaUrl(fileId, "png");
}

/** Add a cleaned PNG and pin it as the SKU default. The source slide stays on the card. */
export async function regenProductPhoto(id: string, mediaUrl: string, instruction: string) {
  const note = instruction.trim().replace(/\s+/g, " ").slice(0, 240);
  if (!note) throw new Error("Type what to change on the photo.");
  const product = getProduct(id);
  if (!product) throw new Error("product not found");
  if (!product.images.includes(mediaUrl)) throw new Error("That photo is not on this SKU.");
  if (/^https?:\/\//i.test(mediaUrl)) throw new Error("Save the photo local first.");
  const src = mediaUrlToPath(mediaUrl);
  if (!fs.existsSync(src)) throw new Error("product photo missing");
  const plan = productPhotoPlan(note);
  let edit = plan.edit;
  let warning = "";
  if (edit) {
    try {
      const gate = await jevPhotoTextGate({ title: product.title, brand: product.brand, instruction: note });
      if (gate.stripsBrand) {
        edit = false;
        if (!plan.matte) throw new Error("Extra text cleanup does not remove a brand name printed on the product.");
        warning = "Brand name on the product stays. Only the background was removed.";
      }
    } catch (err) {
      if (err instanceof Error && /brand name printed/.test(err.message)) throw err;
    }
  }
  let current = src;
  let temp: string | null = null;
  try {
    if (edit) {
      const edited = await comfyTxt2Img(productEditPrompt(note), src, "qwen-image-2.1");
      temp = path.join(os.tmpdir(), `creatoros-photo-${randomUUID().slice(0, 8)}.png`);
      fs.writeFileSync(temp, edited.buffer);
      current = temp;
    }
    const buffer = plan.matte ? (await comfyCutout(current)).buffer : fs.readFileSync(current);
    const url = writePng(product, buffer);
    const images = [url, ...product.images.filter((image) => image !== url)].slice(0, 8);
    const prevRoles = product.imageRoles || [];
    const roleByUrl = new Map(product.images.map((image, i) => [image, prevRoles[i] || "other"]));
    const imageRoles = images.map((image, i) => {
      if (i === 0) return "identity" as const;
      const prev = roleByUrl.get(image);
      return prev === "identity" ? "other" as const : prev || "other";
    });
    setProductImages(id, images, imageRoles);
    const pinned = setProductDefaultImage(id, url);
    if (!pinned) throw new Error("cleaned photo was not saved");
    addProductAsset({ url, title: product.title, productId: product.id, source: "catalog" });
    return { url, plan: { edit, matte: plan.matte }, warning };
  } finally {
    if (temp) fs.rmSync(temp, { force: true });
  }
}
