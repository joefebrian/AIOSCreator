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

export const PRESET_CATEGORIES: PresetCategory[] = [
  {
    id: "art-style",
    label: "Art style",
    wash: "bg-[#F7FEE7] text-[#3F6212]",
    negative: "cgi, cartoon, anime, illustration, plastic skin, glass skin, Instagram face, K-beauty retouch, Facetune, video game, 3d render, Unreal Engine, Octane",
    options: [
      { id: "photoreal", label: "Photoreal", prompt: "unretouched photoreal photograph of a real person, pores on nose and cheeks, peach fuzz, slight uneven skin tone, natural oil, flyaway hairs, real catchlights, not CGI, not airbrushed, not glass skin" },
      { id: "editorial", label: "Editorial", prompt: "editorial fashion photograph, 85mm, precise lighting, sharp fabric detail, magazine cover grade, real skin texture kept" },
      { id: "cinematic", label: "Cinematic", prompt: "cinematic still, anamorphic bokeh, motivated practicals, filmic contrast, shallow depth, unretouched face" },
      { id: "analog", label: "Analog film", prompt: "shot on 35mm portra-like film, fine grain, slight halation, imperfect exposure, real pores, no beauty retouch" },
      { id: "ugc-selfie", label: "UGC selfie", prompt: "front-camera phone selfie, slight wide-angle, casual framing, real bedroom or bathroom light, phone-camera skin, not beauty-app" },
      { id: "flash", label: "On-camera flash", prompt: "direct on-camera flash, hard shadow on wall, nightlife snapshot, slight overexposure on face, real texture under flash" },
      { id: "studio", label: "Studio beauty", prompt: "beauty dish + fill, dual catchlights, clean seamless, unretouched skin: pores and peach fuzz preserved, no Facetune" },
      { id: "lookbook", label: "Lookbook", prompt: "full-body fashion lookbook, even catalog light, straight stance, garment-first" },
      { id: "85mm", label: "85mm portrait", prompt: "85mm f/1.8 portrait, compressed background, eye-sharp, creamy falloff" },
      { id: "mirror-ugc", label: "Mirror UGC", prompt: "bathroom mirror phone photo, flash bounce, outfit check, candid" },
    ],
  },
  {
    id: "clothing",
    label: "Clothing",
    wash: "bg-[#F5F3FF] text-[#5B21B6]",
    negative: "wrong era costume, random extra layers, medieval armor, mascot suit",
    options: [
      { id: "street", label: "Streetwear", prompt: "oversized tee, baggy denim, sneakers, streetwear layering" },
      { id: "evening", label: "Evening", prompt: "going-out evening dress, heel, night fabric sheen" },
      { id: "lounge", label: "Lounge", prompt: "at-home loungewear, silk or lace, relaxed drape" },
      { id: "swim", label: "Swim", prompt: "swimwear, wet skin highlights, pool or beach" },
      { id: "office", label: "Office", prompt: "smart casual blazer, tailored trousers, office-ready" },
      { id: "athleisure", label: "Athleisure", prompt: "fitted sportswear, clean gym aesthetic" },
      { id: "knit", label: "Knit winter", prompt: "chunky knit sweater, winter layers, wool texture" },
      { id: "summer-dress", label: "Summer dress", prompt: "light summer dress, breeze in fabric, sun on skin" },
      { id: "blazer", label: "Oversized blazer", prompt: "oversized blazer, bare or tee underneath, fashion-week street" },
      { id: "denim", label: "Denim jacket", prompt: "classic denim jacket, worn-in texture, casual full-body" },
    ],
  },
  {
    id: "architecture",
    label: "Architecture",
    wash: "bg-[#FFF7ED] text-[#9A3412]",
    negative: "empty white void, outdoor wilderness, floating in space",
    options: [
      { id: "apartment", label: "Modern apartment", prompt: "modern apartment interior, warm lamps, city window" },
      { id: "hotel", label: "Hotel room", prompt: "hotel room, floor-to-ceiling city view, rumpled sheets" },
      { id: "cafe", label: "Cafe", prompt: "small cafe, wood tables, warm pendant lamps, window street" },
      { id: "loft", label: "Loft", prompt: "industrial loft, concrete, brick, large factory windows" },
      { id: "penthouse", label: "Penthouse", prompt: "penthouse glass wall, night skyline bokeh" },
      { id: "bathroom", label: "Marble bath", prompt: "marble bathroom, vanity lights, steamed mirror" },
      { id: "kitchen", label: "Kitchen", prompt: "open kitchen island, morning window light" },
      { id: "balcony", label: "Balcony", prompt: "narrow apartment balcony at dusk, city below" },
      { id: "conv-store", label: "Convenience store", prompt: "night convenience store aisle, fluorescent, snack shelves" },
      { id: "gym", label: "Gym", prompt: "modern gym, rubber floor, mirror wall, cool overhead" },
    ],
  },
  {
    id: "landscape",
    label: "Landscape",
    wash: "bg-[#ECFDF5] text-[#047857]",
    negative: "plain studio seamless, office cubicle, watermark",
    options: [
      { id: "city-night", label: "City night", prompt: "wet city street at night, neon signs, reflections on asphalt" },
      { id: "beach", label: "Beach", prompt: "beach waterline, late afternoon, salt on skin" },
      { id: "park", label: "Park", prompt: "city park path, trees, dappled sun" },
      { id: "rooftop", label: "Rooftop", prompt: "rooftop golden hour, skyline out of focus behind" },
      { id: "alley", label: "Alley", prompt: "narrow textured alley, one practical light" },
      { id: "bedroom", label: "Bedroom", prompt: "bedroom, rumpled sheets, curtain-filtered window" },
      { id: "living", label: "Living room", prompt: "lived-in living room, sofa, lamp, phone-photo casual" },
      { id: "seamless", label: "Studio seamless", prompt: "seamless paper backdrop, full-body catalog" },
      { id: "parking", label: "Parking garage", prompt: "concrete parking garage, fluorescent strips, car bokeh" },
      { id: "subway", label: "Subway", prompt: "subway platform, tiles, arriving-train light" },
    ],
  },
  {
    id: "weather",
    label: "Weather",
    wash: "bg-[#F5F3FF] text-[#6D28D9]",
    negative: "wrong time of day, mixed noon-and-night lighting, neon on a sunny beach",
    options: [
      { id: "golden", label: "Golden hour", prompt: "golden hour, warm rim light on hair, long shadows" },
      { id: "overcast", label: "Overcast", prompt: "open shade / overcast, soft wrap, no hard nose shadow" },
      { id: "rain", label: "Rainy day", prompt: "rain on glass, wet skin highlights, cool street reflections" },
      { id: "hot", label: "Hot summer", prompt: "hard summer sun, slight sweat sheen, squint, high contrast" },
      { id: "blue-hour", label: "Blue hour", prompt: "blue hour dusk, cool ambient, one warm practical" },
      { id: "neon-night", label: "Neon night", prompt: "neon practicals, magenta/cyan spill on skin" },
      { id: "morning", label: "Soft morning", prompt: "soft morning window, curtains, slow light on face" },
      { id: "noon", label: "Harsh noon", prompt: "harsh noon sun overhead, short hard shadows" },
      { id: "tungsten", label: "Tungsten indoor", prompt: "warm tungsten lamps, indoor night, orange practicals" },
      { id: "ring", label: "Ring light UGC", prompt: "ring-light catchlight, influencer UGC, slightly cool LED" },
    ],
  },
  {
    id: "adult",
    label: "Adult 18+",
    wash: "bg-[#111827] text-white",
    nsfw: true,
    negative:
      "child, underage, loli, shota, school uniform, fully zipped winter coat, extra limbs, extra fingers, censored bars, mosaic censor",
    options: [
      {
        id: "nude-studio",
        label: "Nude studio",
        prompt:
          "completely nude adult woman, no clothing, no shirt, no shorts, no bra, bare skin, standing in a plain photography studio with a seamless backdrop, soft window light, visible pores, natural breasts, uncensored, photoreal. Not a kitchen, not an apartment, not the identity-photo room.",
        negative: "clothes, bikini, bra, underwear, towel, robe",
        preview: "/api/media/presets/adult-nude-studio.png",
      },
      {
        id: "lingerie",
        label: "Lingerie",
        prompt: "adult woman in sheer black lingerie, studio beauty light, lace texture, uncensored, photoreal",
        negative: "streetwear, parka, fully dressed, school uniform",
        preview: "/api/media/presets/adult-lingerie.png",
      },
      {
        id: "boudoir",
        label: "Boudoir",
        prompt: "adult boudoir on rumpled sheets, low warm lamp, lingerie or nude, intimate, uncensored, photoreal",
        negative: "office, outdoor street, fully dressed coat",
        preview: "/api/media/presets/adult-boudoir.png",
      },
      {
        id: "sheer",
        label: "Sheer",
        prompt: "adult woman in a sheer slip, body visible through fabric, hotel lamp, uncensored, photoreal",
        negative: "opaque heavy coat, sweater, jeans",
        preview: "/api/media/presets/adult-sheer.png",
      },
      {
        id: "wet",
        label: "Wet skin",
        prompt: "adult woman, wet skin, water droplets, after shower or rain, uncensored, photoreal",
        negative: "dry matte makeup, desert dust, fully buttoned shirt",
        preview: "/api/media/presets/adult-wet.png",
      },
      {
        id: "towel",
        label: "Towel",
        prompt: "adult woman in a loose bath towel, bathroom steam, skin on shoulders and thighs, uncensored, photoreal",
        negative: "evening gown, sneakers, office",
        preview: "/api/media/presets/adult-towel.png",
      },
      {
        id: "open-robe",
        label: "Open robe",
        prompt: "adult woman, silk robe open, hotel room night, bare torso, uncensored, photoreal",
        negative: "zipped coat, turtleneck, classroom",
        preview: "/api/media/presets/adult-open-robe.png",
      },
      {
        id: "micro-bikini",
        label: "Micro bikini",
        prompt: "adult woman in a tiny bikini, pool or beach, wet skin, uncensored, photoreal",
        negative: "one-piece modest swim dress, parka, snow",
        preview: "/api/media/presets/adult-micro-bikini.png",
      },
      {
        id: "body-oil",
        label: "Body oil",
        prompt: "adult nude or nearly nude, skin oil sheen, studio rim light, muscle and skin detail, uncensored, photoreal",
        negative: "matte powder, heavy clothes, parka",
        preview: "/api/media/presets/adult-body-oil.png",
      },
      {
        id: "implied-sheet",
        label: "Sheet implied",
        prompt: "adult woman in bed, sheet low on hips, bare torso, morning window, uncensored, photoreal",
        negative: "fully made hotel turndown, suit, tie",
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

export function presetPrompt(categoryId: string, optionId: string): string | undefined {
  const cat = PRESET_CATEGORIES.find((c) => c.id === categoryId);
  return cat?.options.find((o) => o.id === optionId)?.prompt;
}

export function presetLabel(categoryId: string, optionId: string): string | undefined {
  const cat = PRESET_CATEGORIES.find((c) => c.id === categoryId);
  return cat?.options.find((o) => o.id === optionId)?.label;
}

export function presetNegative(categoryId: string, optionId: string): string {
  const cat = PRESET_CATEGORIES.find((c) => c.id === categoryId);
  const opt = cat?.options.find((o) => o.id === optionId);
  return [cat?.negative, opt?.negative].filter(Boolean).join(", ");
}

export function presetPreview(categoryId: string, optionId: string): string | undefined {
  const cat = PRESET_CATEGORIES.find((c) => c.id === categoryId);
  return cat?.options.find((o) => o.id === optionId)?.preview;
}

export type LearnedOption = PresetOption & { categoryId: string; learned?: boolean };

export function mergePresetOverlay(extra: LearnedOption[]): PresetCategory[] {
  const cats = PRESET_CATEGORIES.map((c) => ({ ...c, options: [...c.options] }));
  for (const item of extra) {
    const cat = cats.find((c) => c.id === item.categoryId);
    if (!cat) continue;
    if (cat.options.some((o) => o.id === item.id || o.label.toLowerCase() === item.label.toLowerCase())) continue;
    cat.options.push({
      id: item.id,
      label: item.label,
      prompt: item.prompt,
      negative: item.negative,
      preview: item.preview || `/api/media/presets/${item.categoryId}-${item.id}.png`,
      learned: true,
    });
  }
  return cats;
}
