/**
 * Debug hooks for economy v2 mock layer.
 * Used by local debug panels (src/local, src/debug) — not part of v1 gameplay.
 */

type ResetHandler = () => void;

let resetWebsHandler: ResetHandler | null = null;
let resetRootsHandler: ResetHandler | null = null;

export function registerV2MockResetWebs(handler: ResetHandler | null) {
  resetWebsHandler = handler;
}

export function triggerV2MockResetWebs() {
  resetWebsHandler?.();
}

export function registerV2MockResetRoots(handler: ResetHandler | null) {
  resetRootsHandler = handler;
}

export function triggerV2MockResetRoots() {
  resetRootsHandler?.();
}
