/** Debug HTTP routes exist only when this is exactly "true". */
export function areDebugRoutesEnabled(): boolean {
  return process.env.ENABLE_DEBUG_ROUTES === "true";
}
