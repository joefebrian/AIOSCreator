/** One Generate Shot. Eight blocks, in this order. Not mixed with Framing/Clothing chips. */

export type ShotPlate = "headshot" | "three_quarter" | "full";

export type ShotPreset = {
  id: string;
  label: string;
  /** Hidden from characters under 18. The Adult chip category is separate and stays. */
  nsfw?: boolean;
  plate: ShotPlate;
  pose: string;
  outfit: string;
  hair: string;
  makeup: string;
  light: string;
  texture: string;
  camera: string;
  background: string;
  must: string[];
  avoid?: string;
};

export const SHOT_PRESETS: ShotPreset[] = [
  {
    id: "backstage-military",
    label: "Backstage military",
    nsfw: true,
    plate: "full",
    pose: "Dramatic low angle. She is perched on a structure backstage, looking down into the lens. One leg is raised and bent toward the foreground. Left hand rests on the seat. Lips closed, intense direct gaze.",
    outfit: "Black mini uniform dress, plunging V-neck, silver crystal beading and baroque embroidery on the front, shoulders, and sleeves. A large sunburst jeweled emblem at the center of the chest. Thick silver stone bands at the waist and sleeve cuffs. Structured black military cap, silver metal and jewels dense on the front and the top of the brim.",
    hair: "Bangs across the forehead. The rest is worn down over the shoulders. Same length as her hair. Not a shorter cut.",
    makeup: "Dark brown and black eyeshadow, sharp under-eye line, matte nude-pink-brick lips, silver glitter nails.",
    light: "Direct hard flash from the front in a dark space. Sparkle on the crystals and the cap. Black background.",
    texture: "Matte black uniform cloth, cold silver crystals, smooth leather seat. Black and silver.",
    camera: "Worm's-eye view, camera below the knees, wide. Sharp on the chest emblem and the cap. The raised thigh and the background pipes fall soft.",
    background: "Concert backstage, industrial steel. Heavy silver and black pipes to the left, a steel staircase, dark stage gear in shadow.",
    must: [
      "black military cap with silver jewels",
      "sunburst jeweled emblem on the chest",
      "silver stone bands on the cuffs",
      "one leg raised toward the camera",
      "metal pipes and a steel staircase",
    ],
    avoid: "mask, face covering, extra people, readable logos, a different hair length",
  },
  {
    id: "beach-ice-cream",
    label: "Beach ice cream",
    nsfw: true,
    plate: "three_quarter",
    pose: "Waist-up, standing, biting a yellow animal-paw ice cream. Playful glance to the viewer's left, brows slightly scrunched.",
    outfit: "Green crochet halter bikini, top and bottoms. Black athletic shorts worn low on the hips. Large canvas tote with a yellow-and-black floral pattern on her left shoulder. Delicate silver chain. Small navel piercing.",
    hair: "Worn straight and loose. Black square sunglasses perched on the forehead like a headband. Same length as her hair.",
    makeup: "Natural outdoor complexion, vivid lip color.",
    light: "Bright even daylight, clear day, no hard nose shadow.",
    texture: "Loose crochet, canvas tote, glossy surfboard, rough wood. Bright green, mint, orange, pastel pink, blue, yellow.",
    camera: "Eye-level, about 35mm, frontal. Subject and the surfboard sharp. Background soft.",
    background: "Tropical beach club. A large color-blocked surfboard (mint, orange, yellow, pastel pink, blue) stands upright on the viewer's left. Rustic vertical-plank hut, fish-shaped wooden sign, tropical plants, rope fence.",
    must: [
      "yellow animal-paw ice cream at her mouth",
      "green crochet bikini",
      "black athletic shorts",
      "floral tote on the left shoulder",
      "upright color-blocked surfboard",
      "wooden beach hut",
    ],
    avoid: "Instagram UI tag, readable brand logo, extra people, a different hair length",
  },
  {
    id: "archery",
    label: "Archery",
    plate: "three_quarter",
    pose: "Side-on at an archery range. Left hand holds a compound bow, right hand draws the string to the chin. Serious, calm, eyes on a distant target. Extended arm straight, torso upright.",
    outfit: "Black-and-white fitted sports top and high-waisted leggings. White-frame chest guard with blue mesh. Leather finger tab on the drawing hand, blue arm guard on the bow arm. Black quiver on the belt, hanging at the hip.",
    hair: "Neatly parted, worn down over one shoulder. Not blown across the face. Same length as her hair.",
    makeup: "Sheer matte athletic base, muted rose-coral lips.",
    light: "Bright outdoor daylight from the upper-left front. Soft highlights on the bow metal and skin. No harsh shadow.",
    texture: "Stretch sportswear, fine mesh chest guard, carbon and metal bow. White and blue, with yellow and red flags behind.",
    camera: "Eye-level medium shot to the thighs, telephoto, shallow depth. Sharp on her, the bow, and the arrow. Lawn and far targets soft.",
    background: "Outdoor archery range. Yellow, blue, and red concentric targets in a row. Low green ridges and trees. Red and yellow triangular flags on the railing.",
    must: [
      "compound bow drawn to the chin",
      "blue mesh chest guard",
      "blue arm guard",
      "leather finger tab",
      "black quiver at the hip",
      "yellow blue and red targets",
    ],
    avoid: "extra people, a second bow, a different hair length",
  },
  {
    id: "beach-wind",
    label: "Beach wind",
    nsfw: true,
    plate: "three_quarter",
    pose: "Standing on grass by the beach, facing the camera. Wind throws her hair across her face. Calm, steady gaze through the strands.",
    outfit: "Oversized light-pink long-sleeve shirt, slightly damp, darker at the hem, unbuttoned low so one hip and the abdomen show. Simple black bikini underneath.",
    hair: "Windblown across the face, natural volume. Same length and color as her hair. Do not recolor it.",
    makeup: "Sheer natural makeup, understated lips.",
    light: "Late-afternoon sun from the rear-right. Rim on the hair, long shadows of her and the palm on the grass. Face still readable.",
    texture: "Wet shirt fabric, green lawn, rough palm trunk. Soft pink, black, green, sea blue.",
    camera: "Eye-level, framed to the thighs. She and the palm trunk sharp. Sea and coast soft.",
    background: "Grassy seaside promenade. A large palm trunk beside her. Gentle waves, a small boat, white letter sculptures and a blue animal statue on the lawn.",
    must: [
      "damp light-pink shirt",
      "black bikini underneath",
      "palm trunk beside her",
      "sea and a small boat",
      "white letter sculptures",
      "blue animal statue",
    ],
    avoid: "readable sign text, extra people, a different hair color or length",
  },
  {
    id: "thames",
    label: "Thames railing",
    plate: "full",
    pose: "Sitting on a stone railing, one leg crossed. The railing runs from the lower right toward the lower left. Left hand sweeps her hair back, right hand on her thigh. Bright smile at the camera.",
    outfit: "Beige long trench, loosely tied. Dark brown sheer-patterned dress underneath. Chunky black leather boots to just below the knee. A brown leather bag partly visible behind her.",
    hair: "Windswept waves, swept back by her left hand. Same length as her hair.",
    makeup: "Clear complexion, defined eyes, matte bright pink-coral lips.",
    light: "Soft late-afternoon sun through cloud, semi-backlight from the rear-right. Rim on the hair and the trench. Evening clouds.",
    texture: "Soft trench cloth, firm boot leather, rough stone. Beige, black, river blue, gray sky.",
    camera: "Slightly low, wide, medium-full. Sharp on her in the center. River, bridge, and buildings deep but soft.",
    background: "River Thames and Westminster Bridge. The bridge arches to the left. Houses of Parliament and Big Ben beyond, sun through thick gray cloud.",
    must: [
      "beige trench coat",
      "dark brown dress",
      "black knee-high boots",
      "brown leather bag",
      "stone railing",
      "Westminster Bridge and Big Ben",
    ],
    avoid: "extra people, a different hair length",
  },
  {
    id: "morning-tomatoes",
    label: "Morning tomatoes",
    plate: "three_quarter",
    pose: "Prone on white bedding, propped on both elbows. Right fist supports her cheek. Left hand lifts a lock of hair near the left ear. Head tilted, eyelids low, lips closed, no smile. Below the waist is hidden by the bedding.",
    outfit: "Ivory semi-sheer long-sleeve ribbed knit, round neck, sleeves to the wrists. No necklace, earrings, or rings. A small white plate at the lower left holds four red tomatoes with stems and water droplets. One more red tomato with a stem lies on the bedding at the right.",
    hair: "Loose natural part, wisps on the cheek. Left hand lifting hair near the ear. Same length and color as her hair.",
    makeup: "Dewy skin from the window, brown eye definition, matte muted rose-nude lips. Little blush.",
    light: "Morning light through sheer white curtains at the rear-left. Rim on the hair and left shoulder. No flash.",
    texture: "Fine rib knit, crumpled white cotton, wet tomato skin, sheer curtains. White, ivory, and red.",
    camera: "Eye-level with the bed, 50mm. Sharp on the eyes and the hand under the chin. Foreground tomato slightly closer. Curtains bright and soft.",
    background: "White bedding. Floor-to-ceiling sheer white curtains over a bright window. The far right of the room is blurred.",
    must: [
      "ivory sheer ribbed knit",
      "plate of four red tomatoes",
      "one loose red tomato on the bedding",
      "white curtains",
    ],
    avoid: "jewelry, extra people, a different hair length",
  },
  {
    id: "wall-sit",
    label: "Wall sit",
    plate: "three_quarter",
    pose: "Seated on the floor against a white wall. Right knee drawn up toward the chest, closest to the camera. Left leg folded out of frame. Left elbow near the knee, index and middle fingers touching just below the lips, back of the hand to camera. Right arm down at her side. Head tipped down, eyes up at the lens, no smile.",
    outfit: "Oatmeal knit cardigan slipped off the left shoulder, left sleeve to the wrist. Matching oatmeal V-neck knit camisole with white lace at the neckline. White shorts, only the hem visible.",
    hair: "Natural waves, see-through bangs over the eyebrows, strands across the right eye. Same length as her hair.",
    makeup: "Semi-matte skin, brown eye definition, matte muted pink-nude lips. Little blush.",
    light: "Soft indoor light from the front-left. Low contrast. No flash, no rim.",
    texture: "Fine knit, lace neckline, wavy hair, flat matte wall. White, oatmeal, dark hair.",
    camera: "Eye-level with her face. Sharp on the eyes and the hand at the mouth. The wall is almost the same plane.",
    background: "Matte off-white wall, no props, no furniture. Floor barely visible. No logos or caption text.",
    must: [
      "oatmeal cardigan off the left shoulder",
      "lace-trim camisole",
      "white shorts hem",
      "two fingers just below the lips",
      "raised right knee",
    ],
    avoid: "jewelry, props, readable text, extra people, a different hair length",
  },
  {
    id: "night-motorcycle",
    label: "Night motorcycle",
    plate: "three_quarter",
    pose: "Seated, leaning diagonally on a vintage motorcycle at night, both arms forward on the tank and handlebars. Head turned toward camera, chin down, closed lips, direct gaze. One thigh shows through a skirt slit.",
    outfit: "Cream-ivory strapless lace wedding gown, floral lace and soft tulle, high side slit. One antique crystal flower drop earring on the right ear.",
    hair: "Loose low bun or half-up of her existing length, wisps at the forehead and nape. Not a shorter cut.",
    makeup: "Brown eye shading, defined lashes, dusty-rose blush, muted rosewood lips.",
    light: "Warm-white beam from the motorcycle's round headlight, flare toward the lens. Streetlights add a soft rim. Deep shadow behind her and under the engine.",
    texture: "Lace and tulle against chrome and black metal. Teal-black night and amber headlight. Fine film grain, faded print, light scratches. Not a peeled mask.",
    camera: "Slightly below eye level, 50mm, shallow. Sharp on her face, the lace, and the front fork. City lights as round bokeh.",
    background: "Downtown roadside at night. Vintage black cruiser: chrome forks, round amber signals, black mirrors, leather seat, exposed engine. Distant traffic and streetlights as warm and pale-green bokeh.",
    must: [
      "ivory lace wedding gown with a side slit",
      "crystal drop earring",
      "vintage motorcycle",
      "round headlight flare",
    ],
    avoid: "extra people, a modern sport bike, a different hair length",
  },
  {
    id: "dark-chic-floor",
    label: "Dark chic floor",
    nsfw: true,
    plate: "full",
    pose: "Sitting on a white studio floor, body twisted slightly left, looking straight into the lens. Right knee raised, foot planted. Left leg folded inward. Both hands on the floor, taking her weight. Head level, lips slightly parted, no smile.",
    outfit: "Black halter bodysuit, plunging neckline, matte, straps behind the neck. Oversized black blazer draped off the shoulders. Black pointed slingback stilettos with a buckle strap. Small silver huggie hoops. One chunky silver ring on a hand on the floor. Fingernails and toenails pitch black.",
    hair: "Semi-wet waves, irregular part, damp strands on the forehead and jaw. Same length as her hair.",
    makeup: "Sharp black cat-eye, smoky lower lash line, cool-pink blush, glossy nude mauve-pink lips. Real pores, not airbrushed.",
    light: "Large softbox from the upper-right front, plus bounce off the white floor. Soft shadow under the folded legs and in the blazer.",
    texture: "Matte bodysuit, coarse wool blazer, glossy slingback leather, damp hair. Off-white ground and black clothes. Fine film grain.",
    camera: "Low eye-level, frontal, 50mm. Sharp on the eyes, the raised leg, and the pointed shoe. White cove falls soft.",
    background: "Seamless white cyclorama. Floor and wall meet with no seam and no props.",
    must: [
      "black halter bodysuit",
      "oversized black blazer off the shoulders",
      "black slingback heels",
      "silver ring",
      "black nail polish",
      "raised right knee and pointed shoe",
    ],
    avoid: "extra people, a colored backdrop, a different hair length",
  },
  {
    id: "hotel-cigarette",
    label: "Hotel cigarette",
    nsfw: true,
    plate: "three_quarter",
    pose: "Seated deep in an armchair, leaning back, torso turned toward the camera. Right hand raised near a cigarette at her lips, nude-beige nails. Left knee drawn up in the lower-left foreground. Head tilted, chin up, direct gaze.",
    outfit: "Black sheer lace lingerie slip, plunging V, wavy lace edge, thin spaghetti straps. Black faux fur around her back and sides. Long Y-shaped necklace of small black beads on a fine chain, down the chest.",
    hair: "Curly volume around the jaw from her existing length, see-through bangs, a few wisps on the face. Not a short bob and not a new color.",
    makeup: "Black cat-eye, brown smoky lid, terracotta blush, glossy nude-coral lips holding the cigarette. Real pores.",
    light: "Warm amber lamp from the upper right, soft fill from the front. Gold highlights on the shoulder, collarbone, lip, and raised knee. Deep shadow on the left cheek and in the fur.",
    texture: "Sheer lace, dense faux fur, damask wallpaper, pleated lampshade. Amber, black, warm skin. Fine film grain.",
    camera: "Frontal eye-level, 50mm, shallow. Sharp on the eyes, the cigarette, the curls, and the necklace. Lamp and wall soft.",
    background: "Antique hotel bedroom corner. Faded damask wallpaper, dark wood molding. A floor lamp with a pleated ivory shade at the upper right.",
    must: [
      "black lace lingerie slip",
      "black faux fur",
      "Y-shaped black bead necklace",
      "cigarette with a thin wisp of smoke",
      "pleated floor lamp",
    ],
    avoid: "extra people, a short bob, a different hair length",
  },
];

const PLATE_LINE: Record<ShotPlate, string> = {
  headshot: "Headshot plate is Image 1. Shoulders and face. No second body plate.",
  three_quarter: "Headshot plate is Image 1. 3/4 body plate is Image 2.",
  full: "Headshot plate is Image 1. Full-body plate is Image 2.",
};

export function shotById(id: string): ShotPreset | undefined {
  const key = id.trim();
  if (!key) return undefined;
  return SHOT_PRESETS.find((s) => s.id === key);
}

/** Phrases that survived in older still prompts. Each one belongs to a single shot. */
const SHOT_MARKS = [
  "perched on a structure backstage",
  "raised and bent toward the foreground",
  "yellow animal-paw ice cream",
  "compound bow drawn to the chin",
  "blue mesh chest guard",
  "Wind throws her hair across her face",
  "Sitting on a stone railing",
  "Prone on white bedding",
  "lifts a lock of hair near the left ear",
  "Seated on the floor against a white wall",
  "vintage motorcycle at night",
  "Sitting on a white studio floor",
  "black halter bodysuit",
  "color-blocked surfboard",
];

/** A still belongs to this shot. New edits store shotId. Older ones keep a pose or outfit line. */
export function editUsesShot(shot: ShotPreset, edit: { shotId?: string; prompt?: string }) {
  if (edit.shotId && edit.shotId === shot.id) return true;
  const prompt = edit.prompt || "";
  if (!prompt) return false;
  const pose = shot.pose.trim();
  if (pose.length >= 24 && prompt.includes(pose.slice(0, 42))) return true;
  const must = shot.must[0]?.trim() || "";
  if (must && prompt.includes(must)) return true;
  const blob = [shot.pose, shot.outfit, shot.background, shot.hair, ...shot.must].join("\n");
  return SHOT_MARKS.some((mark) => blob.includes(mark) && prompt.includes(mark));
}

/** Eight blocks, fixed order. Hair length stays the character's. Styling is only a delta. */
export function compileShotPrompt(shot: ShotPreset, hair: string): string {
  const locked = hair.trim();
  const length = locked
    ? `Same hair length and shape as this character (${locked}). Do not cut it shorter or grow it longer. Do not recolor it.`
    : "Same hair length and shape as the character plates. Do not cut it shorter or grow it longer. Do not recolor it.";
  const must = shot.must.length ? `Visible, do not omit: ${shot.must.join("; ")}.` : "";
  return [
    `[SUBJECT]\n${PLATE_LINE[shot.plate]} Keep this person's face and body. Do not copy the plates' clothes, pose, or studio. ${length} Skin tone stays the plate. Styling below may tie, loosen, or sweep the hair. It must not change the length.`,
    `[Subject's Pose and Expression]\n${shot.pose}`,
    `[Character Outfit and Bag/Accessories]\n${shot.outfit}`,
    `[Character Hairstyle and Makeup Details]\n${shot.hair}\n${shot.makeup}`,
    `[Lighting and Light Direction]\n${shot.light}`,
    `[Texture and Color Mood]\n${shot.texture}`,
    `[Film, Camera Lens Depth, and Angle]\n${shot.camera}`,
    `[Background and Spatial Elements]\n${shot.background}`,
    must,
    shot.avoid ? `Avoid: ${shot.avoid}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
