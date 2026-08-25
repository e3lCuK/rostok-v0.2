import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WATER_PRESETS } from "./gamePresets/waterPresets";
import { SUN_PRESETS } from "./gamePresets/sunPresets";
import { FERTILIZER_PRESETS } from "./gamePresets/fertilizerPresets";
import {
  CARE_MINIGAME_PRESET_SECONDS,
  fertilizerMaxMatchesForDuration,
  minigameResultLabel,
  minigameSkillPercent,
  waterCatchableDropsForPreset,
  waterDropFallToBarMs,
} from "./minigameSkill";

const here = dirname(fileURLToPath(import.meta.url));

describe("minigameSkillPercent", () => {
  it("is 100 when every opportunity is caught", () => {
    expect(minigameSkillPercent(8, 8)).toBe(100);
    expect(minigameSkillPercent(14, 14)).toBe(100);
  });

  it("is 50 at half of opportunities", () => {
    expect(minigameSkillPercent(7, 14)).toBe(50);
    expect(minigameSkillPercent(3, 6)).toBe(50);
  });

  it("caps at 100 if catches exceed opportunities", () => {
    expect(minigameSkillPercent(12, 7)).toBe(100);
  });
});

describe("all Care presets 5…25 s", () => {
  it("catalogs share 5…25 inclusive", () => {
    expect(CARE_MINIGAME_PRESET_SECONDS).toEqual(
      Array.from({ length: 21 }, (_, i) => 5 + i),
    );
    expect(WATER_PRESETS.map((p) => p.durationSec)).toEqual([
      ...CARE_MINIGAME_PRESET_SECONDS,
    ]);
    expect(SUN_PRESETS.map((p) => p.durationSec)).toEqual([
      ...CARE_MINIGAME_PRESET_SECONDS,
    ]);
    expect(FERTILIZER_PRESETS.map((p) => p.durationSec)).toEqual([
      ...CARE_MINIGAME_PRESET_SECONDS,
    ]);
  });

  it("water: catching every catchable drop is 100% at every T", () => {
    expect(waterDropFallToBarMs()).toBeGreaterThan(2500);
    for (const p of WATER_PRESETS) {
      const catchable = waterCatchableDropsForPreset(p);
      expect(catchable, `T=${p.durationSec}`).toBeGreaterThan(0);
      expect(catchable).toBeLessThanOrEqual(p.totalDrops);
      expect(minigameSkillPercent(catchable, catchable)).toBe(100);
      expect(minigameSkillPercent(0, catchable)).toBe(0);
      if (catchable >= 2) {
        const half = Math.floor(catchable / 2);
        expect(minigameSkillPercent(half, catchable)).toBe(
          Math.round((half / catchable) * 100),
        );
      }
    }
  });

  it("sun: 100% is catching every sun that appeared (not a 15s denom)", () => {
    for (const p of SUN_PRESETS) {
      const appeared = Math.max(1, p.totalTargets);
      expect(minigameSkillPercent(appeared, appeared)).toBe(100);
      expect(minigameSkillPercent(Math.ceil(appeared / 2), appeared)).toBe(
        Math.round((Math.ceil(appeared / 2) / appeared) * 100),
      );
    }
  });

  it("fertilizer: 100% bar is the 5…25 preset maxRows table", () => {
    for (const p of FERTILIZER_PRESETS) {
      const max = fertilizerMaxMatchesForDuration(p.durationSec);
      expect(max).toBe(p.maxRows);
      expect(max).toBeGreaterThan(0);
      expect(minigameSkillPercent(max, max)).toBe(100);
      expect(minigameSkillPercent(0, max)).toBe(0);
    }
    expect(fertilizerMaxMatchesForDuration(5)).toBe(4);
    expect(fertilizerMaxMatchesForDuration(7)).toBe(6);
    expect(fertilizerMaxMatchesForDuration(15)).toBe(12);
    expect(fertilizerMaxMatchesForDuration(25)).toBe(20);
  });
});

describe("minigameResultLabel", () => {
  it("scales thresholds to the preset max, not the 15s constants", () => {
    expect(minigameResultLabel(8, 8)).toBe("Отлично!");
    expect(minigameResultLabel(4, 8)).toBe("Хорошо");
    expect(minigameResultLabel(2, 8)).toBe("Попробуйте ещё");
    expect(minigameResultLabel(3, 6)).toBe("Хорошо");
    expect(minigameResultLabel(6, 6)).toBe("Отлично!");
  });
});

describe("minigames wire skill to opportunities", () => {
  it("water / sun / fertilizer use minigameSkillPercent", () => {
    const water = readFileSync(join(here, "../components/FallingGameWater.tsx"), "utf8");
    const sun = readFileSync(join(here, "../components/ClickGameSun.tsx"), "utf8");
    const fert = readFileSync(
      join(here, "../components/FertilizerMatchGame.tsx"),
      "utf8",
    );
    expect(water).toContain("waterCanSpawnAt");
    expect(water).toContain("minigameSkillPercent(catches, spawned)");
    expect(sun).toContain("minigameSkillPercent(catches, spawned)");
    expect(sun).not.toContain("SKILL_DENOM");
    expect(fert).toContain("minigameSkillPercent(m, maxMatches)");
    expect(fert).toContain("fertilizerMaxMatchesForDuration");
    expect(fert).not.toContain("MAX_MATCHES_AT_15_SEC");
  });
});
