import { cn } from "@/lib/cn";

/** Tight crop of the uploaded wordmark so it fills the header. Same pixels, not a redraw. */
export function BrandLogo({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/aios-creator-lockup.png"
      alt="AIOS Creator"
      className={cn("h-14 w-auto object-contain", className)}
    />
  );
}
