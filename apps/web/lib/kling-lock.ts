/** Always prepended. Image = identity. Video = motion only. */
export const KLING_IDENTITY_LOCK =
  "The person in the output is the locked identity from the reference IMAGE only: same face, same skin, same hair, same age, same body shape, same wardrobe. Do not change identity, do not beautify into a different person, do not age or restyle. Do not use the face, hair, skin, or identity of anyone in the reference VIDEO. The VIDEO is motion-only: copy body movement, gestures, timing, and expression from the video onto the image person. Photoreal.";

export type KlingOrientation = "image" | "video";

export function klingMotionPrompt(user: string) {
  const extra = user.trim();
  if (!extra) return KLING_IDENTITY_LOCK;
  return `${KLING_IDENTITY_LOCK} Additional operator notes (must not override identity): ${extra}`;
}
