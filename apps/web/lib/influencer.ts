export type InfluencerSpec = {
  gender: "woman" | "man";
  age: number;
  heightCm: number;
  weightKg: number;
  country: string;
  build: string;
  eyes: string;
  hairStyle: string;
  hairColor: string;
  breast: string;
  dimple: boolean;
  beard: boolean;
  suntan: boolean;
  wardrobe: string;
  marks: string;
  makeup: string;
  other: string;
};

export const COUNTRIES = [
  "Indonesian",
  "Chinese",
  "Korean",
  "Japanese",
  "Thai",
  "Vietnamese",
  "Filipino",
  "Malay",
  "Indian",
  "Mixed East / Southeast Asian",
  "Western European",
  "Eastern European",
  "Middle Eastern",
  "African",
  "Latin American",
  "Mixed",
];

export const BUILDS = ["Petite", "Slim", "Athletic", "Average", "Curvy"] as const;
export const EYES = ["Brown", "Dark brown", "Hazel", "Black", "Gray", "Green", "Amber"] as const;
export const HAIR_STYLES = [
  "Long loose",
  "High ponytail",
  "Center part waves",
  "Bob",
  "Bangs",
  "Bun",
  "Short",
  "Pigtails",
  "Braids",
  "Wolf cut",
] as const;
export const HAIR_COLORS = ["Black", "Dark brown", "Brown", "Auburn", "Blonde", "Red", "Highlight"] as const;

/** Common band/cup library. Default 36B. */
export const BREAST_BANDS = ["32", "34", "36", "38"] as const;
export const BREAST_CUPS = ["A", "B", "C", "D", "DD"] as const;
export const BREAST_SIZES = BREAST_BANDS.flatMap((b) => BREAST_CUPS.map((c) => `${b}${c}`));

/** Cup = full bust minus underbust, inches (US). DD treated as +5. */
export const CUP_DELTA_IN: Record<string, number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  DD: 5,
};

export function parseBreast(size: string): { band: string; cup: string } {
  const m = /^(\d{2})(A|B|C|D|DD)$/i.exec(size.trim());
  if (!m) return { band: "36", cup: "B" };
  return { band: m[1]!, cup: m[2]!.toUpperCase() };
}

export function formatBreast(band: string, cup: string) {
  return `${band}${cup.toUpperCase()}`;
}

export function breastMeasures(size: string) {
  const { band, cup } = parseBreast(size);
  const bandIn = Number(band);
  const delta = CUP_DELTA_IN[cup] ?? 2;
  const fullIn = bandIn + delta;
  return {
    band,
    cup,
    bandIn,
    fullIn,
    underCm: Math.round(bandIn * 2.54),
    fullCm: Math.round(fullIn * 2.54),
  };
}

export function breastPrompt(size: string) {
  const m = breastMeasures(size);
  const shape =
    m.cup === "A" || m.cup === "B" ? "modest natural chest" : m.cup === "C" ? "average natural chest" : "fuller natural chest";
  return `${shape}, proportional to her frame, not exaggerated.`;
}

export const WARDROBE_PRESETS = [
  "plain white crew-neck t-shirt",
  "off-shoulder white top",
  "black tank top",
  "fitted black turtleneck",
  "simple white blouse",
  "striped cotton tee",
  "linen shirt",
  "hoodie and jeans",
  "school polo and shorts",
  "graphic tee and sneakers",
];

export const MAKEUP_PRESETS = [
  "natural, sheer skin, no heavy contour",
  "soft glam, defined lashes",
  "no makeup, bare skin",
  "fresh dewy skin, tinted lip",
  "clean girl, glossy lid",
];

export type DailyRoutine = {
  id: string;
  label: string;
  adult: { wardrobe: string; other: string };
  kid: { wardrobe: string; other: string };
};

/** 10 daily-life looks. Kid strings stay SFW and fully clothed. */
export const DAILY_ROUTINES: DailyRoutine[] = [
  {
    id: "morning",
    label: "Morning",
    adult: { wardrobe: "cotton pajama set", other: "just woke up, bedroom window light, ID portrait still" },
    kid: { wardrobe: "printed pajama set, fully clothed", other: "bedroom morning, SFW, ID portrait" },
  },
  {
    id: "commute",
    label: "Commute",
    adult: { wardrobe: "light jacket over a tee, tote bag strap", other: "on the way out, natural outdoor light" },
    kid: { wardrobe: "backpack, polo shirt, shorts", other: "school run, daylight, SFW" },
  },
  {
    id: "work-class",
    label: "Work / class",
    adult: { wardrobe: "smart casual blazer and tee", other: "desk or classroom, indoor practicals" },
    kid: { wardrobe: "school uniform polo, neat collar", other: "classroom, SFW, fully clothed" },
  },
  {
    id: "lunch",
    label: "Lunch",
    adult: { wardrobe: "casual blouse", other: "cafe table, warm pendant light" },
    kid: { wardrobe: "cotton tee", other: "cafeteria or home table, SFW" },
  },
  {
    id: "sport",
    label: "Sport",
    adult: { wardrobe: "fitted sportswear", other: "gym or park, healthy, not sexualized" },
    kid: { wardrobe: "team jersey and shorts", other: "after-school sports, SFW" },
  },
  {
    id: "cafe",
    label: "Cafe",
    adult: { wardrobe: "knit cardigan over a tank", other: "window seat, iced drink out of frame" },
    kid: { wardrobe: "hoodie", other: "family cafe, SFW" },
  },
  {
    id: "errands",
    label: "Errands",
    adult: { wardrobe: "denim jacket, plain tee", other: "convenience store or sidewalk, phone-photo casual" },
    kid: { wardrobe: "t-shirt and jeans", other: "weekend errands with family, SFW" },
  },
  {
    id: "evening",
    label: "Evening home",
    adult: { wardrobe: "loungewear set", other: "living room lamp, end of day" },
    kid: { wardrobe: "soft home clothes, fully clothed", other: "living room evening, SFW" },
  },
  {
    id: "dinner",
    label: "Dinner",
    adult: { wardrobe: "simple blouse, small earrings", other: "restaurant or family table, warm light" },
    kid: { wardrobe: "neat shirt", other: "family dinner, SFW" },
  },
  {
    id: "weekend",
    label: "Weekend",
    adult: { wardrobe: "linen shirt, relaxed", other: "day off, park or balcony, easy smile" },
    kid: { wardrobe: "graphic tee and sneakers", other: "park weekend, play clothes, SFW" },
  },
];

export function lifeStage(age: number): "kid" | "teen" | "adult" {
  if (age < 13) return "kid";
  if (age < 18) return "teen";
  return "adult";
}

export function stageRange(stage: "kid" | "teen" | "adult") {
  if (stage === "kid") return { age: [5, 12] as const, height: [105, 155] as const, weight: [18, 48] as const };
  if (stage === "teen") return { age: [13, 17] as const, height: [145, 180] as const, weight: [38, 72] as const };
  return { age: [18, 40] as const, height: [150, 190] as const, weight: [42, 95] as const };
}

export const EYE_HEX: Record<string, string> = {
  Brown: "#6b3a1f",
  "Dark brown": "#2a150c",
  Hazel: "#8b6b2e",
  Black: "#111111",
  Gray: "#6b7280",
  Green: "#3f6b38",
  Amber: "#b45309",
};

export const HAIR_HEX: Record<string, string> = {
  Black: "#141414",
  "Dark brown": "#3a2214",
  Brown: "#6b3e22",
  Auburn: "#8a3a18",
  Blonde: "#d4b57a",
  Red: "#9a3412",
  Highlight: "#4b5563",
};

export const DEFAULT_INFLUENCER: InfluencerSpec = {
  gender: "woman",
  age: 25,
  heightCm: 165,
  weightKg: 55,
  country: "Indonesian",
  build: "Slim",
  eyes: "Hazel",
  hairStyle: "Long loose",
  hairColor: "Black",
  breast: "36B",
  dimple: false,
  beard: false,
  suntan: false,
  wardrobe: "plain white crew-neck t-shirt",
  marks: "",
  makeup: "natural, sheer skin, no heavy contour",
  other: "",
};

function pick<T>(xs: readonly T[]) {
  return xs[Math.floor(Math.random() * xs.length)]!;
}

export function randomInfluencer(prev: InfluencerSpec): InfluencerSpec {
  const stage = lifeStage(prev.age);
  const r = stageRange(stage);
  const age = r.age[0] + Math.floor(Math.random() * (r.age[1] - r.age[0] + 1));
  const kid = stage !== "adult";
  return {
    ...prev,
    age,
    heightCm: r.height[0] + Math.floor(Math.random() * (r.height[1] - r.height[0] + 1)),
    weightKg: r.weight[0] + Math.floor(Math.random() * (r.weight[1] - r.weight[0] + 1)),
    country: pick(COUNTRIES),
    build: kid ? pick(["Slim", "Athletic", "Average"] as const) : pick(BUILDS),
    eyes: pick(EYES),
    hairStyle: pick(HAIR_STYLES),
    hairColor: pick(HAIR_COLORS),
    breast: kid ? prev.breast : pick(BREAST_SIZES),
    makeup: kid ? "no makeup, bare skin" : prev.makeup,
  };
}

/** Clean ID portrait. No phone, no mirror, no collage. */
export function compileInfluencerPrompt(spec: InfluencerSpec) {
  const stage = lifeStage(spec.age);
  const who =
    stage === "kid"
      ? spec.gender === "man"
        ? "boy"
        : "girl"
      : stage === "teen"
        ? spec.gender === "man"
          ? "teenage boy"
          : "teenage girl"
        : spec.gender === "man"
          ? "man"
          : "woman";
  const bust = stage === "adult" && spec.gender === "woman" && spec.breast ? breastPrompt(spec.breast) : "";
  const extras = [
    spec.dimple ? "visible dimples" : "",
    spec.beard && spec.gender === "man" && stage === "adult" ? "natural short beard" : "",
    spec.suntan ? "light natural suntan" : "",
    spec.wardrobe.trim() ? `Wardrobe: ${spec.wardrobe.trim()}` : "",
    stage === "adult" && spec.makeup.trim() ? `Makeup: ${spec.makeup.trim()}` : "",
    spec.marks.trim() ? `Marks: ${spec.marks.trim()}` : "",
    spec.other.trim(),
  ]
    .filter(Boolean)
    .join(". ");
  const sfw =
    stage !== "adult"
      ? "SFW, fully clothed, age-appropriate. Not sexualized, not lingerie, not nude. Natural child/teen portrait."
      : "";
  return [
    `Photoreal identity portrait of one ${spec.country} ${who}, age ${spec.age}, ${spec.heightCm} cm, ${spec.weightKg} kg, ${spec.build.toLowerCase()} build.`,
    bust,
    `${spec.hairColor.toLowerCase()} hair, ${spec.hairStyle.toLowerCase()}. ${spec.eyes.toLowerCase()} eyes.`,
    extras ? extras + "." : "",
    sfw,
    "Shoulders-up, one face, looking at camera, chin level. Real skin pores, peach fuzz, slight asymmetry, catchlights.",
    "Hands empty or out of frame. NO smartphone, NO phone, NO iPhone, NO mirror, NO selfie, NO collage, NO contact sheet, NO extra people.",
    "Soft studio light, plain light background. Not illustration, not 3D, not anime. No watermark.",
  ]
    .filter(Boolean)
    .join(" ");
}
