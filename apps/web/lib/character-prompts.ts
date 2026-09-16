/** Identity plate: skin texture first. LOCK a real photo still beats this GEN.
 *  Operator prompt is uncensored for adult fictional / consented adults. No SFW filter. */
export const IDENTITY_PLATE_PROMPT =
  "Unretouched photoreal FACE LOCK headshot, shoulders-up, one woman, one face, looking at camera. Not full-body, not 3/4 body, not a lookbook. Head and shoulders only, 3:4 crop. Visible pores on nose and cheeks, peach fuzz, fine vellus hair, slight redness and uneven tone, natural oil sheen, micro-asymmetry. Flyaway hairs, real catchlights. No glass skin, no Facetune, no K-beauty retouch, no porcelain, no CGI. Soft studio light, no product, no watermark, no extra limbs.";

/** Photo = physique only. Output is a NEW person with the same build. Wardrobe follows the operator prompt. */
export const TRANSFORM_PLATE_PROMPT =
  "A different person, not the same identity as the reference. Keep only the reference physique: same body type, shoulder width, neck, posture. New face, new person. Unretouched photoreal identity plate, looking at camera. Pores on nose and cheeks, peach fuzz, slight uneven tone, no glass skin, no Facetune, no porcelain, no CGI. Soft studio light, no product, no watermark.";

export const TRANSFORM_LOCK_PREFIX =
  "Different person from the reference photo. Same build and proportions only — not the same face. New identity. ";

/** Continuity law. Prefix every bible/set still after identity is locked. */
export const CHARACTER_LOCK =
  "Same person as the locked identity plate. Do not change face, identity, skin tone, age, hair, eye color, body shape, proportions, costume, accessories, markings, colors, or defining features. Do not redesign, beautify, age, stylize, simplify, or create an alternate version.";

/** Generator + face ref: same person, sliders may restyle hair/wardrobe/body. */
export const KEEP_FACE_GENERATOR_PREFIX =
  "Same person as this face reference. Keep the exact face, identity, skin tone, age, and bone structure. Output a shoulders-up FACE LOCK headshot, looking at camera, 3:4 crop. Not full-body, not 3/4 body. Unretouched photoreal: pores, peach fuzz, uneven tone, no glass skin. Not a new person, not a lookalike.";

/** Keep-face quality bump of the headshot plate. Same crop. */
export const KEEP_FACE_UPSCALE_PROMPT =
  `${CHARACTER_LOCK} Reproduce this exact shoulders-up FACE LOCK headshot at higher fidelity. Same crop, same pose, same hair, same studio. Add photoreal skin pores, peach fuzz, catchlights. No new person, no recrop, no full-body, no 3/4 body.`;

/** Chat / new scene. Face + body stay. Pose, wardrobe, camera, scene follow the operator. */
export const ONE_PERSON_LOCK =
  "Exactly ONE person in the frame. Solo portrait. No second person, no duo, no couple selfie, no extra face over the shoulder. If the pose reference has two people, keep only the nearest subject and delete the other.";

export const SKIN_LOCK =
  "SKIN LOCK: same skin color, undertone, and melanin as the identity plate (Image 1). Face, neck, chest, arms, and legs match. Do not lighten, bleach, porcelain, or tan her into a different ethnicity. Outdoor sun may add highlight, not a new complexion.";

export const FACE_BODY_SCENE_LOCK =
  `Keep this exact person. ${ONE_PERSON_LOCK} ${SKIN_LOCK} Image 1 is the FACE lock (headshot): same face, skin tone, age, hair, eyes, bone structure. Image 2 is the BODY lock (full-length physique): same body shape, posture, proportions, and skin from head to toe — not the clothes. Do NOT copy pose, camera, crop, framing, scene, furniture, kitchen, or wardrobe from the reference images. Pose, wardrobe, lighting, and scene follow the operator prompt only. If the operator says nude, output nude: no shirt, no shorts, no bra copied from the photos. If they say studio, do not keep the apartment. Unretouched photoreal face: pores on nose and cheeks, peach fuzz, slight uneven tone, no glass skin, no Facetune.`;

export const FACE_ONLY_SCENE_LOCK =
  `Keep this exact face. ${SKIN_LOCK} Image 1 is the FACE lock (headshot): same face, skin tone, age, hair, eyes, bone structure. Do NOT copy crop, camera, or pose from the headshot. Pose, wardrobe, lighting, scene, and framing follow the operator prompt only. Unretouched photoreal face: pores on nose and cheeks, peach fuzz, slight uneven tone, no glass skin, no Facetune.`;

/** Clone Image: identity from Image 1, outfit from Image 2. Pose default = illustration; optional text overrides pose. */
export const POSE_LOOK_REAL_BASE = [
  "Exactly ONE unretouched photoreal woman. Solo photograph. Never two people, never a collage, never a giant floating head, never paste the illustrated character into the frame. Face: pores, peach fuzz, no glass skin.",
  "Image 1 is the locked character: keep her face, skin, hair, body shape, and identity.",
  "Image 2 is the LOOK: copy garments, colors, cut, accessories, and props as real fabric onto Image 1's person.",
  "Do NOT draw Image 2 as a second person. Do not keep Image 1's original clothes.",
  "Zero anime. Zero extra faces. Exactly two arms.",
].join(" ");

export const POSE_LOOK_REAL_FOLLOW_LOOK =
  "POSE DEFAULT: match Image 2's pose, stance, gesture, and how they hold any prop. Do not keep Image 1's stiff catalog stance if Image 2 is posed differently.";

export const POSE_LOOK_REAL_FOLLOW_TEXT =
  "POSE OVERRIDE: ignore Image 2's pose. Pose, camera, and action follow the operator text only. Image 2 remains clothing and props, not body pose.";

export const POSE_LOOK_REAL_PROMPT = `${POSE_LOOK_REAL_BASE} ${POSE_LOOK_REAL_FOLLOW_LOOK}`;

/** Canonical physique plate, generated once from the face lock. */
export const BODY_LOCK_PROMPT =
  `${CHARACTER_LOCK} Photoreal full-length BODY LOCK of this person. Head to toes in frame, feet on the floor, dead-front, eye-level, arms relaxed at the sides, standing, weight even. Neutral expression. Pull the camera back — do not copy the headshot crop. Plain studio, even light. Same hair as the face lock. Simple studio wardrobe if none is visible. This is the physique reference, not a fashion pose.`;

/** Sheet is assembled from locked stills. Do not ask a generator to paint a mosaic. */
export const CHARACTER_SHEET_PROMPT =
  "Assembled from the locked identity and filled stills. Not an AI collage."

/** Single-image continuity bible from the identity plate. Best-effort on T0. */
export const CHARACTER_SHEET_GEN_PROMPT = `Create a professional, ultra-photorealistic CHARACTER CONSISTENCY SHEET using the uploaded reference image as the ONLY source for the character's identity.

IDENTITY LOCK: The uploaded reference is the definitive identity. Reproduce the EXACT SAME PERSON in every panel. Do NOT redesign, beautify, reinterpret, or replace the character.

Preserve with maximum accuracy: exact facial identity, facial structure and proportions, eyes and iris color, eyebrows, nose, lips, cheeks, jawline, chin, skin tone and texture, age, hairline, hair color/length/texture/style, body proportions, distinctive marks.

LAYOUT — one clean reference-board image:
1 LARGE FRONT PORTRAIT / FACE CLOSE-UP
2 FRONT VIEW
3 3/4 LEFT VIEW
4 3/4 RIGHT VIEW
5 LEFT PROFILE
6 RIGHT PROFILE
7 BACK VIEW
8 FULL-BODY FRONT
9 FULL-BODY 3/4
10 FULL-BODY SIDE
11 FULL-BODY BACK
12 NEUTRAL EXPRESSION
13 NATURAL SMILE
14 SOFT SMILE
15 LOOKING LEFT
16 LOOKING RIGHT
17 EYE CLOSE-UP
18 EYEBROW CLOSE-UP
19 NOSE CLOSE-UP
20 LIPS CLOSE-UP
21 HAIR CLOSE-UP
22 ACCESSORIES CLOSE-UP
23 OUTFIT / CLOTHING REFERENCE
24 COLOR PALETTE / SKIN-TONE REFERENCE

Every panel is the SAME person. For unseen angles, reconstruct strictly from the visible reference. Do not invent major features.

PRESENTATION: film-production character bible, clean editorial grid, neutral studio, soft realistic light, sharp pores, individual hair strands, realistic fabric, thin borders, labels under each view, high-end model-reference aesthetic.

PHOTOREAL: unretouched real human. Pores on nose and cheeks, peach fuzz, uneven tone, realistic eyes, physically accurate hair, natural shadows. No CGI, plastic, doll face, glass skin, Facetune, or beauty-face replacement.

AVOID: different person, face morph, identity drift, altered structure, different eyes/nose/lips/jaw/skin/hair, inconsistent body, duplicate person, extra fingers, bad anatomy, cartoon, anime, illustration, over-beautification.

OUTPUT: one complete CHARACTER CONSISTENCY SHEET, master reference for consistent images and videos.`;

export type SlotGroup =
  | "bible"
  | "turnaround"
  | "face"
  | "expression"
  | "pose"
  | "costume"
  | "commerce";

export type SlotKey =
  | "sheet"
  | "headshot"
  | "front"
  | "three_quarter_body"
  | "side"
  | "back"
  | "three_quarter_left"
  | "three_quarter_right"
  | "profile"
  | "close"
  | "smile"
  | "angry"
  | "sad"
  | "surprised"
  | "worried"
  | "confident"
  | "determined"
  | "body"
  | "walk"
  | "sit"
  | "relaxed"
  | "tense"
  | "action"
  | "costume"
  | "hold"
  | "glance";

export type SlotDef = {
  key: SlotKey;
  label: string;
  group: SlotGroup;
  prompt: string;
};

export const SLOT_GROUPS: { id: SlotGroup; label: string; hint: string }[] = [
  {
    id: "bible",
    label: "2 · CONTINUITY SHEET",
    hint: "Assembled from locked stills. GEN this last — not an AI collage.",
  },
  { id: "turnaround", label: "3 · TURNAROUND", hint: "Full-body lookbook. Same scale, standing, no phone. Edit the prompt only if you want to improve it." },
  { id: "face", label: "4 · FACE", hint: "Head-and-shoulder identity details." },
  { id: "expression", label: "5 · EXPRESSIONS", hint: "Same face, different emotion." },
  { id: "pose", label: "6 · POSES", hint: "Same body, different stance." },
  { id: "costume", label: "7 · COSTUME", hint: "Wardrobe close-ups." },
  { id: "commerce", label: "8 · COMMERCE", hint: "UGC product stills. Not on the bible sheet." },
];

const SAME = CHARACTER_LOCK;

/** Complete set: Headshot + 3/4 body + Full body. Locked to GPT Image 2.5. */
export const COMPLETE_SET_ENGINE = "gpt-image-2.5";
export const COMPLETE_SET_KEYS: SlotKey[] = ["headshot", "three_quarter_body", "front"];

const HANDS_FEET =
  "Hands fully visible with correct anatomy: five fingers, natural knuckles, no extra digits, no melted fingers. Feet fully in frame, toes or shoes readable, planted on the floor. No cropped ankles, no missing hands, no amputated limbs.";

export const COMPLETE_SET_PROMPTS: Record<(typeof COMPLETE_SET_KEYS)[number], string> = {
  headshot: `${CHARACTER_LOCK}
Unretouched photoreal HEADSHOT of this exact person. Shoulders-up FACE LOCK, looking at camera, 3:4 crop. Head and shoulders only — not 3/4 body, not full-body.
Pores on nose and cheeks, peach fuzz, slight uneven tone, flyaway hairs, real catchlights. Neutral expression. No glass skin, no Facetune.
If a hand enters the frame, five correct fingers. No extra people, no collage, no watermark.`,
  three_quarter_body: `${CHARACTER_LOCK}
Photoreal THREE-QUARTER BODY of this exact person. Camera ~45 degrees. Crop mid-thigh to above the head so torso, both arms, and both hands are fully in frame. Hands: five fingers, natural knuckles, no extra digits.
Standing, weight even, arms relaxed. Same hair and wardrobe as the identity plate. Plain studio, even light. Not a headshot, not a full-length from the feet.`,
  front: `${CHARACTER_LOCK}
Photoreal FULL BODY of this exact person. Head to toes in frame, feet on the floor, dead-front, eye-level. ${HANDS_FEET}
Standing, weight even, arms relaxed at the sides. Same hair and wardrobe as the identity plate. Plain studio, even light. Pull the camera back — do not copy the headshot crop.`,
};

export const COMPLETE_SET_VIDEO_PROMPTS: Record<(typeof COMPLETE_SET_KEYS)[number], string> = {
  headshot:
    "Same person. Subtle blink and breath only. Head and shoulders stay in frame. No new identity, no camera whip.",
  three_quarter_body:
    "Same person. Natural breath, tiny weight shift. Hands and fingers stay visible. No new identity.",
  front:
    "Same person. Idle breath, feet planted, fingers visible at the sides. Full body stays in frame. No new identity, no walk-off.",
};

/** Shared lookbook law for 3 · TURNAROUND. Operator can replace per-slot in the UI. */
export const TURNAROUND_RULES = `${SAME}
Photoreal PHOTO of this exact person, one body only. Full-length lookbook: head to toes in frame, feet on the floor, same camera distance and lens as the other turnaround shots so scale matches.
Standing, weight even, arms relaxed at the sides. Hands empty.
NO smartphone, NO phone, NO iPhone, NO mirror, NO selfie, NO sitting, NO crop at the knees, NO collage, NO extra people, NO props.
Same wardrobe as the identity still. Plain studio, even light. NOT illustration, NOT 3D, NOT anime.`;

export const SLOT_DEFS: SlotDef[] = [
  {
    key: "sheet",
    label: "Continuity sheet",
    group: "bible",
    prompt: CHARACTER_SHEET_PROMPT,
  },
  {
    key: "headshot",
    label: "Headshot",
    group: "bible",
    prompt: COMPLETE_SET_PROMPTS.headshot,
  },
  {
    key: "front",
    label: "Full body",
    group: "turnaround",
    prompt: COMPLETE_SET_PROMPTS.front,
  },
  {
    key: "three_quarter_body",
    label: "3/4 body",
    group: "turnaround",
    prompt: COMPLETE_SET_PROMPTS.three_quarter_body,
  },
  {
    key: "side",
    label: "Side",
    group: "turnaround",
    prompt: `${TURNAROUND_RULES}
Camera: true side profile, 90 degrees. Nose, ear, and both feet visible. Full body. Neutral expression.`,
  },
  {
    key: "back",
    label: "Back",
    group: "turnaround",
    prompt: `${TURNAROUND_RULES}
Camera: straight from behind. Hair back, outfit back, heels and feet visible. She does not look at camera. Full body.`,
  },
  {
    key: "close",
    label: "Face front",
    group: "face",
    prompt: `${SAME} Head-and-shoulder close-up, front. Facial structure, eyes, brows, nose, lips, hair, skin, makeup, scars, tattoos. Neutral expression. No product.`,
  },
  {
    key: "three_quarter_left",
    label: "Face 3/4 L",
    group: "face",
    prompt: `${SAME} Head-and-shoulder, three-quarter left. Same facial structure and hair. Studio light.`,
  },
  {
    key: "three_quarter_right",
    label: "Face 3/4 R",
    group: "face",
    prompt: `${SAME} Head-and-shoulder, three-quarter right. Same facial structure and hair. Studio light.`,
  },
  {
    key: "profile",
    label: "Face profile",
    group: "face",
    prompt: `${SAME} True left profile, head-and-shoulder. Ear visible, jawline, nose, hairline. Studio light. No product.`,
  },
  {
    key: "smile",
    label: "Happy",
    group: "expression",
    prompt: `${SAME} Head-and-shoulder, happy expression, genuine smile. Exact same facial structure.`,
  },
  {
    key: "angry",
    label: "Angry",
    group: "expression",
    prompt: `${SAME} Head-and-shoulder, angry expression. Exact same facial structure. No redesign.`,
  },
  {
    key: "sad",
    label: "Sad",
    group: "expression",
    prompt: `${SAME} Head-and-shoulder, sad expression. Exact same facial structure.`,
  },
  {
    key: "surprised",
    label: "Surprised",
    group: "expression",
    prompt: `${SAME} Head-and-shoulder, surprised expression. Exact same facial structure.`,
  },
  {
    key: "worried",
    label: "Worried",
    group: "expression",
    prompt: `${SAME} Head-and-shoulder, worried expression. Exact same facial structure.`,
  },
  {
    key: "confident",
    label: "Confident",
    group: "expression",
    prompt: `${SAME} Head-and-shoulder, confident expression. Exact same facial structure.`,
  },
  {
    key: "determined",
    label: "Determined",
    group: "expression",
    prompt: `${SAME} Head-and-shoulder, determined expression. Exact same facial structure.`,
  },
  {
    key: "body",
    label: "Standing",
    group: "pose",
    prompt: `${SAME} Full-length standing, neutral pose. Match identity wardrobe. Studio backdrop. No product.`,
  },
  {
    key: "walk",
    label: "Walking",
    group: "pose",
    prompt: `${SAME} Full-length walking pose, mid-stride. Same anatomy and costume. Studio, no props.`,
  },
  {
    key: "sit",
    label: "Sitting",
    group: "pose",
    prompt: `${SAME} Full-length sitting pose. Same anatomy and costume. Studio, no extra furniture except a simple seat.`,
  },
  {
    key: "relaxed",
    label: "Relaxed",
    group: "pose",
    prompt: `${SAME} Full-length relaxed body language, weight on one hip. Same costume. Studio.`,
  },
  {
    key: "tense",
    label: "Tense",
    group: "pose",
    prompt: `${SAME} Full-length tense body language, guarded shoulders. Same costume. Studio.`,
  },
  {
    key: "action",
    label: "Action-ready",
    group: "pose",
    prompt: `${SAME} Full-length action-ready stance. Same anatomy, costume, silhouette. Studio, no weapons unless already on the plate.`,
  },
  {
    key: "costume",
    label: "Costume detail",
    group: "costume",
    prompt: `${SAME} Close-ups of clothing layers, fabrics, seams, fasteners, footwear, jewelry, eyewear, markings, logos. Same wardrobe as the identity plate. Studio.`,
  },
  {
    key: "hold",
    label: "Product hold",
    group: "commerce",
    prompt: `${SAME} Three-quarter portrait, holding an amber glass serum bottle toward camera. Soft studio light.`,
  },
  {
    key: "glance",
    label: "Product glance",
    group: "commerce",
    prompt: `${SAME} Shoulders-up, eyes looking down at a small bottle in hand, not at camera. Keep face identity.`,
  },
];

export const SET_PROMPTS = {
  hold: SLOT_DEFS.find((s) => s.key === "hold")!.prompt,
  close: SLOT_DEFS.find((s) => s.key === "close")!.prompt,
  body: SLOT_DEFS.find((s) => s.key === "body")!.prompt,
};
