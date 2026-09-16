import { cn } from "@/lib/cn";

/** Exact file the operator uploaded. No AI redraw, no CSS zoom-crop. */
export function BrandLogo({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/aios-creator.png"
      alt="AIOS Creator"
      className={cn("h-12 w-auto object-contain", className)}
    />
  );
}
