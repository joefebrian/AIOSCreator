/** Slide geometry for the carousel editor. No disk or Node imports. */

export const SLIDE_W = 1080;
export const SLIDE_H = 1350;

export type SlideRole = "hook" | "situation" | "detail" | "value" | "cta";
export type SlideLayout = "split-left" | "split-right" | "top-copy" | "detail" | "cta";

export type CarouselSlide = {
  id: string;
  role: SlideRole;
  headline: string;
  body: string;
  mediaId: string;
  layout: SlideLayout;
  scale: number;
  offsetX: number;
  offsetY: number;
  factIds: string[];
  warnings: string[];
  previous?: { headline: string; body: string } | null;
};

export type CarouselDoc = {
  angle: string;
  caption: string;
  cta: string;
  slides: CarouselSlide[];
  modelId: string | null;
  fixture: boolean;
  affiliateUrl: string | null;
  direction: string;
  previous: CarouselDoc | null;
};

export type SlideBox = { x: number; y: number; w: number; h: number };

export const SLIDE_LAYOUTS: Record<SlideLayout, { text: SlideBox; product: SlideBox; label: string }> = {
  "split-left": { label: "Copy left", text: { x: 72, y: 120, w: 460, h: 980 }, product: { x: 500, y: 220, w: 500, h: 900 } },
  "split-right": { label: "Copy right", text: { x: 560, y: 140, w: 440, h: 900 }, product: { x: 72, y: 260, w: 460, h: 860 } },
  "top-copy": { label: "Copy on top", text: { x: 80, y: 90, w: 920, h: 420 }, product: { x: 220, y: 540, w: 640, h: 720 } },
  detail: { label: "Product forward", text: { x: 72, y: 80, w: 420, h: 1100 }, product: { x: 420, y: 160, w: 600, h: 1040 } },
  cta: { label: "Close", text: { x: 80, y: 860, w: 920, h: 400 }, product: { x: 250, y: 80, w: 580, h: 740 } },
};
