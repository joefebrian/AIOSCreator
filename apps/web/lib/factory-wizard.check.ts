import {
  creatorStillPrompt,
  descriptionFromFacts,
  dialogIssues,
  dialogUserPrompt,
  seedancePrompt,
  wizardBlockers,
  wizardCostUsd,
  wordBudget,
} from "./factory-wizard";

function check(name: string, ok: boolean) {
  if (!ok) {
    console.error("fail", name);
    process.exitCode = 1;
  }
}

const facts = [{ statement: "Two textured sides." }, { statement: "Use after cleansing." }];
check("description joins facts", descriptionFromFacts(facts) === "Two textured sides.\nUse after cleansing.");
check("empty description", descriptionFromFacts([]) === "");
check("10s budget", wordBudget(10) >= 8 && wordBudget(10) <= 24);
check("glowy refused", dialogIssues("Look how glowy my skin looks.", 10).length > 0);
check("price refused", dialogIssues("It is RM 49 today.", 10).some((row) => /price/i.test(row)));
check("i refused", dialogIssues("I love this pad.", 10).some((row) => /starts with I/i.test(row)));
check("short line ok", dialogIssues("Two sides. Use it after cleansing. Shop the listing.", 15).length === 0);
check("over time refused", dialogIssues("word ".repeat(80), 10).some((row) => /about/.test(row)));

const prompt = dialogUserPrompt({
  name: "medicube Zero Pore Pad 2.0 | huge title",
  market: "MY",
  locale: "en-MY",
  hook: "question",
  durationSec: 10,
  facts: [{ id: "f1", statement: "Two textured sides." }],
});
check("prompt uses spoken name", prompt.includes("medicube Zero Pore Pad 2.0") && !prompt.includes("huge title"));
check("prompt locks facts", prompt.includes("Two textured sides."));
check("prompt names the hook", /question/i.test(prompt));

const still = creatorStillPrompt(
  { presentation: "woman", age: "20s", hair: "long black hair", skin: "light-medium skin", wardrobe: "a white t-shirt" },
  "MY",
);
check("still is malaysian adult", /Malaysian appearance/.test(still) && /No product/.test(still));
check("still rejects soph hair", (() => {
  try {
    creatorStillPrompt({ presentation: "woman", age: "20s", hair: "blonde braid", skin: "light skin", wardrobe: "a white t-shirt" }, "MY");
    return false;
  } catch {
    return true;
  }
})());

const video = seedancePrompt({ dialog: "Two sides. Shop the listing.", locale: "en-MY", ratio: "9:16" });
check("seedance tags both images", video.includes("@Image1") && video.includes("@Image2") && video.includes("Two sides."));

const blocked = wizardBlockers({
  productImageUrl: "/api/media/products/jar.jpg",
  listingReview: "PROVISIONAL",
  eligibleFactCount: 1,
  dialog: "Two sides. Shop the listing.",
  durationSec: 10,
  stillUrl: "/api/media/UGC_Factory/person.png",
  stillAspect: "16:9",
  ratio: "9:16",
  stillSource: "generated",
  volume: 1,
});
check("provisional listing blocks", blocked.some((row) => /same physical SKU/i.test(row)));
check("ratio mismatch blocks", blocked.some((row) => /ratio/i.test(row)));
check("reference frame blocked", wizardBlockers({
  productImageUrl: "/api/media/ugc-references/clip.mp4",
  listingReview: "REVIEWED",
  eligibleFactCount: 1,
  dialog: "Two sides. Shop the listing.",
  durationSec: 10,
  stillUrl: "/api/media/uploads/person.png",
  stillAspect: "",
  ratio: "9:16",
  stillSource: "upload",
  volume: 1,
}).some((row) => /catalog photo/i.test(row)));
check("ready path is clear", wizardBlockers({
  productImageUrl: "/api/media/products/jar.jpg",
  listingReview: "REVIEWED",
  eligibleFactCount: 2,
  dialog: "Two sides. Shop the listing.",
  durationSec: 10,
  stillUrl: "/api/media/UGC_Factory/person.png",
  stillAspect: "9:16",
  ratio: "9:16",
  stillSource: "generated",
  volume: 1,
}).length === 0);
check("cost is dollars", wizardCostUsd(10, 1) > 0.5 && wizardCostUsd(10, 1) < 1.5);

if (process.exitCode) console.error("factory wizard checks failed");
else console.log("ok");
