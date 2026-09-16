export const IMAGE_ASPECTS = ["9:16", "3:4", "1:1", "16:9", "4:5"] as const;
export type ImageAspect = (typeof IMAGE_ASPECTS)[number];

export function parseImageAspect(raw?: string | null): ImageAspect {
  return IMAGE_ASPECTS.includes(raw as ImageAspect) ? (raw as ImageAspect) : "9:16";
}

/** Local Comfy canvas. Long edge 1280, 8-aligned. */
export function sizeForAspect(aspect?: string | null): { width: number; height: number } {
  switch (parseImageAspect(aspect)) {
    case "3:4":
      return { width: 768, height: 1024 };
    case "1:1":
      return { width: 768, height: 768 };
    case "16:9":
      return { width: 1280, height: 768 };
    case "4:5":
      return { width: 768, height: 960 };
    default:
      return { width: 768, height: 1280 };
  }
}

/** GPT Image 2 / 2.5 only accepts these three. */
export function gptImageSize(aspect?: string | null): "1024x1024" | "1024x1536" | "1536x1024" {
  const a = parseImageAspect(aspect);
  if (a === "1:1") return "1024x1024";
  if (a === "16:9") return "1536x1024";
  return "1024x1536";
}

/** Seedream pixel size. Comet/Hensun stay on the 2K token. */
export function seedreamSize(aspect?: string | null): string {
  switch (parseImageAspect(aspect)) {
    case "3:4":
      return "1728x2304";
    case "1:1":
      return "2048x2048";
    case "16:9":
      return "2560x1440";
    case "4:5":
      return "1728x2160";
    default:
      return "1440x2560";
  }
}
