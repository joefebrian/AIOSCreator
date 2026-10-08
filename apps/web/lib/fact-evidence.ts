export type FactSource = "listing" | "image" | "ugc" | "campaign" | "manual";
export type FactCategory = "contents" | "features" | "usage" | "care" | "age";

export type EvidenceFact = {
  id?: string;
  skuId?: string;
  kind?: string;
  statement: string;
  state?: string;
  sourceLevel?: string;
  sourceType?: FactSource | null;
  category?: FactCategory | null;
  reviewBasis?: string | null;
  provenance?: {
    referenceId?: string;
    assetId?: string | null;
    analysisVersion?: number | null;
    sourceUrl?: string | null;
    evidence?: string;
    sourceKind?: string;
    startSec?: number | null;
    endSec?: number | null;
    reviewBasis?: string | null;
    claimClass?: string | null;
  } | null;
};

const TESTIMONIAL = /\b(my skin|i have been|i am a fan|i'm a fan|glowing|glowy|hasilnya|kulit saya|dulu|pernah pakai)\b/i;
const OUTCOME = /\d+(?:\.\d+)?\s*%|\b(?:reduction|decrease|increase)\b/i;

export function isSourceTestimonial(fact: EvidenceFact) {
  return fact.provenance?.claimClass === "source_appearance" || TESTIMONIAL.test(fact.statement || "");
}

export function isOutcomeClaim(fact: EvidenceFact) {
  return OUTCOME.test(fact.statement || "");
}

export function factSource(fact: EvidenceFact): FactSource {
  if (fact.sourceType) return fact.sourceType;
  if (fact.provenance?.referenceId) return "ugc";
  if (fact.sourceLevel === "LISTING" || fact.kind === "LISTING") return "listing";
  return "manual";
}

export function factCategory(fact: EvidenceFact): FactCategory | null {
  if (isSourceTestimonial(fact)) return null;
  if (fact.category) return fact.category;
  const text = fact.statement || "";
  if (fact.kind === "AGE" || /\b(ages?|years old|\d+\+)\b/i.test(text)) return "age";
  if (fact.kind === "USE" || /^how to use\b/i.test(text) || /\b(swipe|pat|after cleansing)\b/i.test(text)) return "usage";
  if (/\b(store|patch test|rinse|avoid the eye)\b/i.test(text)) return "care";
  if (fact.kind === "CONTENTS" || /\b(aha|bha|ingredient|willow|citric|lavender|contains)\b/i.test(text)) return "contents";
  return "features";
}

export function factBasis(fact: EvidenceFact) {
  return (fact.reviewBasis || fact.provenance?.reviewBasis || "").replace(/\s+/g, " ").trim();
}

export type FactPresentation = {
  source: FactSource;
  sourceLabel: string;
  category: FactCategory | null;
  categoryLabel: string;
  status: "Confirmed for this SKU" | "Needs review" | "Rejected" | "Extracted";
  eligible: boolean;
  testimonial: boolean;
  outcome: boolean;
  basis: string;
  excerpt: string;
};

const SOURCE_LABEL: Record<FactSource, string> = {
  listing: "Listing",
  image: "Image",
  ugc: "UGC",
  campaign: "Campaign",
  manual: "Manual",
};

const CATEGORY_LABEL: Record<FactCategory, string> = {
  contents: "Contents / specs",
  features: "Features",
  usage: "Usage",
  care: "Care",
  age: "Age suitability",
};

export function presentFact(fact: EvidenceFact): FactPresentation {
  const testimonial = isSourceTestimonial(fact);
  const outcome = isOutcomeClaim(fact);
  const basis = factBasis(fact);
  const source = factSource(fact);
  const category = factCategory(fact);
  let status: FactPresentation["status"] = "Extracted";
  if (fact.state === "REJECTED" || fact.state === "CONFLICTED") status = "Rejected";
  else if (testimonial) status = "Needs review";
  else if (fact.state === "CONFIRMED" && basis.length >= 8 && (!outcome || /\b(measured|study|lab)\b/i.test(basis))) status = "Confirmed for this SKU";
  else if (fact.state === "CONFIRMED" || outcome) status = "Needs review";
  const eligible = status === "Confirmed for this SKU" && !testimonial;
  return {
    source,
    sourceLabel: SOURCE_LABEL[source],
    category,
    categoryLabel: testimonial ? "Source testimonial" : category ? CATEGORY_LABEL[category] : "Source testimonial",
    status,
    eligible,
    testimonial,
    outcome,
    basis,
    excerpt: (fact.provenance?.evidence || "").trim(),
  };
}

export function ageSuitabilityApplies(category: string, facts: EvidenceFact[]) {
  if (/toy/i.test(category || "")) return true;
  return facts.some((fact) => factCategory(fact) === "age" || fact.kind === "AGE");
}

export function legacyKindForCategory(category: FactCategory) {
  if (category === "contents") return "CONTENTS" as const;
  if (category === "usage" || category === "care") return "USE" as const;
  if (category === "age") return "AGE" as const;
  return "LISTING" as const;
}
