export const CAMPAIGN_ANGLES = [
  { group: "Open", items: ["Unboxing", "First impression", "Expectation vs reality", "Ordered vs arrived", "ASMR open", "Satisfying close-up", "Package at the door", "Hand reveal"] },
  { group: "Problem", items: ["Problem then fix", "Tried it so you don't", "Wrong one to avoid", "The mistake", "Do this not that", "Myth vs real use", "Hidden flaw", "Not for everyone"] },
  { group: "Proof", items: ["Honest review", "7-day test", "Before after", "Wear test", "All-day test", "Size and fit check", "Three reasons", "Feature nobody shows", "Side by side", "Dupe or original"] },
  { group: "Demo", items: ["5-second demo", "How to use", "One product three ways", "Get ready with me", "Morning routine", "Night routine", "Day in the life", "In my bag", "Pack with me"] },
  { group: "Talk", items: ["Wish I knew", "Reply to a comment", "Hot take", "Storytime then product", "Rank my orders", "Haul one hero", "Gift pick", "Under a price", "Text on screen"] },
  { group: "Native", items: ["Green screen listing", "Stitch a review", "Duet the try-on", "Quiet product only", "Friend reacts", "Voiceover b-roll"] },
] as const;

export const CAMPAIGN_ANGLE_LABELS: string[] = CAMPAIGN_ANGLES.flatMap((group) => [...group.items]);

export const CAMPAIGN_ANGLE_SET = new Set(CAMPAIGN_ANGLE_LABELS);
