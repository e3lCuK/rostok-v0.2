/**
 * Debug HTTP routes are local/dev only.
 * - ENABLE_DEBUG_ROUTES=true  → always on
 * - ENABLE_DEBUG_ROUTES=false → always off
 * - unset → on when NODE_ENV !== "production"
 */
export function areDebugRoutesEnabled(): boolean {
  const flag = process.env.ENABLE_DEBUG_ROUTES;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.NODE_ENV !== "production";
}
