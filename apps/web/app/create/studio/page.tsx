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
    <div className="relative h-full min-h-0">
      <p className="pointer-events-none absolute bottom-2 right-4 z-10 text-[10px] tracking-wide text-white/30">{comfy}</p>
      <StudioCanvas />
    </div>
  );
}
