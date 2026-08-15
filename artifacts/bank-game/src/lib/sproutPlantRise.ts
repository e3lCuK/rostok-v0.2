import { UNDERGROUND_ROOTS_WIPE_MS } from "./undergroundRootsWipe";

/** First-plant reveal: tree grows out of the soil, bottom → top. */

export const SPROUT_PLANT_RISE_MS = 720;

/** Hold on the grown tree before the underground wipe starts. */
export const SPROUT_PLANT_AFTER_TREE_MS = 2000;

/** Hold after roots finish, before the next tutorial card. */
export const SPROUT_PLANT_AFTER_ROOTS_MS = 1200;

/** When to unmask roots: tree rise + pause. */
export function sproutPlantRootsStartMs(): number {
  return SPROUT_PLANT_RISE_MS + SPROUT_PLANT_AFTER_TREE_MS;
}

/** When to show the next hint: roots start + wipe + pause. */
export function sproutPlantHintStartMs(): number {
  return (
    sproutPlantRootsStartMs() +
    UNDERGROUND_ROOTS_WIPE_MS +
    SPROUT_PLANT_AFTER_ROOTS_MS
  );
}

export const SPROUT_PLANT_RISE_TRANSITION = {
  duration: SPROUT_PLANT_RISE_MS / 1000,
  ease: [0.32, 0.72, 0.22, 1] as const,
};

/** Fully hidden under the grass line (clip from the bottom + slight bury). */
export const SPROUT_PLANT_RISE_HIDDEN = {
  clipPath: "inset(0% 0% 100% 0%)",
  y: 18,
};

/** Fully grown; keep inset(0) only while the rise is in flight. */
export const SPROUT_PLANT_RISE_VISIBLE = {
  clipPath: "inset(0% 0% 0% 0%)",
  y: 0,
};

/**
 * After the rise, drop clip-path so later tree bounce / glow is not cropped.
 * `inset(0%)` still clips overflow (same reason as underground roots wipe).
 */
export function sproutPlantRiseAnimate(rising: boolean) {
  return rising
    ? SPROUT_PLANT_RISE_VISIBLE
    : { clipPath: "none" as const, y: 0 };
}
