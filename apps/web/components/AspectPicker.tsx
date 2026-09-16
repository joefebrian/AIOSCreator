"use client";

import { IMAGE_ASPECTS } from "@/lib/image-aspect";
import { cn } from "@/lib/cn";

const FRAME: Record<string, string> = {
  "9:16": "h-8 w-[18px]",
  "3:4": "h-7 w-5",
  "1:1": "h-6 w-6",
  "16:9": "h-[18px] w-8",
  "4:5": "h-7 w-[22px]",
};

export function AspectPicker({
  value,
  onChange,
  dim = false,
}: {
  value: string;
  onChange: (v: string) => void;
  dim?: boolean;
}) {
  return (
    <div>
      <p className={cn("text-[10px] font-semibold tracking-[0.16em]", dim ? "text-white/45" : "text-[#9CA3AF]")}>ASPECT</p>
      <div className="mt-2 grid grid-cols-5 gap-1">
        {IMAGE_ASPECTS.map((ratio) => {
          const on = value === ratio;
          return (
            <button
              key={ratio}
              type="button"
              title={ratio}
              onClick={() => onChange(ratio)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 transition",
                on
                  ? dim
                    ? "border-[#C084FC] bg-white/10"
                    : "border-[#7C6CFF] bg-[#7C6CFF]/10"
                  : dim
                    ? "border-white/10 hover:border-white/25"
                    : "border-[#E6E8EE] hover:border-[#7C6CFF]/40",
              )}
            >
              <span
                className={cn(
                  "rounded-[3px] border-2",
                  FRAME[ratio],
                  on ? (dim ? "border-[#C084FC]" : "border-[#7C6CFF]") : dim ? "border-white/30" : "border-[#D1D5DB]",
                )}
              />
              <span className={cn("text-[9px] font-semibold", dim ? "text-white/70" : "text-[#6B7280]")}>{ratio}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
