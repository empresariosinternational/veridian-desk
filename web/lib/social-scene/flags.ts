/**
 * Social Scene feature flag.
 * Set NEXT_PUBLIC_SOCIAL_SCENE=0 to hide nav + treat routes as preview-only.
 * Default: enabled (scaffold visible for demos and iteration).
 */
export function isSocialSceneEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_SOCIAL_SCENE;
  if (v === "0" || v === "false") return false;
  return true;
}
