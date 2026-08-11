/**
 * Economy v3 hourglass = three stacked fill segments (bottom → top):
 *   1. capital button bulb
 *   2. mid (behind chest, invisible)
 *   3. visible upper SVG
 *
 * Global barProgress fills them sequentially, not in parallel.
 */

/** Must match V3_HOURGLASS_VIEW.height / capital bulb view in V3WaitTimerHourglass. */
export const V3_HG_VIEW_H = 140;
export const V3_HG_BUTTON_TOP = 100;
export const V3_HG_BUTTON_H = 38;
export const V3_HG_BUTTON_BOTTOM = V3_HG_BUTTON_TOP + V3_HG_BUTTON_H;

export type V3HourglassSegmentFills = {
  /** 0..1 fill of the capital button bulb */
  button: number;
  /** 0..1 fill of the invisible mid segment behind the chest */
  mid: number;
  /** 0..1 fill of the visible upper SVG */
  upper: number;
  /** Original 0..1 overall progress */
  overall: number;
};

/** Lid cut y in hourglass viewBox units (matches --v3-hourglass-tuck / height). */
export function v3HourglassLidCutY(tuckPx: number, heightPx: number): number {
  if (!(heightPx > 0) || !Number.isFinite(tuckPx)) {
    return V3_HG_VIEW_H * (1 - 46 / 112);
  }
  return V3_HG_VIEW_H * (1 - tuckPx / heightPx);
}

export function splitV3HourglassProgress(input: {
  barProgress: number;
  cutY: number;
  buttonTop?: number;
  buttonBottom?: number;
}): V3HourglassSegmentFills {
  const overall = Math.min(1, Math.max(0, input.barProgress));
  const buttonTop = input.buttonTop ?? V3_HG_BUTTON_TOP;
  const buttonBottom = input.buttonBottom ?? V3_HG_BUTTON_BOTTOM;
  const cutY = Math.min(Math.max(input.cutY, 1), buttonTop - 0.001);

  const hButton = Math.max(0.001, buttonBottom - buttonTop);
  const hMid = Math.max(0.001, buttonTop - cutY);
  const hUpper = Math.max(0.001, cutY);
  const total = hButton + hMid + hUpper;

  let rem = overall * total;
  const button = Math.min(1, Math.max(0, rem / hButton));
  rem = Math.max(0, rem - hButton);
  const mid = Math.min(1, Math.max(0, rem / hMid));
  rem = Math.max(0, rem - hMid);
  const upper = Math.min(1, Math.max(0, rem / hUpper));

  return { button, mid, upper, overall };
}

export function segmentFillPct(fill: number): string {
  return `${Math.round(Math.min(1, Math.max(0, fill)) * 1000) / 10}%`;
}
