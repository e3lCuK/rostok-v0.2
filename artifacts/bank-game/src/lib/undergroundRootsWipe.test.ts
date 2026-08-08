import { describe, expect, it } from "vitest";
import {
  UNDERGROUND_ROOTS_WIPE_MS,
  UNDERGROUND_ROOTS_WIPE_TRANSITION,
  undergroundRootsWipeAnimate,
  undergroundWrapRootsWipeAnimate,
} from "./undergroundRootsWipe";

describe("undergroundRootsWipe", () => {
  it("uses a 2s Framer transition", () => {
    expect(UNDERGROUND_ROOTS_WIPE_MS).toBe(2000);
    expect(UNDERGROUND_ROOTS_WIPE_TRANSITION.duration).toBe(2);
  });

  it("wipes from bottom via clip-path inset; unmasked does not clip overflow", () => {
    expect(undergroundRootsWipeAnimate(false)).toEqual({
      opacity: 1,
      clipPath: "none",
    });
    expect(undergroundRootsWipeAnimate(true)).toEqual({
      opacity: 0,
      clipPath: "inset(0% 0% 100% 0%)",
    });
  });

  it("wrap roots wipe with opacity only (keeps stump collar overflow)", () => {
    expect(undergroundWrapRootsWipeAnimate(false)).toEqual({
      opacity: 1,
      clipPath: "none",
    });
    expect(undergroundWrapRootsWipeAnimate(true)).toEqual({
      opacity: 0,
      clipPath: "none",
    });
  });
});
