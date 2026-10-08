"use client";

import { MARKETS } from "@/lib/markets";
import { cn } from "@/lib/cn";

export function CountryChips({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Country">
      {MARKETS.map((row) => {
        const on = value.includes(row.id);
        return (
          <button
            key={row.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((id) => id !== row.id) : [...value, row.id])}
            className={cn(
              "rounded-full border px-2 py-1! text-[11px]! leading-none! font-medium!",
              on ? "border-[#111827] bg-[#111827] text-white" : "border-[#E6E8EE] bg-white text-[#6B7280]",
            )}
          >
            {row.label}
          </button>
        );
      })}
    </div>
  );
}
