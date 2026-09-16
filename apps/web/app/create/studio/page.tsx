"use client";

import { StudioCanvas } from "@/components/studio/StudioCanvas";
import { useEffect, useState } from "react";

export default function StudioPage() {
  const [comfy, setComfy] = useState<string>("checking ComfyUI…");
  useEffect(() => {
    fetch("/api/comfy/status")
      .then((r) => r.json())
      .then((j) => setComfy(j.ok ? `ComfyUI · ${j.device || "online"}` : `ComfyUI offline · ${j.error || j.url}`))
      .catch(() => setComfy("ComfyUI offline"));
  }, []);
  return (
    <div className="relative">
      <p className="pointer-events-none absolute right-4 top-3 z-10 text-[10px] tracking-wide text-white/40">
        {comfy} · Product hub: on-model (character keroyok SKU) or faceless pack/hands. Prompt on the card; empty = auto.
      </p>
      <StudioCanvas />
    </div>
  );
}
