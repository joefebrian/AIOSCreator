/** Always prepended. Image = identity. Video = motion only. */
export const KLING_IDENTITY_LOCK =
  "The person in the output is the locked identity from the reference IMAGE only: same face, same skin, same hair, same age, same body shape, same wardrobe. Do not change identity, do not beautify into a different person, do not age or restyle. Do not use the face, hair, skin, or identity of anyone in the reference VIDEO. The VIDEO is motion-only: copy body movement, gestures, timing, and expression from the video onto the image person. Photoreal.";

/** Kling 3.0 facial element is face-only. Wardrobe stays on the character still. */
export const KLING_FACE_ELEMENT_LOCK =
  "The face follows the bound facial element <<<element_1>>> only: same eyes, nose, lips, jaw, skin, and age. Wardrobe, hair, and body come from the reference image. Do not invent a new face. Do not use the face, hair, skin, or identity of anyone in the reference video. The video is motion only: copy body movement, gestures, timing, and expression onto this person. Photoreal.";

/** Locked still prompt for face plates used by Bind facial element. Not the general Generate prompt. */
export const BIND_FACE_STILL_PROMPT =
  "Same person as the locked still. Shoulders-up face photo only, one face, looking toward camera. Keep the exact eyes, nose, lips, jaw, skin, age, and hair. Unretouched photoreal. No full body, no new outfit, no new person, no text.";

export type KlingOrientation = "image" | "video";

export function klingMotionPrompt(user: string, faceElement = false) {
  const lock = faceElement ? KLING_FACE_ELEMENT_LOCK : KLING_IDENTITY_LOCK;
  const extra = user.trim();
  if (!extra) return lock;
  return `${lock} Additional operator notes (must not override identity): ${extra}`;
}
