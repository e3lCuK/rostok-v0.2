/**
 * Five-segment reserve meter for Economy v3 activity cards (preview).
 */

import type { CSSProperties } from "react";
import type { EconomyV3RootKind } from "@/lib/api";
import {
  V3_ROOT_FILL_COLORS,
  V3_SEGMENT_COUNT,
} from "@/components/v2/EconomyV3RootSystem";
import {
  v3ActivitySegmentFill,
  type V3ActivityCardView,
} from "@/lib/v3ActivityCards";

type Props = {
  kind: EconomyV3RootKind;
  card: V3ActivityCardView;
  /** Show whole-second readout (DEV only). */
  showSeconds?: boolean;
};

export default function V3ActivityReserveMeter({
  kind,
  card,
  showSeconds = false,
}: Props) {
  const fillColor = V3_ROOT_FILL_COLORS[kind];
  return (
    <div
      className="v3-activity-reserve"
      data-v3-activity-reserve={kind}
      data-v3-activity-ui={card.uiState}
      data-v3-activity-seconds={String(card.reserveSeconds)}
      aria-hidden="true"
    >
      <div className="v3-activity-reserve-segments">
        {Array.from({ length: V3_SEGMENT_COUNT }, (_, i) => {
          const fill = v3ActivitySegmentFill(i, card.reserveSeconds);
          const segState =
            fill >= 1 ? "full" : fill > 0 ? "partial" : "empty";
          return (
            <div
              key={i}
              className={`v3-activity-reserve-segment v3-activity-reserve-segment--${segState}`}
              data-v3-activity-segment={i}
              data-v3-activity-segment-fill={fill.toFixed(2)}
              style={
                fill > 0
                  ? ({
                      ["--v3-act-seg-fill" as string]: `${fill * 100}%`,
                      ["--v3-act-seg-color" as string]: fillColor,
                    } as CSSProperties)
                  : undefined
              }
            />
          );
        })}
      </div>
      {showSeconds ? (
        <span
          className="v3-activity-reserve-seconds"
          data-v3-activity-seconds-label="true"
        >
          {card.reserveSeconds} с
        </span>
      ) : null}
    </div>
  );
}
