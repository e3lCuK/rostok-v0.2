/// <reference types="vite/client" />

/** Short git SHA baked in at Vite build/dev start (`git rev-parse --short HEAD`). */
declare const __APP_GIT_SHA__: string;
/** `git rev-list --count HEAD` at Vite build/dev start. */
declare const __APP_GIT_PUSH_COUNT__: number;

declare module "*.png" {
  const src: string;
  export default src;
}

declare module "*.svg" {
  const src: string;
  export default src;
}
