export type FactoryFamily = "faceless" | "slideshow" | "talent";

export type FactoryRecipe = {
  id: string;
  family: FactoryFamily;
  name: string;
  needs: string[];
  beats: string[];
};

/** Stable catalog from UGC Factory PRD v1.0. Fourteen faceless, six slideshow, thirteen talent. */
export const FACTORY_RECIPES: FactoryRecipe[] = [
  { id: "F01", family: "faceless", name: "Proof-first", needs: ["evidence"], beats: ["Supported result", "Context", "Process", "Supporting detail", "CTA"] },
  { id: "F02", family: "faceless", name: "Screen-record", needs: ["screen"], beats: ["Source screen", "Step", "Step", "Detail", "CTA"] },
  { id: "F03", family: "faceless", name: "Pack / hero", needs: ["photo"], beats: ["Hero", "Packaging detail", "Product", "Visible benefit", "CTA"] },
  { id: "F04", family: "faceless", name: "Before / after", needs: ["before-after"], beats: ["Start state", "Problem", "Process", "End state", "CTA"] },
  { id: "F05", family: "faceless", name: "Problem to payoff", needs: ["photo"], beats: ["Problem", "Consequence", "Mechanism", "Demo", "CTA"] },
  { id: "F06", family: "faceless", name: "A vs B", needs: ["comparison"], beats: ["Setup", "A", "B", "Criteria", "CTA"] },
  { id: "F07", family: "faceless", name: "Unbox", needs: ["packaging"], beats: ["Closed pack", "Open", "Reveal", "Detail", "CTA"] },
  { id: "F08", family: "faceless", name: "What's in the box", needs: ["components"], beats: ["Packaging", "Contents", "Each part", "Setup", "CTA"] },
  { id: "F09", family: "faceless", name: "How-to", needs: ["instructions"], beats: ["Goal", "Prep", "Steps", "Result", "CTA"] },
  { id: "F10", family: "faceless", name: "Hands-only", needs: ["photo"], beats: ["Pick up", "Detail", "Use", "Close", "CTA"] },
  { id: "F11", family: "faceless", name: "Satisfying", needs: ["photo"], beats: ["Detail", "Repeatable motion", "Close detail", "Payoff", "CTA"] },
  { id: "F12", family: "faceless", name: "Test", needs: ["test"], beats: ["Question", "Setup", "Run", "Result", "Limit", "CTA"] },
  { id: "F13", family: "faceless", name: "Stop-scroll", needs: ["photo"], beats: ["Opening detail", "Context", "Product", "Benefit", "CTA"] },
  { id: "F14", family: "faceless", name: "Restock", needs: ["photo"], beats: ["Storage", "Fill", "Use", "Result", "CTA"] },
  { id: "S01", family: "slideshow", name: "Discovery", needs: ["photo"], beats: ["Hook", "Problem", "Find the product", "Main feature", "Supporting use", "CTA"] },
  { id: "S02", family: "slideshow", name: "List", needs: ["four-points"], beats: ["Title", "Point 1", "Point 2", "Point 3", "Point 4", "CTA"] },
  { id: "S03", family: "slideshow", name: "Story", needs: ["photo"], beats: ["Open", "Context", "Problem", "Action", "Change", "CTA"] },
  { id: "S04", family: "slideshow", name: "FAQ", needs: ["faq"], beats: ["Open", "Question 1", "Question 2", "Question 3", "Question 4", "CTA"] },
  { id: "S05", family: "slideshow", name: "Mistakes", needs: ["instructions"], beats: ["Open", "Mistake 1", "Mistake 2", "Mistake 3", "Better way", "CTA"] },
  { id: "S06", family: "slideshow", name: "Rank", needs: ["comparison"], beats: ["Criteria", "Fourth", "Third", "Second", "First", "CTA"] },
  { id: "T01", family: "talent", name: "Unbox talk", needs: ["talent", "packaging"], beats: ["Open", "Talk while opening", "Reveal", "Detail", "CTA"] },
  { id: "T02", family: "talent", name: "Hold", needs: ["talent", "photo"], beats: ["In hand", "Detail", "One confirmed benefit", "CTA"] },
  { id: "T03", family: "talent", name: "Talking", needs: ["talent", "voice"], beats: ["Hook", "Explain", "B-roll", "Benefit", "CTA"] },
  { id: "T04", family: "talent", name: "Lifestyle", needs: ["talent", "photo"], beats: ["Day scene", "Use", "Detail", "Payoff", "CTA"] },
  { id: "T05", family: "talent", name: "I found this", needs: ["talent", "photo"], beats: ["Discovery", "Why it fits", "Demo", "Detail", "CTA"] },
  { id: "T06", family: "talent", name: "Comment reply", needs: ["talent", "comment-or-faq"], beats: ["Question", "Answer", "Demo", "Detail", "CTA"] },
  { id: "T07", family: "talent", name: "Review", needs: ["talent", "photo"], beats: ["Criteria", "Feature", "Demo", "Known limit", "CTA"] },
  { id: "T08", family: "talent", name: "GRWM", needs: ["talent", "wearable"], beats: ["Getting ready", "Put on", "Detail", "Final look", "CTA"] },
  { id: "T09", family: "talent", name: "Beauty GRWM", needs: ["talent", "instructions"], beats: ["Prep", "Apply", "Texture", "Finish", "CTA"] },
  { id: "T10", family: "talent", name: "POV", needs: ["talent", "photo"], beats: ["POV setup", "Interact", "Detail", "Use", "CTA"] },
  { id: "T11", family: "talent", name: "Day in the life", needs: ["talent", "photo"], beats: ["Morning", "Context", "Use the product", "Next context", "CTA"] },
  { id: "T12", family: "talent", name: "Shopping haul", needs: ["talent", "components"], beats: ["Preview", "Item", "Detail", "Summary", "CTA"] },
  { id: "T13", family: "talent", name: "Demo product", needs: ["talent", "instructions"], beats: ["Goal", "Setup", "Main step", "Detail", "CTA"] },
];

export function recipeById(id: string) {
  return FACTORY_RECIPES.find((recipe) => recipe.id === id);
}

export function recipeCounts() {
  return {
    faceless: FACTORY_RECIPES.filter((recipe) => recipe.family === "faceless").length,
    slideshow: FACTORY_RECIPES.filter((recipe) => recipe.family === "slideshow").length,
    talent: FACTORY_RECIPES.filter((recipe) => recipe.family === "talent").length,
    total: FACTORY_RECIPES.length,
  };
}
