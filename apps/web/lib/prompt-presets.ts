/** Shipped prompt-chip catalog for Character Workspace. Not model settings. */

export type PresetOption = {
  id: string;
  label: string;
  prompt: string;
  /** Extra avoid terms on top of the global realism negative. */
  negative?: string;
  /** Optional still, served from /api/media/presets/… */
  preview?: string;
  learned?: boolean;
  /** Subject block only. Picks the Complete-set plate. */
  plate?: "headshot" | "three_quarter" | "full";
};

export type PresetCategory = {
  id: string;
  label: string;
  wash: string;
  /** Extra avoid for every option in this category. */
  negative?: string;
  nsfw?: boolean;
  options: PresetOption[];
};

const PHOTO =
  "visible pores, peach fuzz, fine film grain, natural oil sheen, flyaway hairs, real catchlights. Not CGI, not plastic skin, not airbrushed, not glass skin.";

/** Adult chips: lighting + anatomy, not a generic uncensored one-liner. */
const SKIN =
  "DSLR capture, motivated light, soft shadow gradients on pores and collarbones, peach fuzz on arms, pores on chest and shoulders, slight uneven tone on torso and thighs, natural oil sheen. Not CGI, not Unreal, not Facetune, not vinyl body, not Barbie doll chest.";

export const PRESET_CATEGORIES: PresetCategory[] = [
  {
    id: "subject",
    label: "1. Subject",
    wash: "bg-[#EEF2FF] text-[#3730A3]",
    negative: "wrong crop",
    options: [
      {
        id: "close",
        label: "Headshot",
        plate: "headshot",
        prompt: "Headshot plate. Shoulders and face. Bust crop. Nothing below the chest.",
        preview: "/api/media/presets/camera-close.png",
      },
      {
        id: "mcu",
        label: "Chest-up",
        plate: "headshot",
        prompt: "Headshot plate. Chest-up. Face and shoulders fill the frame.",
        preview: "/api/media/presets/camera-mcu.png",
      },
      {
        id: "medium",
        label: "Waist-up",
        plate: "three_quarter",
        prompt: "3/4 plate. Waist-up. Head to the waist. Feet out of frame.",
        preview: "/api/media/presets/camera-medium.png",
      },
      {
        id: "three-quarter",
        label: "3/4 to the knees",
        plate: "three_quarter",
        prompt: "3/4 plate. Waist to the knees. Feet out of frame.",
        preview: "/api/media/presets/camera-three-quarter.png",
      },
      {
        id: "full",
        label: "Full body",
        plate: "full",
        prompt: "Full body plate. Head to feet. Shoes in frame. A little space above the head.",
        preview: "/api/media/presets/camera-full.png",
      },
      {
        id: "medium-close",
        label: "Medium close-up",
        plate: "headshot",
        prompt: "Headshot plate. Medium close-up. Head through the chest. Vertical frame.",
      },
    ],
  },
  {
    id: "pose",
    label: "2. Pose and expression",
    wash: "bg-[#FDF2F8] text-[#9D174D]",
    negative: "extra fingers",
    options: [
      {
        id: "stand",
        label: "Standing relaxed",
        prompt: "Standing, weight even, arms relaxed at the sides. Closed mouth. Eyes on the lens.",
      },
      {
        id: "shift",
        label: "Weight on one leg",
        prompt: "Standing, weight on one leg, the other knee soft. One hand loose. Calm face, eyes on the lens.",
      },
      {
        id: "sit-cross",
        label: "Seated, crossed knee",
        prompt: "Seated. One knee crossed over the other. Hands in the lap. Small smile at the lens.",
      },
      {
        id: "floor-knee",
        label: "Floor, one knee up",
        prompt: "Sitting on the floor. One knee raised, the other leg folded. No smile. Eyes up at the lens.",
      },
      {
        id: "walk",
        label: "Mid-stride",
        prompt: "Walking toward the camera, mid-stride, arms in a natural swing. Face unposed.",
      },
      {
        id: "lean",
        label: "Leaning",
        prompt: "Leaning one shoulder against a surface. Hands down. Quiet gaze at the lens.",
      },
      {
        id: "hips",
        label: "Hands on hips",
        prompt: "Standing, both hands on the hips, chin level, mouth closed, direct gaze.",
      },
      {
        id: "away",
        label: "Look off-camera",
        prompt: "Torso turned three-quarters. Eyes off-camera. Relaxed brow. Mouth closed.",
      },
      {
        id: "profile",
        label: "Side stance",
        prompt: "Body in true side profile. Eyes looking forward along the profile. Arms down.",
        preview: "/api/media/presets/camera-profile.png",
      },
      {
        id: "back",
        label: "Glance back",
        prompt: "Back toward the camera. Head turned to look over one shoulder. Mouth closed.",
        preview: "/api/media/presets/camera-back.png",
      },
      {
        id: "bubble",
        label: "Bubble",
        prompt: "Leaning slightly forward, chin a little up, arms down. Lips hold a small pink bubble. Eyes on the lens.",
      },
    ],
  },
  {
    id: "outfit",
    label: "3. Outfit and accessories",
    wash: "bg-[#F5F3FF] text-[#5B21B6]",
    negative: "wrong era costume",
    options: [
      {
        id: "street",
        label: "Streetwear",
        prompt: "Oversized tee, baggy denim, sneakers. Small crossbody bag. Thin chain.",
        preview: "/api/media/presets/clothing-street.png",
      },
      {
        id: "evening",
        label: "Evening",
        prompt: "Evening dress, heels, small clutch, small earrings.",
        preview: "/api/media/presets/clothing-evening.png",
      },
      {
        id: "lounge",
        label: "Lounge",
        prompt: "Loungewear in silk or cotton, relaxed drape. Bare feet or house slippers. No jewelry.",
        preview: "/api/media/presets/clothing-lounge.png",
      },
      {
        id: "swim",
        label: "Swim",
        prompt: "Swimwear. Sandals or bare feet. No cover-up unless named.",
        preview: "/api/media/presets/clothing-swim.png",
      },
      {
        id: "office",
        label: "Office",
        prompt: "Tailored blazer, trousers, leather shoes. Small tote or empty hands.",
        preview: "/api/media/presets/clothing-office.png",
      },
      {
        id: "athleisure",
        label: "Athleisure",
        prompt: "Fitted sports top and leggings, trainers. No handbag.",
        preview: "/api/media/presets/clothing-athleisure.png",
      },
      {
        id: "knit",
        label: "Knit",
        prompt: "Chunky knit sweater, wool texture, simple trousers or a skirt, boots.",
        preview: "/api/media/presets/clothing-knit.png",
      },
      {
        id: "summer-dress",
        label: "Summer dress",
        prompt: "Light summer dress, sandals, a small shoulder bag.",
        preview: "/api/media/presets/clothing-summer-dress.png",
      },
      {
        id: "blazer",
        label: "Oversized blazer",
        prompt: "Oversized blazer over a tee, trousers or shorts, sneakers. No extra coat.",
        preview: "/api/media/presets/clothing-blazer.png",
      },
      {
        id: "denim",
        label: "Denim jacket",
        prompt: "Worn denim jacket, simple top, jeans, sneakers.",
        preview: "/api/media/presets/clothing-denim.png",
      },
      {
        id: "sukajan",
        label: "Sukajan",
        prompt: "Burgundy velvet lace bustier, thin straps. Navy silk sukajan off the shoulders, champagne satin lining, gold embroidery, burgundy and cream ribbed cuffs.",
      },
    ],
  },
  {
    id: "hair",
    label: "4. Hair and makeup",
    wash: "bg-[#FFF1F2] text-[#9F1239]",
    negative: "",
    options: [
      {
        id: "loose",
        label: "Loose",
        prompt: "Worn loose. Soft makeup, natural lip, clean nails. Styling only. Same length and color.",
      },
      {
        id: "bangs",
        label: "Side bangs",
        prompt: "See-through bangs swept to one side, the rest worn down. Defined eyes, muted lip. Styling only. Same length and color.",
      },
      {
        id: "tied",
        label: "Tied back",
        prompt: "Tied back or a low ponytail using the existing length. Clean makeup, natural lip. Not a cut.",
      },
      {
        id: "half-up",
        label: "Half-up",
        prompt: "Half-up, the length still down. Soft rose lip. Styling only. Same length and color.",
      },
      {
        id: "wind",
        label: "Windblown",
        prompt: "Wind lifts the hair across the face. Sheer makeup. Styling only. Same length and color.",
      },
      {
        id: "wet-look",
        label: "Wet-look",
        prompt: "Wet-look waves of the same length. Glossy lip, dark nails. Not a new cut and not a new color.",
      },
      {
        id: "loose-night",
        label: "Loose night",
        prompt: "Worn loose, a few strands on the cheeks. Peach-rose blush, glossy pink lip. Styling only. Same length and color.",
      },
    ],
  },
  {
    id: "light",
    label: "5. Light",
    wash: "bg-[#F5F3FF] text-[#6D28D9]",
    negative: "a second time of day",
    options: [
      {
        id: "morning",
        label: "Morning window",
        prompt: "Soft morning light from a window at camera-left. Slow falloff. No flash.",
        preview: "/api/media/presets/weather-morning.png",
      },
      {
        id: "golden",
        label: "Golden rim",
        prompt: "Warm rim from the rear-right. Long shadows. Face still readable.",
        preview: "/api/media/presets/weather-golden.png",
      },
      {
        id: "overcast",
        label: "Overcast wrap",
        prompt: "Open shade. Soft wrap from above and the front. No hard nose shadow.",
        preview: "/api/media/presets/weather-overcast.png",
      },
      {
        id: "noon",
        label: "Harsh noon",
        prompt: "Hard sun from overhead. Short shadows under the brow and chin.",
        preview: "/api/media/presets/weather-noon.png",
      },
      {
        id: "hot",
        label: "Hard summer sun",
        prompt: "Hard high sun, high contrast, a little sheen on the skin. Squint is allowed.",
        preview: "/api/media/presets/weather-hot.png",
      },
      {
        id: "blue-hour",
        label: "Blue hour",
        prompt: "Cool dusk ambient, plus one warm practical as the only warm source.",
        preview: "/api/media/presets/weather-blue-hour.png",
      },
      {
        id: "tungsten",
        label: "Tungsten",
        prompt: "Warm tungsten practicals from the upper right. Orange highlights. Soft fill from the front.",
        preview: "/api/media/presets/weather-tungsten.png",
      },
      {
        id: "neon-night",
        label: "Neon spill",
        prompt: "Magenta and cyan spill on the skin from off-camera practicals. No second sun.",
        preview: "/api/media/presets/weather-neon-night.png",
      },
      {
        id: "rain",
        label: "Rain light",
        prompt: "Cool diffuse overcast. Wet highlights on skin. No hard shadow.",
        preview: "/api/media/presets/weather-rain.png",
      },
      {
        id: "ring",
        label: "Ring light",
        prompt: "Ring-light catchlight, slightly cool, even on the face.",
        preview: "/api/media/presets/weather-ring.png",
      },
      {
        id: "flash",
        label: "Front flash",
        prompt: "Direct flash from the front. Hard shadow behind the subject.",
        preview: "/api/media/presets/art-style-flash.png",
      },
      {
        id: "studio",
        label: "Beauty dish",
        prompt: "Large soft source from the upper front, plus fill. Soft shadow under the chin.",
        preview: "/api/media/presets/art-style-studio.png",
      },
      {
        id: "neon-street",
        label: "Neon street",
        prompt: "Night neon from behind: orange, amber, and red rim on the hair and shoulders. Soft night fill from the front. No second sun.",
      },
    ],
  },
  {
    id: "texture",
    label: "6. Texture and color",
    wash: "bg-[#F7FEE7] text-[#3F6212]",
    negative: "",
    options: [
      {
        id: "photoreal",
        label: "Natural",
        prompt: `Real skin and cloth. Neutral color. ${PHOTO}`,
        preview: "/api/media/presets/art-style-photoreal.png",
      },
      {
        id: "editorial",
        label: "Editorial",
        prompt: "Sharp fabric weave, magazine contrast, clean highlights. Real skin.",
        preview: "/api/media/presets/art-style-editorial.png",
      },
      {
        id: "cinematic",
        label: "Filmic contrast",
        prompt: "Filmic contrast, deep shadows, muted highlights. Real skin, not a grade that erases pores.",
        preview: "/api/media/presets/art-style-cinematic.png",
      },
      {
        id: "analog",
        label: "Faded warm",
        prompt: "Warm skin, faded shadows, slight halation. Fine grain lives with the color, not a new camera.",
        preview: "/api/media/presets/art-style-analog.png",
      },
      {
        id: "lookbook",
        label: "Catalog clean",
        prompt: "Even color, garment texture first, low contrast. Real cloth, not plastic.",
        preview: "/api/media/presets/art-style-lookbook.png",
      },
      { id: "muted", label: "Muted earth", prompt: "Muted earth palette. Beige, brown, olive, soft black. Matte cloth." },
      { id: "cool", label: "Cool gray", prompt: "Cool gray and blue palette. Soft contrast. Matte surfaces." },
      { id: "gloss", label: "Gloss", prompt: "Specular sheen on skin and cloth. Highlights stay small. Pores still visible." },
      { id: "matte", label: "Matte", prompt: "Matte cloth and skin. Little specular. Fine texture still visible." },
      {
        id: "night-satin",
        label: "Night satin",
        prompt: "Night palette of navy, burgundy, and champagne. Velvet pile, satin sheen, embroidery thread. Fine film grain. Skin tone stays the plate.",
      },
    ],
  },
  {
    id: "film",
    label: "7. Film, lens, angle",
    wash: "bg-[#ECFEFF] text-[#155E75]",
    negative: "",
    options: [
      {
        id: "eye",
        label: "Eye-level 50mm",
        prompt: "Eye-level. 50mm. Shallow depth. Subject sharp, background soft.",
      },
      {
        id: "low",
        label: "Low angle",
        prompt: "Camera below the chest, looking up. Wide enough to keep the body natural. No dutch tilt.",
        preview: "/api/media/presets/camera-low.png",
      },
      {
        id: "high",
        label: "High angle",
        prompt: "Camera above the head, looking down. Subject still fills the frame.",
        preview: "/api/media/presets/camera-high.png",
      },
      {
        id: "voyeur",
        label: "Over-shoulder",
        prompt: "Camera just over a foreground shoulder. Slightly off-axis. Subject is the sharp plane.",
        preview: "/api/media/presets/camera-voyeur.png",
      },
      {
        id: "35mm",
        label: "35mm",
        prompt: "35mm lens. A bit of the place in frame. Mild depth. Eye-level.",
      },
      {
        id: "85mm",
        label: "85mm",
        prompt: "85mm. Compressed background. Eyes sharp. Background soft.",
        preview: "/api/media/presets/art-style-85mm.png",
      },
      {
        id: "iphone-17",
        label: "Phone wide",
        prompt: "Phone rear camera, about 24mm, slight wide perspective, phone noise.",
        preview: "/api/media/presets/capture-iphone-17.png",
      },
      {
        id: "iphone-selfie",
        label: "Phone selfie",
        prompt: "Phone front camera at arm's length. Mild wide perspective. Phone noise.",
        preview: "/api/media/presets/capture-iphone-selfie.png",
      },
      {
        id: "ugc-selfie",
        label: "UGC phone",
        prompt: "Front phone camera, slight wide perspective, phone noise. Snapshot timing.",
        preview: "/api/media/presets/art-style-ugc-selfie.png",
      },
      {
        id: "mirror-ugc",
        label: "Mirror phone",
        prompt: "Phone photo in a mirror. The phone is in frame. Snapshot crop.",
        preview: "/api/media/presets/art-style-mirror-ugc.png",
      },
      {
        id: "leica-m",
        label: "35mm rangefinder",
        prompt: "35mm rangefinder still. Fine grain. Natural contrast. No oversharpening.",
        preview: "/api/media/presets/capture-leica-m.png",
      },
      {
        id: "sony-a7",
        label: "50mm shallow",
        prompt: "50mm, shallow depth, clean detail, realistic skin. Not a beauty-retouch file.",
        preview: "/api/media/presets/capture-sony-a7.png",
      },
      {
        id: "canon-r",
        label: "85mm compressed",
        prompt: "85mm, compressed background, soft bokeh, magazine still.",
        preview: "/api/media/presets/capture-canon-r.png",
      },
      {
        id: "fuji-x100",
        label: "23mm street",
        prompt: "23mm compact. Mild grain. Street-photo color. Eye-level.",
        preview: "/api/media/presets/capture-fuji-x100.png",
      },
      {
        id: "contax-t2",
        label: "38mm snapshot",
        prompt: "38mm compact film. Snapshot timing. Mild grain. Imperfect exposure.",
        preview: "/api/media/presets/capture-contax-t2.png",
      },
      {
        id: "disposable",
        label: "Disposable",
        prompt: "Point-and-shoot snapshot. Cheap color. Hard direct light falloff. Slightly missed focus is allowed.",
        preview: "/api/media/presets/capture-disposable.png",
      },
      {
        id: "hasselblad",
        label: "Medium format",
        prompt: "80mm medium format. Lots of detail. Quiet perspective. Real texture.",
        preview: "/api/media/presets/capture-hasselblad.png",
      },
      {
        id: "polaroid",
        label: "Instant film",
        prompt: "Instant film. Soft edges. Chemical color shift. Snapshot crop.",
        preview: "/api/media/presets/capture-polaroid.png",
      },
      {
        id: "neon-50",
        label: "50mm neon",
        prompt: "Eye-level 50mm. Eyes and the bubble sharp. Neon signs fall into round bokeh. Mild grain.",
      },
    ],
  },
  {
    id: "background",
    label: "8. Background",
    wash: "bg-[#ECFDF5] text-[#047857]",
    negative: "readable sign text",
    options: [
      {
        id: "apartment",
        label: "Apartment",
        prompt: "Modern apartment. Sofa, city window, a floor lamp as a set piece.",
        preview: "/api/media/presets/architecture-apartment.png",
      },
      {
        id: "hotel",
        label: "Hotel room",
        prompt: "Hotel room. Bed, city window, one armchair.",
        preview: "/api/media/presets/architecture-hotel.png",
      },
      {
        id: "cafe",
        label: "Cafe",
        prompt: "Small cafe. Wood tables, pendant lamps, street visible in the window.",
        preview: "/api/media/presets/architecture-cafe.png",
      },
      {
        id: "loft",
        label: "Loft",
        prompt: "Industrial loft. Concrete, brick, large factory windows.",
        preview: "/api/media/presets/architecture-loft.png",
      },
      {
        id: "penthouse",
        label: "Penthouse",
        prompt: "Penthouse. Glass wall, night skyline beyond the glass.",
        preview: "/api/media/presets/architecture-penthouse.png",
      },
      {
        id: "bathroom",
        label: "Marble bath",
        prompt: "Marble bathroom. Vanity, mirror, tub edge.",
        preview: "/api/media/presets/architecture-bathroom.png",
      },
      {
        id: "kitchen",
        label: "Kitchen",
        prompt: "Open kitchen. Island, stools, a window.",
        preview: "/api/media/presets/architecture-kitchen.png",
      },
      {
        id: "balcony",
        label: "Balcony",
        prompt: "Narrow apartment balcony. Railing, city below.",
        preview: "/api/media/presets/architecture-balcony.png",
      },
      {
        id: "conv-store",
        label: "Convenience store",
        prompt: "Night convenience-store aisle. Snack shelves, glass door.",
        preview: "/api/media/presets/architecture-conv-store.png",
      },
      {
        id: "gym",
        label: "Gym",
        prompt: "Gym. Rubber floor, mirror wall, a rack in the background.",
        preview: "/api/media/presets/architecture-gym.png",
      },
      {
        id: "city-night",
        label: "City night",
        prompt: "City street at night. Wet asphalt, neon signs, no readable words.",
        preview: "/api/media/presets/landscape-city-night.png",
      },
      {
        id: "beach",
        label: "Beach",
        prompt: "Beach. Waterline, sand, horizon.",
        preview: "/api/media/presets/landscape-beach.png",
      },
      {
        id: "park",
        label: "Park",
        prompt: "City park path. Trees, a bench.",
        preview: "/api/media/presets/landscape-park.png",
      },
      {
        id: "engawa",
        label: "Engawa",
        prompt: "Wooden engawa. Paper screens, garden trees.",
        preview: "/api/media/presets/landscape-engawa.png",
      },
      {
        id: "rooftop",
        label: "Rooftop",
        prompt: "Rooftop. Parapet, skyline beyond.",
        preview: "/api/media/presets/landscape-rooftop.png",
      },
      {
        id: "alley",
        label: "Alley",
        prompt: "Narrow alley. Textured walls, one doorway.",
        preview: "/api/media/presets/landscape-alley.png",
      },
      {
        id: "bedroom",
        label: "Bedroom",
        prompt: "Bedroom. Bed, rumpled sheets, sheer curtains.",
        preview: "/api/media/presets/landscape-bedroom.png",
      },
      {
        id: "living",
        label: "Living room",
        prompt: "Lived-in living room. Sofa, a lamp, a low table.",
        preview: "/api/media/presets/landscape-living.png",
      },
      {
        id: "seamless",
        label: "Seamless paper",
        prompt: "Seamless paper cove. No furniture. No props.",
        preview: "/api/media/presets/landscape-seamless.png",
      },
      {
        id: "parking",
        label: "Parking garage",
        prompt: "Concrete parking garage. Columns, a parked car out of focus.",
        preview: "/api/media/presets/landscape-parking.png",
      },
      {
        id: "subway",
        label: "Subway",
        prompt: "Subway platform. Tile wall, track edge. No readable signs.",
        preview: "/api/media/presets/landscape-subway.png",
      },
      {
        id: "neon-downtown",
        label: "Neon downtown",
        prompt: "Late-night downtown street. Vertical neon pillars in red, orange, and white. Shop lights down the block. No readable lettering.",
      },
    ],
  },
  {
    id: "adult",
    label: "Adult 18+",
    wash: "bg-[#111827] text-white",
    nsfw: true,
    negative: "child, underage, school uniform, censored bars, mosaic censor, featureless breasts, Barbie doll chest",
    options: [
      {
        id: "nude-studio",
        label: "Nude · studio",
        prompt: `completely nude adult woman, no clothing, standing in a photography studio on seamless paper. Soft window key from camera-left, shadow falloff on collarbones. Natural breasts with visible nipples and areolae, uncensored. Not the identity-photo room. ${SKIN}`,
        negative: "clothes, bikini, bra, underwear, towel, robe, featureless breasts, Barbie doll chest",
        preview: "/api/media/presets/adult-nude-studio.png",
      },
      {
        id: "lingerie",
        label: "Lingerie",
        prompt: `sheer black lingerie, lace texture, sitting on a low stool, one shoulder dropped, looking down. Beauty dish plus a dim practical, catchlights, fabric transmitting light. ${SKIN}`,
        negative: "streetwear, parka, fully dressed, school uniform",
        preview: "/api/media/presets/adult-lingerie.png",
      },
      {
        id: "boudoir",
        label: "Boudoir",
        prompt: `boudoir on rumpled sheets, she sits on the mattress edge hugging one knee, gaze diagonally down, not a catalog smile. One warm lamp as the only key, dark falloff behind. Lingerie or nude, intimate. ${SKIN}`,
        negative: "office, outdoor street, fully dressed coat, studio smile",
        preview: "/api/media/presets/adult-boudoir.png",
      },
      {
        id: "sheer",
        label: "Sheer slip",
        prompt: `sheer slip in a hotel room, body visible through fabric, sitting on the sink-adjacent counter or bed edge, leaning forward. One practical lamp, specular on silk. ${SKIN}`,
        negative: "opaque heavy coat, sweater, jeans",
        preview: "/api/media/presets/adult-sheer.png",
      },
      {
        id: "wet",
        label: "After shower",
        prompt: `wet skin, water droplets, after a shower, marble bathroom, sitting on the edge of the sink, unidirectional vanity light above the mirror, voyeur framing through a dark foreground gap. ${SKIN}`,
        negative: "dry matte makeup, desert dust, fully buttoned shirt, noon sun",
        preview: "/api/media/presets/adult-wet.png",
      },
      {
        id: "towel",
        label: "Bath towel",
        prompt: `loose bath towel, bathroom steam, skin on shoulders and thighs, perched on the tub edge, looking down. Steamed mirror, one overhead practical. ${SKIN}`,
        negative: "evening gown, sneakers, office",
        preview: "/api/media/presets/adult-towel.png",
      },
      {
        id: "open-robe",
        label: "Open robe",
        prompt: `silk robe hanging open off the shoulders, hotel room at night, she sits on the bed edge, one knee up, looking down, not smiling at camera. Bare breasts with visible nipples and areolae, natural anatomy, uncensored. One warm lamp, shadow gradients on collarbones. ${SKIN}`,
        negative: "zipped coat, turtleneck, classroom, tank top, identity shorts, Barbie doll chest, featureless breasts",
        preview: "/api/media/presets/adult-open-robe.png",
      },
      {
        id: "micro-bikini",
        label: "Tiny bikini",
        prompt: `tiny dark bikini, night shoreline or pool, kneeling in shallow water, on-camera flash, wet skin, specular highlights, high contrast against a dark background. Not a noon catalog. ${SKIN}`,
        negative: "one-piece modest swim dress, parka, snow, studio seamless, noon sun",
        preview: "/api/media/presets/adult-micro-bikini.png",
      },
      {
        id: "body-oil",
        label: "Body oil",
        prompt: `nude or nearly nude, skin oil sheen, studio rim light from behind, she turns three-quarter, looking off-camera. Visible nipples and areolae if the chest is bare, uncensored. ${SKIN}`,
        negative: "matte powder, heavy clothes, parka, Barbie doll chest",
        preview: "/api/media/presets/adult-body-oil.png",
      },
      {
        id: "implied-sheet",
        label: "In bed",
        prompt: `in bed, sheet pooled low on the hips, morning window as the only key. Lying back, one arm above her head, gaze off-camera, melancholic. Bare torso, visible nipples and areolae, uncensored. Curtain-filtered light, pore texture. ${SKIN}`,
        negative: "fully made hotel turndown, suit, tie, catalog smile, Barbie doll chest, featureless breasts",
        preview: "/api/media/presets/adult-implied-sheet.png",
      },
    ],
  },
];

for (const cat of PRESET_CATEGORIES) {
  for (const opt of cat.options) {
    if (!opt.preview) opt.preview = `/api/media/presets/${cat.id}-${opt.id}.png`;
  }
}

const LEGACY_CATEGORY: Record<string, string> = {
  camera: "subject",
  capture: "film",
  "art-style": "texture",
  clothing: "outfit",
  architecture: "background",
  landscape: "background",
  weather: "light",
};

function findPreset(categoryId: string, optionId: string): { cat: PresetCategory; opt: PresetOption } | undefined {
  const direct = PRESET_CATEGORIES.find((c) => c.id === categoryId);
  const inDirect = direct?.options.find((o) => o.id === optionId);
  if (direct && inDirect) return { cat: direct, opt: inDirect };
  const aliased = PRESET_CATEGORIES.find((c) => c.id === LEGACY_CATEGORY[categoryId]);
  const inAlias = aliased?.options.find((o) => o.id === optionId);
  if (aliased && inAlias) return { cat: aliased, opt: inAlias };
  for (const cat of PRESET_CATEGORIES) {
    const opt = cat.options.find((o) => o.id === optionId);
    if (opt) return { cat, opt };
  }
  return undefined;
}

export function presetPrompt(categoryId: string, optionId: string): string | undefined {
  return findPreset(categoryId, optionId)?.opt.prompt;
}

export function presetLabel(categoryId: string, optionId: string): string | undefined {
  return findPreset(categoryId, optionId)?.opt.label;
}

export function presetNegative(categoryId: string, optionId: string): string {
  const hit = findPreset(categoryId, optionId);
  return [hit?.cat.negative, hit?.opt.negative].filter(Boolean).join(", ");
}

export function presetPreview(categoryId: string, optionId: string): string | undefined {
  return findPreset(categoryId, optionId)?.opt.preview;
}

export function subjectPlate(optionId: string): "headshot" | "three_quarter" | "full" | undefined {
  return findPreset("subject", optionId)?.opt.plate;
}

/** Crop words in the Subject block pick the plate. Angle words in other blocks do not. */
export function plateFromSubjectBlock(text: string): "headshot" | "three_quarter" | "full" | undefined {
  const t = text.toLowerCase();
  if (/\bheadshot\b|shoulders and face|chest-up|medium close-up|bust/.test(t)) return "headshot";
  if (/\b3\s*\/\s*4\b|three-quarter|waist-up|waist to the knees|knee-up|head to the knees/.test(t)) return "three_quarter";
  if (/\bfull body\b|head to feet/.test(t)) return "full";
  return undefined;
}

function outsideSection(title: string): string | null {
  const t = title.toLowerCase();
  if (/pose|expression/.test(t)) return "pose";
  if (/outfit|accessor|attire|wardrobe|clothing/.test(t)) return "outfit";
  if (/hair|makeup/.test(t)) return "hair";
  if (/light/.test(t)) return "light";
  if (/texture|color/.test(t)) return "texture";
  if (/film|camera|lens|depth/.test(t)) return "film";
  if (/background|spatial/.test(t)) return "background";
  if (/subject/.test(t)) return "subject";
  return null;
}

function plainOutside(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .trim();
}

function scrubOutside(text: string): string {
  return plainOutside(text)
    .replace(/["“”']?\s*Y2K teen geek-chic\s*["“”']?/gi, "")
    .replace(/\b(teenager|teen girl|teen)\b/gi, "")
    .replace(/subtle shading beneath the eyes to accentuate the\s+\*?aegyo-sal\*?(?:\s*\([^)]*\))?/gi, "subtle shading beneath the eyes")
    .replace(/\*?aegyo-sal\*?(?:\s*\([^)]*\))?/gi, "soft shading under the eyes")
    .replace(/\bsilhouettes of (?:people|figures) sitting[^,]*/gi, "distant chairs, no extra faces")
    .replace(/\b(?:people|figures|crowd) sitting[^,]*/gi, "distant chairs, no extra faces")
    .replace(/\bdeep black for the subject['’]?s hair\b/gi, "the plate's own hair color")
    .replace(/\bcream-ivory\b/gi, "cream")
    .replace(/off-white\/ivory/gi, "off-white")
    .replace(/\b(?:the\s+)?orange-brown tones of the hair\b/gi, "the plate's hair color")
    .replace(/\baccentuate the leg line\b/gi, "keep the body plate's leg width")
    .replace(/\bf\/\s*\d+(?:\.\d+)?\b/gi, "")
    .replace(/["“”']\s*["“”']/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .replace(/\.{2,}/g, ".")
    .trim();
}

/** A turn, a garment, or a lens line later in the section still has to survive the cap. */
const OUTSIDE_KEEP =
  /\b(three[-\s]?quarters?|tilts?|jawline|bitten|glasses|beads|pendant|butterfly|scrunchie|wisps?|liner|blush|upper left|low-eye|looking slightly up|35\s*mm|50\s*mm|85\s*mm|veil|bouquet|gloves?|ear cuff|parted|eye-level|chin|bokeh|flag|gravel|no extra faces)\b/i;

function clipOutside(text: string, max = 1200): string {
  const clean = scrubOutside(text);
  if (clean.length <= max) return clean;
  const sentences = clean.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  let used = 0;
  for (const sentence of sentences) {
    const keep = OUTSIDE_KEEP.test(sentence);
    if (!keep && used >= max) continue;
    if (!keep && out.length > 0 && used + sentence.length + 1 > max) continue;
    out.push(sentence);
    used += sentence.length + 1;
  }
  return (out.join(" ") || clean.slice(0, max)).trim();
}

/** A pasted essay with kerangka headings becomes one block per heading. Null when it is not that shape. */
export function parseExternalKerangka(raw: string): Record<string, string> | null {
  const text = (raw || "").replace(/\r\n/g, "\n");
  const re = /(?:^|\n|(?<=[.!?]))\s*(?:\*\*)?(?:\d+\.\s*)?\[([^\]]+)\]/g;
  const hits: { id: string; contentAt: number; headingAt: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const id = outsideSection(match[1] || "");
    if (!id) continue;
    hits.push({ id, contentAt: match.index + match[0].length, headingAt: match.index });
  }
  if (hits.length < 3) return null;
  const blocks: Record<string, string> = {};
  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i]!;
    const end = i + 1 < hits.length ? hits[i + 1]!.headingAt : text.length;
    const body = clipOutside(text.slice(hit.contentAt, end));
    if (body) blocks[hit.id] = body;
  }
  const pose = blocks.pose || "";
  const film = blocks.film || "";
  const cropSource = `${pose} ${film}`;
  if (subjectUnset(blocks.subject)) {
    const inferred = inferCropSubject(cropSource);
    if (inferred) blocks.subject = inferred;
  }
  if (blocks.hair) {
    blocks.hair = blocks.hair
      .replace(/\bHair:\s*/gi, "")
      .replace(/\blong,\s*deep black or dark brown hair\b/gi, "The existing hair")
      .replace(/\ba luminous orange-brown or warm-brown hue\b/gi, "its own color, with warm sun on the strands");
  }
  if (blocks.hair && !/same length|not a cut|styling only/i.test(blocks.hair)) {
    blocks.hair = clipOutside(`${blocks.hair} Styling only, same length and color, not a cut.`, 1280);
  }
  if (blocks.pose && blocks.subject) {
    const withoutCrop = blocks.pose.replace(/^[^.]*\b(?:close-up|bust-to-medium|headshot)\b[^.]*\.\s*/i, "").trim();
    if (withoutCrop.length > 40) blocks.pose = withoutCrop;
  }
  const filled = ["pose", "outfit", "hair", "light", "texture", "film", "background"].filter((id) => blocks[id]).length;
  if (filled < 3) return null;
  return blocks;
}

function dropLooseIdentity(text: string) {
  return text
    .replace(/\b(?:an|the)\s+(?:unmistakably\s+)?adult woman,?\s*(?:\d+\s*or older)?/gi, "")
    .replace(/\b\d+\s*(?:years?\s*old|or older)\b/gi, "")
    .replace(/\s+,/g, ",")
    .replace(/^[,\s]+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function tidyLoose(text: string) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\b(?:on|against|in)\s+(?:a|the)\s*(?=,|$)/gi, "")
    .replace(/\b(?:with|and the|during an)\s*(?=,|$)/gi, "")
    .replace(/^(?:(?:a|of)\s+)+/i, "")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,+/g, ", ")
    .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Local place when a loose essay names an evening outfit and no room. */
export function moodPlaceFallback(cue: string): string | null {
  if (/\b(halter dress|evening|gold chains?|lounge chair|plunging)\b/i.test(cue || "")) {
    return "A dim lounge bar. Warm lamps, dark wood, low seating, glasses on a side table. She is in that room. No extra people. No readable lettering.";
  }
  return null;
}

type LooseId = "subject" | "pose" | "outfit" | "hair" | "light" | "texture" | "film" | "background";

function looseOwner(clause: string): LooseId | null {
  const poseLead = /^\s*(?:her |the |both )?(?:feet|legs|arm|arms|knee|knees|hips|torso|palm|hand|hands|thigh)/i.test(clause);
  const outfit = /\b(?:wears?|wearing|matching|bodysuit|dress|corset|halter|glove|sleeve|heel|stiletto|strap|collar|hardware|fastening|ankle bands?|chains?)\b/i.test(clause);
  const pose = /\b(?:sits?|sitting|leans?|leaning|reclin\w*|torso|hips|knees?|thigh|feet|legs?|palm|fingers|hands?|arms?|staggered|peace signs?|eyelids|parted lips|playful expression|looks?\s+(?:directly|into))\b/i.test(clause);
  if (poseLead && pose) return "pose";
  if (/\b(?:makeup|lipstick|eyeliner|blush|nails|hairstyle|bangs|updo|side-parted)\b/i.test(clause)) return "hair";
  if (outfit && !/\bbehind (?:her|him)\b/i.test(clause)) return "outfit";
  if (pose) return "pose";
  if (/\b(?:glossy|patent|latex|wrinkle|reflections?|skin texture)\b/i.test(clause)) return "texture";
  if (/\b(?:high-key|low-key|daylight|flash|rim light|window light|room light)\b/i.test(clause)) return "light";
  if (/\b(?:editorial|photograph|photorealistic|portrait|\d+\s*:\s*\d+|shoot from|close range|foreground perspective|framing)\b/i.test(clause)) return "film";
  if (/\b(?:seamless|studio floor|negative space|backdrop|behind (?:her|him)|shelves|books|candles|plant|side table|coffee cup|handbag|lounge chair|indoor|evening gathering)\b/i.test(clause)) return "background";
  if (/\b(?:full seated|inside the frame|full body|head to feet)\b/i.test(clause)) return "subject";
  return null;
}

/** Prose with no kerangka headings, sorted into the eight blocks. Null when it is one note, or it already has headings. */
export function arrangeLooseKerangka(raw: string): Record<string, string> | null {
  if (/\[[^\]]{3,80}\]/.test(raw || "")) return null;
  const text = dropLooseIdentity(scrubOutside(raw || ""));
  if (text.length < 80) return null;
  const buckets: Record<string, string[]> = {};
  const push = (id: string, phrase: string) => {
    const clean = tidyLoose(phrase);
    if (clean.length < 3) return;
    const list = buckets[id] || (buckets[id] = []);
    if (list.some((item) => item.toLowerCase() === clean.toLowerCase())) return;
    list.push(clean);
  };
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 2);
  for (const sentence of sentences) {
    let rest = sentence.replace(/[.]+$/g, "").trim();
    const take = (id: LooseId, re: RegExp) => {
      const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
      rest = rest.replace(global, (hit) => {
        push(id, hit);
        return " ";
      });
    };
    take("light", /\bminimal\s+high-key\b|\bhigh-key\b|\blow-key\b/i);
    take("light", /\bwarm\b[^.]{0,40}?\broom light\b[^.]*/i);
    take("film", /\bfashion editorial photograph\b|\b\d+\s*:\s*\d+\s*portrait format\b|\bportrait format\b|\b\d+\s*mm\b/i);
    take("film", /\bphotorealistic\b/i);
    take("film", /\bvertical\s+\d+\s*:\s*\d+\b/i);
    take("film", /\bfashion portrait\b/i);
    take("film", /\bshoot from\b[^.]*/i);
    take("film", /\bframing slightly tilted\b/i);
    take("subject", /\bfull seated figure\b|\bkeep every fingertip and shoe tip inside the frame\b/i);
    take("background", /\bgenerous negative space above her head\b|\bseamless white studio floor\b/i);
    take("background", /\bbehind (?:her|him) (?:are|is)\b[^.]*/i);
    take("background", /\b(?:black leather )?lounge chair\b/i);
    take("background", /\bindoor\b/i);
    take("background", /\bevening gathering\b/i);
    take("texture", /\b(?:preserve\s+)?natural waist wrinkles and broad reflections across the patent or latex-like surface\b/i);
    take("texture", /\bpreserving natural skin texture and (?:subtle )?reflections?\b[^.]*/i);
    take("texture", /\bhair and fabric naturally imperfect\b/i);
    rest = tidyLoose(rest);
    if (rest.length < 8) continue;
    const owner = looseOwner(rest);
    if (owner) push(owner, rest);
  }
  if (buckets.subject?.some((part) => /full seated|shoe tip|full body|head to feet/i.test(part))) {
    const extra = buckets.subject.filter((part) => !/^full seated figure$/i.test(part));
    buckets.subject = ["Full body plate, head to feet, shoes in frame.", ...extra];
  }
  const blocks: Record<string, string> = {};
  for (const [id, parts] of Object.entries(buckets)) {
    const joined = clipOutside(parts.join(". "));
    if (!joined) continue;
    blocks[id] = /[.!?]$/.test(joined) ? joined : `${joined}.`;
  }
  const filled = ["pose", "outfit", "hair", "light", "texture", "film", "background"].filter((id) => blocks[id]).length;
  if (filled < 3) return null;
  return blocks;
}

export type LearnedOption = PresetOption & { categoryId: string; learned?: boolean; singleBlock?: boolean };

const PRESET_CAT_IDS = ["subject", "pose", "outfit", "hair", "light", "texture", "film", "background", "adult"] as const;
export type PresetCatId = (typeof PRESET_CAT_IDS)[number];

export function canonicalPresetCategory(id: string): PresetCatId | undefined {
  const mapped = LEGACY_CATEGORY[id] || id;
  return (PRESET_CAT_IDS as readonly string[]).includes(mapped) ? (mapped as PresetCatId) : undefined;
}

const JUNK_LABELS = new Set([
  "theme",
  "title",
  "subject",
  "subject description",
  "generated look",
  "style",
  "scene",
  "background",
  "identity lock",
  "outfit",
  "pose",
  "body",
  "clothing",
  "clothes",
  "person",
  "expression",
  "base prompt",
]);

function normPromptHead(s: string, n = 90) {
  return s
    .toLowerCase()
    .replace(/#{1,6}\s*\[[^\]]+\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, n);
}

function stripLabelChrome(label: string) {
  return label
    .replace(/^#{1,6}\s*/, "")
    .replace(/[\[\]*_`]/g, "")
    .replace(/[:：,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isJunkPresetLabel(label: string): boolean {
  const t = stripLabelChrome(label);
  if (t.length < 2) return true;
  if (JUNK_LABELS.has(t.toLowerCase())) return true;
  if (/^(use the |create |keep the |train,? |change the |a young |sitting on |pose |portrait,? )/i.test(t)) return true;
  if (/^\d[\d\s:x×/.]*$/.test(t)) return true;
  if (/^(v?\s*)?\d+\s*[\s:x×]\s*\d+/i.test(t)) return true;
  if (/^(9 16|3 4|2 3|4 5|v 9)/i.test(t)) return true;
  if (/^(ultra-?realistic|photorealistic|photoreal |hyper-realistic|unretouched|aspect ratio)/i.test(t)) return true;
  if (/adult east asian fashion girl/i.test(t)) return true;
  if (/ccd flash filter/i.test(t)) return true;
  if (/^g-[0-9a-f]{4,}/i.test(t)) return true;
  if (/^look$/i.test(t)) return true;
  if (/^(she |no |among |leaving |exactly |paired )/i.test(t)) return true;
  if (t.includes(",") && t.split(/\s+/).length > 3) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words.every((w) => w.length <= 2)) return true;
  if (t.length > 32) return true;
  if ((t.match(/[\u4e00-\u9fff]/g) || []).length >= 4) return true;
  return false;
}

function extractNamedTitle(prompt: string): string | null {
  const m = prompt.match(/(?:^|\n)\s*(?:TITLE|Theme|Subject)\s*[:：]\s*([^\n]+)/i);
  if (!m?.[1]) return null;
  let t = m[1].replace(/[<>]/g, "").replace(/^Base prompt\s*/i, "").trim();
  if (!t || JUNK_LABELS.has(t.toLowerCase())) return null;
  return t;
}

function extractOutfitHint(prompt: string): string | null {
  const fashion = prompt.match(/Adult East Asian fashion girl,\s*([^,]{4,48})/i);
  if (fashion?.[1]) return fashion[1];
  const wear = prompt.match(
    /\b(?:wears?|wearing|outfit is|clothing is|she wears|dressed in)\s+([^.\n]{8,72})/i,
  );
  if (wear?.[1]) return wear[1].replace(/\bwith\b[\s\S]*$/i, "").trim();
  const garment = prompt.match(
    /\b((?:black|white|navy|silk|sheer|tiny|open|fitted|oversized|cobalt|cream|raspberry|grass|lavender|beige|ivory|sequined|satin)[\w\s-]{0,24}(?:dress|skirt|blazer|robe|bikini|bodysuit|coat|shirt|top|shorts|lingerie|heels|camisole|slip))\b/i,
  );
  if (garment?.[1]) return garment[1];
  return null;
}

function firstMeaningfulLine(prompt: string): string {
  const named = extractNamedTitle(prompt);
  if (named) return named;
  const outfit = extractOutfitHint(prompt);
  if (outfit) return outfit;
  for (const raw of prompt.split(/\n+/)) {
    let line = raw.replace(/\*\*/g, "").trim();
    if (!line) continue;
    line = line.replace(/^#{1,6}\s*/, "").replace(/^\[[^\]]+\]\s*/, "").trim();
    if (/^(TITLE|Theme|Subject|Subject Description|IDENTITY LOCK|STYLE|OUTFIT|SCENE|POSE|BODY|CLOTHING|Clothes)\s*[:：]/i.test(line)) {
      const rest = line.replace(/^[^:：]+[:：]\s*/, "").replace(/[<>]/g, "").trim();
      if (rest && !isJunkPresetLabel(rest)) return rest;
      continue;
    }
    if (/^(use the uploaded|keep the exact|create an authentic|identity lock|none\.?$)/i.test(line)) continue;
    line = line.replace(/^(a |an |the )/i, "");
    line = line.replace(/^(ultra-realistic |hyper-realistic |photorealistic |unretouched )+/i, "");
    line = line.replace(/^\d+\s*[:x×]\s*\d+\s*(vertical[, ]*)?/i, "");
    if (isJunkPresetLabel(line) && line.length < 40) continue;
    return line.replace(/\s+/g, " ");
  }
  return prompt.replace(/\s+/g, " ").trim();
}

function titleCaseLabel(text: string, maxWords = 4, maxChars = 32): string {
  const words = text
    .replace(/[_/#]+/g, " ")
    .replace(/[^a-zA-Z0-9\u3040-\u30ff\u4e00-\u9fff ,'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .filter((w, i) => (i === 0 ? !/^(a|an|the)$/i.test(w) : true))
    .slice(0, maxWords);
  const stop = new Set(["a", "an", "the", "of", "with", "and", "or", "to", "in", "on", "for"]);
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (/[\u3040-\u30ff\u4e00-\u9fff]/.test(w)) {
      out.push(w);
      continue;
    }
    const lower = w.toLowerCase();
    if (i > 0 && stop.has(lower)) {
      out.push(lower);
      continue;
    }
    if (/^(b&w|ccd|ugc|hdr|sns|y2k|id)$/i.test(w)) {
      out.push(w.toUpperCase());
      continue;
    }
    out.push(w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  }
  while (out.length > 1 && stop.has(out[out.length - 1].toLowerCase())) out.pop();
  let s = out.join(" ");
  if (s.length > maxChars) {
    s = out.reduce((acc, w) => (!acc ? w : (acc + " " + w).length > maxChars ? acc : acc + " " + w), "");
  }
  return s;
}

export function derivePresetLabel(prompt: string, fallback = "Look"): string {
  if (/冷冻柜|freezer cabinet/i.test(prompt)) return "Supermarket freezer";
  if (/腰部/.test(prompt)) return "Waist-up portrait";
  if (/特写/.test(prompt)) return "Close-up portrait";
  if (/更衣室/.test(prompt) || /dressing room/i.test(prompt)) return "Dressing room";
  if (/lazy sunday/i.test(prompt)) return "Lazy Sunday sofa";
  const src = firstMeaningfulLine(prompt);
  const label = titleCaseLabel(src);
  if (label && !isJunkPresetLabel(label)) return label;
  const outfit = extractOutfitHint(prompt);
  if (outfit) {
    const fromOutfit = titleCaseLabel(outfit);
    if (fromOutfit && !isJunkPresetLabel(fromOutfit)) return fromOutfit;
  }
  return fallback;
}

export function presetBlurb(prompt: string, max = 72): string {
  const line = firstMeaningfulLine(prompt).replace(/\s+/g, " ").trim();
  if (!line) return "";
  if (line.length <= max) return line;
  const cut = line.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return `${sp > 36 ? cut.slice(0, sp) : cut}…`;
}

export function isAdultPresetPrompt(prompt: string): boolean {
  return /\b(completely nude|nude adult|nude woman|lingerie|lace bodysuit|sheer slip|nsfw|areola|nipple|thong|g-string|open robe|bare torso|uncensored|boudoir)\b/i.test(
    prompt,
  );
}

export function inferPresetCategory(prompt: string): PresetCatId {
  const t = prompt.toLowerCase();
  if (isAdultPresetPrompt(prompt)) return "adult";
  if (/\b(dress|robe|haori|kimono|jacket|coat|outfit|wardrobe|skirt|blouse|heels|bodysuit|tee|sweater|sneakers|bikini)\b/.test(t)) {
    return "outfit";
  }
  if (/\b(bangs|ponytail|half-up|wet-look|makeup|lipstick|nail polish)\b/.test(t)) return "hair";
  if (/\b(engawa|beach|garden|forest|mountain|park|street|alley|rooftop|apartment|cafe|hotel|kitchen|bathroom|bedroom|subway|skyline)\b/.test(t)) {
    return "background";
  }
  if (/\b(golden hour|blue hour|overcast|tungsten|ring light|rim light|beauty dish|on-camera flash|window light)\b/.test(t)) {
    return "light";
  }
  if (/\b(sitting|seated|standing|leaning|mid-stride|hands on hips|smile|gaze)\b/.test(t)) return "pose";
  if (/\b(iphone|leica|hasselblad|fujifilm|contax|polaroid|sony a7|canon eos|disposable|low angle|high angle|over-shoulder|35mm|50mm|85mm)\b/.test(t)) {
    return "film";
  }
  if (/\b(headshot|full body|three-quarter|close-up|chest-up|waist-up)\b/.test(t)) return "subject";
  if (/\b(photoreal|grain|palette|matte|gloss|editorial|filmic)\b/.test(t)) return "texture";
  return "outfit";
}

export function catalogPresetPreview(categoryId: string, optionId: string): string {
  return `/api/media/presets/${categoryId}-${optionId}.png`;
}

/** Rewrite overlay junk (Theme / Title / Subject Description) into a short chip. */
export function tidyLearnedPreset(item: LearnedOption): LearnedOption | null {
  const prompt = (item.prompt || "").trim();
  if (prompt.length < 24) return null;
  let label = stripLabelChrome(item.label || "");
  if (isJunkPresetLabel(label)) label = derivePresetLabel(prompt);
  if (isJunkPresetLabel(label) || label.length < 2) label = derivePresetLabel(prompt);
  if (isJunkPresetLabel(label) || label.length < 2) return null;

  let categoryId: string = item.categoryId === "looks" ? "outfit" : item.categoryId;
  if (item.categoryId === "camera") {
    const owner = PRESET_CATEGORIES.find((c) => c.options.some((o) => o.id === item.id));
    categoryId =
      owner?.id ||
      (/\b(low angle|high angle|over-shoulder|over shoulder)\b/i.test(prompt) ? "film" : "subject");
  } else {
    categoryId = canonicalPresetCategory(categoryId) || categoryId;
  }
  if (!PRESET_CAT_IDS.includes(categoryId as PresetCatId)) {
    categoryId = inferPresetCategory(prompt);
  }
  if (categoryId === "adult" && !isAdultPresetPrompt(prompt)) {
    categoryId = inferPresetCategory(prompt);
    if (categoryId === "adult") categoryId = "outfit";
  }

  const preview = item.preview?.trim() || undefined;
  return {
    ...item,
    categoryId,
    label,
    prompt,
    preview: preview || (item.id.startsWith("g-") ? undefined : catalogPresetPreview(categoryId, item.id)),
  };
}

export function mergePresetOverlay(extra: LearnedOption[]): PresetCategory[] {
  const cats = PRESET_CATEGORIES.map((c) => ({ ...c, options: [...c.options] }));
  for (const raw of extra) {
    const item = tidyLearnedPreset(raw);
    if (!item) continue;
    if (item.singleBlock) {
      if (/\[(?:subject|pose|character outfit|lighting|background|film)/i.test(item.prompt)) continue;
      if (/FACE \+ HAIR lock|Image 1\s*\/\s*<image1>/i.test(item.prompt)) continue;
    } else if (isWholeScenePreset(item.prompt)) continue;
    if (!item.singleBlock && fitsBlock("film", item.prompt) && /\b(cam|phone|lens|format)\b/i.test(item.label)) item.categoryId = "film";
    if (!item.singleBlock && fitsBlock("background", item.prompt) && /\b(room|car|library|bar|pier|path|asphalt|elevator|cobble|alley)\b/i.test(item.label)) {
      item.categoryId = "background";
    }
    if (!item.singleBlock && !fitsBlock(item.categoryId as PresetCatId, item.prompt)) {
      const alt = inferPresetCategory(item.prompt);
      if (!fitsBlock(alt, item.prompt)) continue;
      item.categoryId = alt;
    }
    const cat = cats.find((c) => c.id === item.categoryId);
    if (!cat) continue;
    const labelKey = item.label.toLowerCase();
    if (cat.options.some((o) => o.id === item.id || o.label.toLowerCase() === labelKey)) continue;
    if (cat.options.some((o) => normPromptHead(o.prompt, 220) === normPromptHead(item.prompt, 220))) continue;
    cat.options.push({
      id: item.id,
      label: item.label,
      prompt: item.prompt,
      negative: item.negative,
      preview: item.preview || catalogPresetPreview(cat.id, item.id),
      learned: true,
    });
  }
  return cats;
}

function fitsBlock(id: PresetCatId, prompt: string): boolean {
  const t = prompt.toLowerCase();
  if (id === "subject") return /\b(headshot|close-up|chest-up|waist-up|full body|three-quarter|3\/4)\b/.test(t);
  if (id === "pose") return /\b(standing|seated|sitting|leaning|walking|hands|knee|smile|gaze)\b/.test(t);
  if (id === "outfit") {
    return /\b(dress|skirt|blazer|coat|shirt|tee|top|slip|trench|linen|cashmere|bikini|bodysuit|heels|sneakers|jacket|robe|shorts|polo|camisole)\b/.test(t);
  }
  if (id === "hair") return /\b(bangs|ponytail|hair|makeup|lipstick|nails)\b/.test(t);
  if (id === "light") {
    return /\b(light|flash|sun|window|rim|overcast|tungsten|neon|fog|golden|noon|shaft)\b/.test(t) && !/\b(bikini|dress|skirt|blazer)\b/.test(t);
  }
  if (id === "texture") return /\b(grain|pores|weave|matte|gloss|contrast|palette|halation|texture)\b/.test(t);
  if (id === "film") {
    return /\b(\d+\s*mm|iphone|leica|lens|bokeh|snapshot|camera|rangefinder)\b/.test(t) && !/\b(bikini|dress|skirt)\b/.test(t);
  }
  if (id === "background") {
    return /\b(room|street|cafe|hotel|beach|library|elevator|bar|pier|alley|bedroom|store|platform|rooftop|cobble|kitchen|bath|path|highway|asphalt|interior|train)\b/.test(t);
  }
  if (id === "adult") return isAdultPresetPrompt(prompt);
  return false;
}

const BLOCK_PLACEHOLDER = /^(plate not chosen|pose and expression not set|outfit not set|no extra styling|light not set|texture not set|lens and angle not set|place not set)\b/i;

function cleanBlockLabel(label: string) {
  return label.replace(/[,:;.\s]+$/g, "").replace(/\s+/g, " ").trim();
}

function kerangkaBlockLabel(text: string, categoryId: PresetCatId): string | null {
  const derived = cleanBlockLabel(derivePresetLabel(text, ""));
  if (derived && derived !== "Look" && !isJunkPresetLabel(derived)) return derived;
  const skip = new Set(["with", "from", "this", "that", "her", "his", "the", "and", "for", "into", "onto", "over", "same", "length", "color", "only", "styling", "image", "visible", "omit", "she", "not", "cut", "leave", "keep"]);
  const words = text
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !skip.has(word.toLowerCase()))
    .slice(0, 4);
  const guess = cleanBlockLabel(titleCaseLabel(words.join(" ")));
  if (guess && !isJunkPresetLabel(guess)) return guess;
  const fallback: Record<PresetCatId, string> = {
    subject: "Crop Plate",
    pose: "Body Pose",
    outfit: "Worn Outfit",
    hair: "Hair Styling",
    light: "Light Direction",
    texture: "Color Mood",
    film: "Lens Angle",
    background: "Set Place",
    adult: "Adult Outfit",
  };
  return fallback[categoryId];
}

/** One chip per kerangka heading. Null when the text is not that shape. A Shot bundle is not passed here. */
export function kerangkaBlockPresets(raw: string): { categoryId: PresetCatId; prompt: string; label: string }[] | null {
  const blocks = parseExternalKerangka(raw);
  if (!blocks) return null;
  const out: { categoryId: PresetCatId; prompt: string; label: string }[] = [];
  for (const [id, value] of Object.entries(blocks)) {
    const prompt = value.trim();
    if (prompt.length < 24 || BLOCK_PLACEHOLDER.test(prompt)) continue;
    const categoryId: PresetCatId = id === "outfit" && isAdultPresetPrompt(prompt) ? "adult" : (id as PresetCatId);
    if (!PRESET_CAT_IDS.includes(categoryId)) continue;
    const label = kerangkaBlockLabel(prompt, categoryId);
    if (!label) continue;
    out.push({ categoryId, prompt, label });
  }
  return out.length ? out : null;
}

/** A saved chip that is a whole photoshoot, not one block. Hidden from the picker. */
export function isWholeScenePreset(prompt: string): boolean {
  const text = (prompt || "").trim();
  if (text.length > 180) return true;
  if (/\[(?:subject|pose|character outfit|lighting|background|film)/i.test(text)) return true;
  if (/FACE \+ HAIR lock|Image 1\s*\/\s*<image1>/i.test(text)) return true;
  return false;
}

function blockText(value: string | undefined, fallback: string): string {
  const text = (value || "").replace(/^g-[0-9a-f]{4,}\b\s*/i, "").trim();
  if (!text || /^g-[0-9a-f]{4,}$/i.test(text)) return fallback;
  return text;
}

const OPEN_BLOCK: Record<string, string> = {
  subject: "Plate not chosen. Use a natural crop of this person.",
  pose: "Pose and expression not set. A natural stance. Expression follows the moment.",
  outfit: "Outfit not set. Do not copy the clothes from the plates.",
  hair: "No extra styling. Leave the hair, makeup, and nails as the plates.",
  light: "Light not set. One soft motivated source. Do not mix noon and night.",
  texture: "Texture not set. Real skin and cloth, neutral color.",
  film: "Lens and angle not set. Eye-level, natural perspective.",
  background: "Place not set. Do not invent a busy set or extra people.",
};

/** One short avoid for every preset compile. Chip negatives are not copied in. */
const PRESET_AVOID =
  "extra people, extra limbs, extra fingers, copied studio clothes, copied studio backdrop, cutout edge, pasted subject, flat studio light on a location, readable lettering, watermark";

const ADULT_AVOID = "child, underage, school uniform, censored bars, mosaic censor";

const DENSE_LIMIT = 340;

function tidyFragment(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .replace(/([,;])(?:\s*[,;])+/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/^[,;\s]+|[,;\s]+$/g, "")
    .trim();
}

function asSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  const cased = /^[a-z]/.test(trimmed) ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : trimmed;
  return /[.!?]$/.test(cased) ? cased : `${cased}.`;
}

const DENSIFY_TAILS = [
  "One person, this crop. In the place, not pasted on. The plate's studio clothes and studio backdrop stay out. Keep this person's face and body.",
  "Hands, weight, and the face stay this one moment. The body is in the place, not a cutout in front of it.",
  "Cloth shows weave and folds. Shoes and bag hardware, when named, are real objects. The plate's clothes are gone. The light from the lighting block falls on the fabric and the skin together.",
  "Styling, makeup, and nails only.",
  "Strands sit in the air of this room. Makeup sits on the plate's skin, pores still visible. This does not change length or color.",
  "Only this light, one time of day. It falls on the face, the clothes, the bag, and the set together.",
  "Color and material only. Skin tone stays the plate. No lens and no second light.",
  "Lens and camera angle only. Grain, if any, sits in the whole frame. No shutter speed, no ISO, no second camera.",
  "This person is on that floor, in that air, with those objects around them. No extra people. No second camera. No readable lettering.",
  "Styling only, same length and color, not a cut.",
];

/** Compiler lines and another character's lock dump are not part of the scene. */
function stripCompileEcho(raw: string): string {
  let text = raw;
  for (const tail of DENSIFY_TAILS) {
    text = text.split(tail).join(" ");
  }
  text = text.replace(/\bAvoid:\s*.*/gi, " ");
  text = text.replace(/\bUse this character only\.?/gi, " ");
  text = text.replace(/\b(?:Face|Hair|Body and skin) stays? the plate\s*\([^)]*\)\.?/gi, " ");
  text = text.replace(/\bnaturally full adult figure\b[^.]{0,140}/gi, " ");
  text = text.replace(/\bnever a(?:\s+the character's hair on the plate\b[^.!]*)/gi, " ");
  text = text.replace(/(?:\bthe character's hair on the plate\b(?:\s*,|\s+or)?\s*)+/gi, " ");
  text = text.replace(/,?\s*makeup on this face and giving\b/gi, ", giving");
  return text;
}

/** Drop lens and exposure leaks that belong only in the film block. Texture cannot invent a second sun. */
function stripOffBlock(id: string, raw: string): string {
  let text = stripCompileEcho(raw).replace(/\s+/g, " ").replace(/\blarge[-\s]?aperture\b/gi, " ").trim();
  if (id === "texture") {
    text = text.replace(/north-facing window as key/gi, "color on skin and cloth");
    text = text.replace(/raking daylight/gi, "soft falloff");
    text = text.replace(/\bdaylight\b/gi, "the room light");
    text = text.replace(/\bas key\b/gi, "");
    text = text.replace(/\bright in front of the lens\b/gi, "in the frame");
    text = text.replace(
      /\b(?:the\s+)?(?:person's|her|subject's)\s+smooth skin\b|\bsmooth skin\b/gi,
      "the plate's skin, pores still visible",
    );
  }
  if (id === "background") {
    text = text.replace(/dust in window shafts/gi, "dust in the air");
    text = text.replace(/\bdaylight\b/gi, "the room light");
  }
  if (id === "film") {
    text = text.replace(/\bf\/\s*\d+(?:\.\d+)?\b/gi, " ");
    text = text.replace(/\b(?:shutter(?:\s+speed)?|iso|f-stop|f stop|aperture)\b/gi, " ");
    text = text.replace(
      /\bat\s*,?\s*\d{2,5}\s*,?\s*and\s+a\s+of\s+\d+\s*\/\s*\d+\s*(?:second|sec|s)?/gi,
      " ",
    );
    text = text.replace(/\b\d+\s*\/\s*\d{2,5}\s*(?:second|sec|s)?\b/gi, " ");
    text = text.replace(
      /\bthe ultra-wide lens creates\b[^.]*\./gi,
      "Natural perspective. The face stays Image 1. Hands and paws keep separate digits, not a fused mitt.",
    );
    text = text.replace(/\b\d{2}\s*mm\s+ultra-wide-angle lens\b/gi, "phone selfie lens");
  } else {
    text = text.replace(/\b\d{2,3}\s*mm\b/gi, " ");
    text = text.replace(/\bf\/\s*\d+(?:\.\d+)?\b/gi, " ");
    text = text.replace(/\b(?:shutter(?:\s+speed)?|iso|f-stop|f stop|aperture)\b/gi, " ");
    text = text.replace(/\benvironmental portrait\b/gi, " ");
  }
  return tidyFragment(text);
}

function withBlockGuard(id: string, text: string): string {
  if (!text) return text;
  if (id === "pose" && /\b(monkey|ape|paw)\b/i.test(text) && !/separate digits/i.test(text)) {
    return `${text} The animal's paws show separate digits. No fused mitt and no extra fingers.`;
  }
  return text;
}

/** Turn a one-line chip into a paragraph that puts the person in the room. Long essays stay as written. */
function densifyBlock(id: string, raw: string, filled: boolean): string {
  const text = asSentence(stripOffBlock(id, raw));
  if (!filled || text.length > DENSE_LIMIT) return withBlockGuard(id, text);
  let dense = text;
  switch (id) {
    case "subject":
      dense = `${text} One person, this crop. In the place, not pasted on. The plate's studio clothes and studio backdrop stay out. Keep this person's face and body.`;
      break;
    case "pose":
      dense = `${text} Hands, weight, and the face stay this one moment. The body is in the place, not a cutout in front of it.`;
      break;
    case "outfit":
      dense = `${text} Cloth shows weave and folds. Shoes and bag hardware, when named, are real objects. The plate's clothes are gone. The light from the lighting block falls on the fabric and the skin together.`;
      break;
    case "hair":
      dense = `Styling, makeup, and nails only. ${text} Strands sit in the air of this room. Makeup sits on the plate's skin, pores still visible. This does not change length or color.`;
      break;
    case "light":
      dense = `${text} Only this light, one time of day. It falls on the face, the clothes, the bag, and the set together.`;
      break;
    case "texture":
      dense = `${text} Color and material only. Skin tone stays the plate. No lens and no second light.`;
      break;
    case "film":
      dense = `${text} Lens and camera angle only. Grain, if any, sits in the whole frame. No shutter speed, no ISO, no second camera.`;
      break;
    case "background":
      dense = `${text} This person is on that floor, in that air, with those objects around them. No extra people. No second camera. No readable lettering.`;
      break;
    default:
      dense = text;
  }
  return withBlockGuard(id, dense);
}

/** A missing crop, or the old "Plate not chosen" line, is not a real plate. */
function subjectUnset(text: string | undefined): boolean {
  const t = (text || "").trim();
  return !t || /^plate not chosen\b/i.test(t);
}

/** Crop words in pose or film pick the plate when Subject was left open. */
function inferCropSubject(cropSource: string): string | null {
  if (/\b(close-up|bust|headshot|chest-up)\b/i.test(cropSource)) {
    return "Headshot plate, medium close-up, head through the chest, vertical frame.";
  }
  if (/\bfull[- ]body|head to feet\b/i.test(cropSource)) {
    return "Full body plate, head to feet, shoes in frame, a little space above the head.";
  }
  if (/\bknee[-\s]?up\b|\bknee raised\b|\braised knee\b|\bknee[-\s]?shot\b|\bdown to the knees\b/i.test(cropSource)) {
    return "3/4 plate, knee-up, head to the knees, feet out of frame. Image 2 is the full-body plate. Copy its waist, hip, and thigh width. Do not slim or lengthen the legs.";
  }
  if (/\bwaist-up|waist to the knees\b/i.test(cropSource)) {
    return "3/4 plate, waist-up, head to the waist, feet out of frame.";
  }
  if (/\bmedium[-\s]?shot\b/i.test(cropSource)) {
    return "3/4 plate, waist-up, head to the waist, feet out of frame.";
  }
  if (/\b(sits|sitting|seated)\b/i.test(cropSource)) {
    return "3/4 plate, knee-up, head to the knees, feet out of frame. Image 2 is the full-body plate. Copy its waist, hip, and thigh width. Do not slim or lengthen the legs.";
  }
  return null;
}

/** Loose chips, one per kerangka block. Always eight headings. Density is added here, not stored on the chip. Adult stays inside the outfit block. */
export function compilePresetKerangka(blocks: Record<string, string>, hair: string): string {
  const poseText = (blocks.pose || "").replace(/\baccentuate the leg line\b/gi, "keep the body plate's leg width");
  const filmText = blocks.film || "";
  let subjectText = (blocks.subject || "").trim();
  if (subjectUnset(subjectText)) {
    subjectText = inferCropSubject(`${poseText} ${filmText}`) || "";
  }
  const subjectFilled = Boolean(subjectText) && !subjectUnset(subjectText);
  const locked = hair.trim();
  const length = locked
    ? `Same hair length and shape as this character (${locked}). Do not cut it shorter or grow it longer. Do not recolor it.`
    : "Same hair length and shape as the character plates. Do not cut it shorter or grow it longer. Do not recolor it.";
  const outfitFilled = Boolean((blocks.outfit || "").trim());
  const outfitCore = densifyBlock("outfit", blockText(blocks.outfit, OPEN_BLOCK.outfit), outfitFilled);
  const adult = stripOffBlock("outfit", blockText(blocks.adult, ""));
  const outfit = [outfitFilled ? outfitCore : "", adult ? `Adult 18+: ${adult}` : "", !outfitFilled && !adult ? outfitCore : ""]
    .filter(Boolean)
    .join("\n");
  const hairFilled = Boolean((blocks.hair || "").trim());
  const hairBlock = hairFilled ? densifyBlock("hair", blockText(blocks.hair, ""), true) : OPEN_BLOCK.hair;
  const faceKeep = subjectFilled
    ? "Eyes, nose, jaw, mouth, freckles, and skin stay Image 1. A smile or a wide lens does not replace that face. Lip color is makeup on this mouth."
    : "Image 1 is this face. Eyes, nose, jaw, mouth, freckles, and skin stay Image 1. A smile, a head turn, or a wide lens does not replace that face. Lip color is makeup on this mouth.";
  const subject = [
    densifyBlock("subject", blockText(subjectText, OPEN_BLOCK.subject), subjectFilled),
    length,
    "Skin tone stays the plate.",
    faceKeep,
    "If the pose turns or tilts the head, do that turn. Do not leave the face stuck on the headshot's straight-on angle.",
  ]
    .filter(Boolean)
    .join(" ");
  const avoid = adult ? `${PRESET_AVOID}, ${ADULT_AVOID}` : PRESET_AVOID;
  return [
    `[SUBJECT]\n${subject}`,
    `[Subject's Pose and Expression]\n${densifyBlock("pose", blockText(poseText, OPEN_BLOCK.pose), Boolean(poseText.trim()))}`,
    `[Character Outfit and Bag/Accessories]\n${outfit}`,
    `[Character Hairstyle and Makeup Details]\n${hairBlock}`,
    `[Lighting and Light Direction]\n${densifyBlock("light", blockText(blocks.light, OPEN_BLOCK.light), Boolean((blocks.light || "").trim()))}`,
    `[Texture and Color Mood]\n${densifyBlock("texture", blockText(blocks.texture, OPEN_BLOCK.texture), Boolean((blocks.texture || "").trim()))}`,
    `[Film, Camera Lens Depth, and Angle]\n${densifyBlock("film", blockText(blocks.film, OPEN_BLOCK.film), Boolean((blocks.film || "").trim()))}`,
    `[Background and Spatial Elements]\n${densifyBlock("background", blockText(blocks.background, OPEN_BLOCK.background), Boolean((blocks.background || "").trim()))}`,
    `Avoid: ${avoid}`,
  ].join("\n\n");
}

export function readPresetBlocks(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string" && value.trim() && (PRESET_CAT_IDS as readonly string[]).includes(key)) {
      out[key] = value.trim();
    }
  }
  return out;
}
