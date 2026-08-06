/**
 * Economy v3 roots feature flag.
 *
 * When false (default), production Economy v2 is unchanged and GET /game/state
 * does not expose `game.v3Roots`.
 */
export function isEconomyV3RootsEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.ENABLE_ECONOMY_V3_ROOTS === "true";
}
