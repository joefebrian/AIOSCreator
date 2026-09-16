"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ScriptForm() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/jobs/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.status || "script job failed");
      }
      setInput("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-[#E6E8EE] bg-white p-5 shadow-[0_1px_0_rgba(15,23,42,0.03)]"
    >
      <label className="text-[11px] font-semibold tracking-[0.16em] text-[#6B7280]">
        TOPIC OR PRODUCT URL
      </label>
      <textarea
        required
        rows={4}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Paste an Amazon product URL (or a topic if you don’t have one yet)…"
        className="mt-2 w-full resize-y rounded-xl border border-[#E6E8EE] bg-[#F3F4F8] px-3 py-2 text-sm outline-none transition focus:border-[#652DFF] focus:ring-2 focus:ring-[#652DFF]/15"
      />
      <div className="mt-3 flex items-center justify-between">
        <p className="text-[11px] text-[#9CA3AF]">Any OpenAI-compatible LLM · server-side · swap in .env.local</p>
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-[#652DFF] px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Writing…" : "Write script"}
        </button>
      </div>
      {error ? <p className="mt-3 text-[12px] text-red-600">{error}</p> : null}
    </form>
  );
}
