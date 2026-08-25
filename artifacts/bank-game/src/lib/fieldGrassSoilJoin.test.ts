import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const here = __dirname;
const bgSrc = readFileSync(
  join(here, "../components/GameAreaBg.tsx"),
  "utf8",
);
const soilSrc = readFileSync(
  join(here, "../components/v2/UndergroundSoilArt.tsx"),
  "utf8",
);
const cssSrc = readFileSync(join(here, "../bank.css"), "utf8");

describe("grass↔soil join is the brown earth's top edge", () => {
  it("paints brown lip + grass + stroke in the ground SVG", () => {
    expect(bgSrc).toContain("bg-soil-lip");
    expect(bgSrc).toContain("bg-surface-earth");
    expect(bgSrc).toContain("bg-soil-join-line");
    expect(bgSrc).toContain("GROUND_JOIN_WAVE");
    expect(bgSrc).toContain('vectorEffect="non-scaling-stroke"');
  });

  it("does not use a separately positioned join overlay", () => {
    expect(bgSrc).not.toContain('className="bg-soil-join"');
    expect(cssSrc).not.toMatch(/\.bg-soil-join\s*\{/);
    expect(cssSrc).not.toContain(".game-area--v3-roots .bg-soil-join");
  });

  it("keeps underground soil as brown only (join lives on the ground SVG)", () => {
    expect(soilSrc).toContain('fill="url(#v2-soil-body)"');
    expect(soilSrc).not.toContain("JOIN_Y");
    expect(soilSrc).not.toContain("#a0c250");
    expect(soilSrc).not.toContain("bg-soil-join-line");
  });
});
