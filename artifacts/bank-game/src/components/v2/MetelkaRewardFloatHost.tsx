import { createPortal } from "react-dom";
import type { ExcessRewardFloat } from "@/lib/excessCleaningRewardFloat";

type Props = {
  floats: ExcessRewardFloat[];
};

/**
 * Viewport-level Metelka reward floats.
 * Portaled to document.body so game-area overflow/stacking cannot clip them.
 */
export default function MetelkaRewardFloatHost({ floats }: Props) {
  if (typeof document === "undefined" || floats.length === 0) return null;

  return createPortal(
    <div
      className="excess-cleaning-reward-float-root"
      data-excess-reward-floats="true"
      aria-hidden="true"
    >
      {floats.map((f) => (
        <span
          key={f.id}
          className={[
            "excess-cleaning-reward-float",
            `excess-cleaning-reward-float--${f.kind}`,
            f.size === "large" ? "excess-cleaning-reward-float--large" : "",
            f.motion === "to-chest"
              ? "excess-cleaning-reward-float--to-chest"
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
          data-excess-reward-float={f.kind}
          data-excess-reward-float-id={f.id}
          data-excess-reward-motion={f.motion}
          data-excess-reward-size={f.size}
          style={{
            left: f.startX,
            top: f.startY,
            ["--excess-float-dx" as string]: `${f.dx}px`,
            ["--excess-float-dy" as string]: `${f.dy}px`,
          }}
        >
          {f.label}
        </span>
      ))}
    </div>,
    document.body,
  );
}
