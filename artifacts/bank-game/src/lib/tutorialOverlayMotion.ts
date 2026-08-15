/** Shared fade/rise for every tutorial hint card (welcome, steps, rewards). */

export const TUTORIAL_OVERLAY_FADE_S = 0.36;

export const TUTORIAL_OVERLAY_TRANSITION = {
  duration: TUTORIAL_OVERLAY_FADE_S,
  ease: [0.22, 1, 0.36, 1] as const,
};

export const TUTORIAL_OVERLAY_INITIAL = { opacity: 0 };
export const TUTORIAL_OVERLAY_ANIMATE = { opacity: 1 };
export const TUTORIAL_OVERLAY_EXIT = { opacity: 0 };

export const TUTORIAL_CARD_TRANSITION = {
  duration: 0.42,
  ease: [0.22, 1, 0.36, 1] as const,
};

export const TUTORIAL_CARD_INITIAL = { opacity: 0, y: 14, scale: 0.94 };
export const TUTORIAL_CARD_ANIMATE = { opacity: 1, y: 0, scale: 1 };
export const TUTORIAL_CARD_EXIT = { opacity: 0, y: 8, scale: 0.97 };
