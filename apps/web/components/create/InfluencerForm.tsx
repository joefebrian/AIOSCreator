"use client";

import type { ReactNode } from "react";
import {
  BREAST_BANDS,
  BREAST_CUPS,
  breastMeasures,
  BUILDS,
  compileInfluencerPrompt,
  COUNTRIES,
  CUP_DELTA_IN,
  DAILY_ROUTINES,
  DEFAULT_INFLUENCER,
  EYE_HEX,
  EYES,
  formatBreast,
  HAIR_COLORS,
  HAIR_HEX,
  HAIR_STYLES,
  lifeStage,
  MAKEUP_PRESETS,
  parseBreast,
  randomInfluencer,
  stageRange,
  WARDROBE_PRESETS,
  type InfluencerSpec,
} from "@/lib/influencer";
import { cn } from "@/lib/cn";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-[12px] text-[#6B7280]">
      <span className="flex items-baseline justify-between gap-2">
        <span>{label}</span>
        {hint ? <span className="text-[10px] font-normal text-[#9CA3AF]">{hint}</span> : null}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-[#E6E8EE] bg-white px-3 py-2 text-sm text-[#0B0F2B] outline-none";

function VisualPick({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="sm:col-span-2">
      <p className="text-[12px] text-[#6B7280]">{label}</p>
      <div className="mt-1 flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function PickCard({
  selected,
  onClick,
  caption,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  caption: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "flex min-w-[4.6rem] shrink-0 flex-col items-center gap-1 rounded-xl border px-2 py-2 text-[10px] font-semibold leading-tight",
        selected
          ? "border-[#652DFF] bg-[#652DFF]/8 text-[#0B0F2B] ring-2 ring-[#652DFF]/25"
          : "border-[#E6E8EE] bg-white text-[#4B5563]",
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center">{children}</span>
      <span className="max-w-[4.4rem] text-center">{caption}</span>
    </button>
  );
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-1 text-[11px] font-semibold",
        selected ? "bg-[#652DFF] text-white" : "border border-[#E6E8EE] bg-white text-[#0B0F2B]",
      )}
    >
      {children}
    </button>
  );
}

const BUILD_SHAPE: Record<string, { sh: number; waist: number; hip: number }> = {
  Petite: { sh: 5.4, waist: 3.2, hip: 5.8 },
  Slim: { sh: 6.2, waist: 3.6, hip: 6.4 },
  Athletic: { sh: 11.4, waist: 5, hip: 7 },
  Average: { sh: 8.2, waist: 6.8, hip: 8.6 },
  Curvy: { sh: 7.6, waist: 4.6, hip: 12.4 },
};

function BuildThumb({ build, gender }: { build: string; gender: "woman" | "man" }) {
  const base = BUILD_SHAPE[build] ?? BUILD_SHAPE.Average!;
  const sh = gender === "man" ? base.sh + 1.4 : base.sh;
  const waist = gender === "man" ? base.waist + 1.2 : base.waist;
  const hip = gender === "man" ? Math.max(base.hip - 1.4, waist + 0.6) : base.hip;
  const cx = 20;
  return (
    <svg viewBox="0 0 40 72" className="h-12 w-8" aria-hidden>
      <circle cx={cx} cy="9" r="6" fill="#e8c4a8" />
      <path
        d={`M ${cx} 15
           L ${cx + sh} 22
           L ${cx + waist} 40
           L ${cx + hip} 50
           L ${cx + hip * 0.72} 70
           L ${cx - hip * 0.72} 70
           L ${cx - hip} 50
           L ${cx - waist} 40
           L ${cx - sh} 22 Z`}
        fill="#0B0F2B"
      />
    </svg>
  );
}

function EyeThumb({ color }: { color: string }) {
  const hex = EYE_HEX[color] ?? "#6b3a1f";
  return (
    <svg viewBox="0 0 40 24" className="h-7 w-11" aria-hidden>
      <ellipse cx="20" cy="12" rx="18" ry="10" fill="#f7efe6" stroke="#d7c7b6" />
      <circle cx="20" cy="12" r="7.2" fill={hex} />
      <circle cx="20" cy="12" r="3.1" fill="#111" />
      <circle cx="17.4" cy="9.8" r="1.6" fill="#fff" />
    </svg>
  );
}

function HairStyleThumb({
  style,
  color,
  eyes,
}: {
  style: string;
  color: string;
  eyes?: string;
}) {
  const fill = HAIR_HEX[color] ?? "#141414";
  const iris = EYE_HEX[eyes ?? ""] ?? "#2a150c";
  return (
    <svg viewBox="0 0 48 56" className="h-12 w-11" aria-hidden>
      {style === "Long loose" ? (
        <path d="M10 20 C8 34 9 50 11 56 H18 C17 40 18 30 22 26 L24 18 L26 26 C30 30 31 40 30 56 H37 C39 50 40 34 38 20 C34 8 14 8 10 20Z" fill={fill} />
      ) : null}
      {style === "High ponytail" ? (
        <>
          <path d="M14 20 C13 28 14 34 16 36 C20 22 28 22 32 36 C34 34 35 28 34 20 C31 10 17 10 14 20Z" fill={fill} />
          <path d="M28 12 C36 6 42 8 44 16 C40 14 34 16 30 20Z" fill={fill} />
        </>
      ) : null}
      {style === "Center part waves" ? (
        <path d="M11 22 C9 30 12 40 10 50 H17 C18 38 16 30 22 26 L24 18 L26 26 C32 30 30 38 31 50 H38 C36 40 39 30 37 22 C33 9 15 9 11 22Z" fill={fill} />
      ) : null}
      {style === "Bob" ? (
        <path d="M13 18 C12 28 13 38 16 42 H32 C35 38 36 28 35 18 C31 8 17 8 13 18Z" fill={fill} />
      ) : null}
      {style === "Bangs" ? (
        <path d="M13 20 C12 30 13 38 16 40 H32 C35 38 36 30 35 20 C32 9 16 9 13 20Z" fill={fill} />
      ) : null}
      {style === "Bun" ? (
        <>
          <circle cx="24" cy="10" r="6.2" fill={fill} />
          <path d="M14 22 C13 30 15 36 18 38 H30 C33 36 35 30 34 22 C31 14 17 14 14 22Z" fill={fill} />
        </>
      ) : null}
      {style === "Short" ? (
        <path d="M15 20 C14 26 15 30 18 32 H30 C33 30 34 26 33 20 C30 12 18 12 15 20Z" fill={fill} />
      ) : null}
      {style === "Pigtails" ? (
        <>
          <path d="M14 20 C13 28 16 34 20 34 H28 C32 34 35 28 34 20 C31 10 17 10 14 20Z" fill={fill} />
          <ellipse cx="11" cy="28" rx="4" ry="7" fill={fill} />
          <ellipse cx="37" cy="28" rx="4" ry="7" fill={fill} />
        </>
      ) : null}
      {style === "Braids" ? (
        <path d="M13 20 C12 32 14 44 16 54 H20 C19 40 22 28 24 24 L24 18 L24 24 C26 28 29 40 28 54 H32 C34 44 36 32 35 20 C31 9 17 9 13 20Z" fill={fill} />
      ) : null}
      {style === "Wolf cut" ? (
        <path d="M10 22 C8 32 12 42 11 50 H18 C19 36 16 28 22 24 L24 16 L26 24 C32 28 29 36 30 50 H37 C36 42 40 32 38 22 C34 8 14 8 10 22Z" fill={fill} />
      ) : null}
      <ellipse cx="24" cy="32" rx="10" ry="12" fill="#e8c4a8" />
      {style === "Bangs" ? (
        <path d="M15 24 C18 20 30 20 33 24 C28 22 20 22 15 24Z" fill={fill} />
      ) : null}
      {style === "Center part waves" || style === "Long loose" ? (
        <path d="M24 18 V24" stroke={fill} strokeWidth="1.2" />
      ) : null}
      <ellipse cx="20.2" cy="32" rx="1.7" ry="1.3" fill={iris} />
      <ellipse cx="27.8" cy="32" rx="1.7" ry="1.3" fill={iris} />
    </svg>
  );
}

function HairColorThumb({ color }: { color: string }) {
  const fill = HAIR_HEX[color] ?? "#141414";
  return (
    <svg viewBox="0 0 40 40" className="h-10 w-10" aria-hidden>
      <circle cx="20" cy="20" r="16" fill={fill} />
      <path d="M12 14 C16 10 24 10 28 14 C24 12 16 12 12 14Z" fill="#fff" opacity="0.18" />
    </svg>
  );
}

function BreastThumb({ size }: { size: string }) {
  const { band, cup } = parseBreast(size);
  const r = 4.2 + (CUP_DELTA_IN[cup] ?? 2) * 1.15;
  const gap = 1.2 + Number(band) * 0.08;
  const cx = 24;
  const cy = 22;
  return (
    <svg viewBox="0 0 48 40" className="h-10 w-12" aria-hidden>
      <ellipse cx={cx} cy="8" rx="5" ry="5.4" fill="#e8c4a8" />
      <path d={`M ${cx - 11} 14 Q ${cx} 18 ${cx + 11} 14 L ${cx + 13} 38 H ${cx - 13} Z`} fill="#0B0F2B" />
      <circle cx={cx - gap - r * 0.15} cy={cy} r={r} fill="#e8c4a8" />
      <circle cx={cx + gap + r * 0.15} cy={cy} r={r} fill="#e8c4a8" />
    </svg>
  );
}

export function InfluencerForm({
  spec,
  onChange,
  busy,
  onGenerate,
  onReset,
}: {
  spec: InfluencerSpec;
  onChange: (next: InfluencerSpec) => void;
  busy?: boolean;
  onGenerate: () => void;
  onReset: () => void;
}) {
  function set<K extends keyof InfluencerSpec>(key: K, value: InfluencerSpec[K]) {
    onChange({ ...spec, [key]: value });
  }

  const bust = breastMeasures(spec.breast);
  const woman = spec.gender === "woman";
  const stage = lifeStage(spec.age);
  const minor = stage !== "adult";
  const range = stageRange(stage);
  const builds = minor ? (["Slim", "Athletic", "Average"] as const) : BUILDS;

  function setStage(next: "kid" | "teen" | "adult") {
    const r = stageRange(next);
    const age = Math.min(r.age[1], Math.max(r.age[0], spec.age));
    const heightCm = Math.min(r.height[1], Math.max(r.height[0], spec.heightCm));
    const weightKg = Math.min(r.weight[1], Math.max(r.weight[0], spec.weightKg));
    onChange({
      ...spec,
      age: next === "kid" ? 8 : next === "teen" ? 15 : Math.max(age, 18),
      heightCm: next === "kid" ? 128 : heightCm,
      weightKg: next === "kid" ? 27 : weightKg,
      makeup: next === "adult" ? spec.makeup : "no makeup, bare skin",
      wardrobe:
        next === "adult"
          ? spec.wardrobe
          : next === "teen"
            ? "hoodie and jeans"
            : "graphic tee and sneakers",
    });
  }

  return (
    <div className="rounded-2xl border border-[#E6E8EE] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-[#652DFF]">AI INFLUENCER GENERATOR</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => onChange(randomInfluencer(spec))}
          className="rounded-md border border-[#E6E8EE] px-2 py-1 text-[11px] font-semibold disabled:opacity-50"
        >
          Random
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {([
          { id: "kid" as const, label: "Kid · 5–12" },
          { id: "teen" as const, label: "Teen · 13–17" },
          { id: "adult" as const, label: "Adult · 18+" },
        ]).map((s) => (
          <Chip key={s.id} selected={stage === s.id} onClick={() => setStage(s.id)}>
            {s.label}
          </Chip>
        ))}
      </div>
      {minor ? (
        <p className="mt-2 text-[11px] leading-snug text-[#6B7280]">
          SFW only. Fully clothed, age-appropriate. Adult 18+ looks are hidden in the workspace.
        </p>
      ) : null}

      <div className="mt-3 flex items-center gap-3">
        <div className="flex h-[4.5rem] w-14 shrink-0 items-center justify-center rounded-xl border border-[#E6E8EE] bg-[#F3F4F8]">
          <HairStyleThumb style={spec.hairStyle} color={spec.hairColor} eyes={spec.eyes} />
        </div>
        <div className="min-w-0">
          <div className="flex gap-2">
            {(["woman", "man"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => set("gender", g)}
                className={cn(
                  "rounded-full px-3 py-1 text-[12px] font-semibold capitalize",
                  spec.gender === g ? "bg-[#652DFF] text-white" : "border border-[#E6E8EE] bg-white",
                )}
              >
                {stage === "kid" ? (g === "woman" ? "Girl" : "Boy") : stage === "teen" ? (g === "woman" ? "Girl" : "Boy") : g}
              </button>
            ))}
          </div>
          <p className="mt-1 truncate text-[11px] text-[#6B7280]">
            {spec.hairColor} · {spec.hairStyle} · {spec.eyes} eyes · {spec.build}
            {woman ? ` · ${spec.breast}` : ""}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label={`Age · ${spec.age}`}>
          <input
            type="range"
            min={range.age[0]}
            max={range.age[1]}
            value={spec.age}
            onChange={(e) => set("age", Number(e.target.value))}
            className="w-full accent-[#652DFF]"
          />
        </Field>
        <Field label={`Height · ${spec.heightCm} cm`}>
          <input
            type="range"
            min={range.height[0]}
            max={range.height[1]}
            value={spec.heightCm}
            onChange={(e) => set("heightCm", Number(e.target.value))}
            className="w-full accent-[#652DFF]"
          />
        </Field>
        <Field label={`Weight · ${spec.weightKg} kg`}>
          <input
            type="range"
            min={range.weight[0]}
            max={range.weight[1]}
            value={spec.weightKg}
            onChange={(e) => set("weightKg", Number(e.target.value))}
            className="w-full accent-[#652DFF]"
          />
        </Field>
        <Field label="Look / country">
          <select className={inputCls} value={spec.country} onChange={(e) => set("country", e.target.value)}>
            {COUNTRIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>

        <VisualPick label="Build">
          {builds.map((c) => (
            <PickCard key={c} selected={spec.build === c} onClick={() => set("build", c)} caption={c}>
              <BuildThumb build={c} gender={spec.gender} />
            </PickCard>
          ))}
        </VisualPick>

        <VisualPick label="Eyes">
          {EYES.map((c) => (
            <PickCard key={c} selected={spec.eyes === c} onClick={() => set("eyes", c)} caption={c}>
              <EyeThumb color={c} />
            </PickCard>
          ))}
        </VisualPick>

        <VisualPick label="Hair style">
          {HAIR_STYLES.map((c) => (
            <PickCard key={c} selected={spec.hairStyle === c} onClick={() => set("hairStyle", c)} caption={c}>
              <HairStyleThumb style={c} color={spec.hairColor} eyes={spec.eyes} />
            </PickCard>
          ))}
        </VisualPick>

        <VisualPick label="Hair color">
          {HAIR_COLORS.map((c) => (
            <PickCard key={c} selected={spec.hairColor === c} onClick={() => set("hairColor", c)} caption={c}>
              <HairColorThumb color={c} />
            </PickCard>
          ))}
        </VisualPick>
      </div>

      {woman && !minor ? (
        <div className="mt-4 rounded-xl border border-[#E6E8EE] bg-[#F3F4F8] p-3">
          <div className="flex items-center gap-3">
            <BreastThumb size={spec.breast} />
            <div>
              <p className="text-[12px] font-semibold text-[#0B0F2B]">Breast · {spec.breast}</p>
              <p className="text-[10px] leading-snug text-[#6B7280]">
                US band/cup. Underbust ~{bust.underCm} cm · full bust ~{bust.fullCm} cm. Default 36B.
              </p>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-[#6B7280]">Band (underbust, inches)</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {BREAST_BANDS.map((b) => (
              <Chip key={b} selected={bust.band === b} onClick={() => set("breast", formatBreast(b, bust.cup))}>
                {b}
              </Chip>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-[#6B7280]">Cup</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {BREAST_CUPS.map((c) => (
              <Chip key={c} selected={bust.cup === c} onClick={() => set("breast", formatBreast(bust.band, c))}>
                {c}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-4 text-[12px] text-[#0B0F2B]">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={spec.dimple} onChange={(e) => set("dimple", e.target.checked)} />
          Dimple
        </label>
        {spec.gender === "man" ? (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={spec.beard} onChange={(e) => set("beard", e.target.checked)} />
            Beard
          </label>
        ) : null}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={spec.suntan} onChange={(e) => set("suntan", e.target.checked)} />
          Suntan
        </label>
      </div>

      <div className="mt-4 border-t border-[#E6E8EE] pt-3">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-[#652DFF]">DAILY ROUTINE</p>
        <p className="mt-1 text-[11px] text-[#6B7280]">Ten looks. Sets wardrobe + scene in one tap.</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {DAILY_ROUTINES.map((r) => {
            const pack = minor ? r.kid : r.adult;
            const on = spec.wardrobe === pack.wardrobe && spec.other === pack.other;
            return (
              <Chip
                key={r.id}
                selected={on}
                onClick={() => onChange({ ...spec, wardrobe: pack.wardrobe, other: pack.other })}
              >
                {r.label}
              </Chip>
            );
          })}
        </div>
      </div>

      <div className="mt-4 border-t border-[#E6E8EE] pt-3">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-[#652DFF]">BESPOKE</p>
        <p className="mt-1 text-[11px] text-[#6B7280]">
          Framework, not a blank box. Each line locks on the identity prompt.
        </p>
        <div className="mt-3 grid gap-3">
          <Field label="Wardrobe" hint="ID portrait outfit">
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              {WARDROBE_PRESETS.map((w) => (
                <Chip key={w} selected={spec.wardrobe === w} onClick={() => set("wardrobe", w)}>
                  {w.replace("plain ", "").replace("simple ", "")}
                </Chip>
              ))}
            </div>
            <input
              className={inputCls}
              value={spec.wardrobe}
              onChange={(e) => set("wardrobe", e.target.value)}
              placeholder="plain white crew-neck t-shirt"
            />
          </Field>
          <Field label="Marks" hint="mole, scar, tattoo — or leave empty">
            <input
              className={inputCls}
              value={spec.marks}
              onChange={(e) => set("marks", e.target.value)}
              placeholder="none"
            />
          </Field>
          {minor ? null : (
          <Field label="Makeup">
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              {MAKEUP_PRESETS.map((w) => (
                <Chip key={w} selected={spec.makeup === w} onClick={() => set("makeup", w)}>
                  {w.split(",")[0]}
                </Chip>
              ))}
            </div>
            <input
              className={inputCls}
              value={spec.makeup}
              onChange={(e) => set("makeup", e.target.value)}
              placeholder="natural, sheer skin"
            />
          </Field>
          )}
          <Field label="Other" hint="optional extra">
            <textarea
              value={spec.other}
              onChange={(e) => set("other", e.target.value)}
              rows={2}
              placeholder="vibe, jewelry, anything else — passed as written"
              className={cn(inputCls, "resize-none")}
            />
          </Field>
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-snug text-[#9CA3AF]">{compileInfluencerPrompt(spec)}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onGenerate}
          className="rounded-lg bg-[#652DFF] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Generating…" : "Generate portrait"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onReset}
          className="rounded-lg border border-[#E6E8EE] bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

export { DEFAULT_INFLUENCER };
