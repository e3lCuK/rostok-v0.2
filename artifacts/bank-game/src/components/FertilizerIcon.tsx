/**
 * Fertilizer granules — three round pellets in a triangle.
 * Outline mode matches Lucide Droplets/Sun (strokeWidth 2.25).
 */

export default function FertilizerIcon({
  size = 22,
  className,
  color,
  filled = true,
}: {
  size?: number;
  className?: string;
  /** Override stroke/fill color; defaults to currentColor (inherits from button). */
  color?: string;
  /**
   * filled — solid granules (active button / match-3).
   * outline — Lucide-style strokes (tutorial card / completed / disabled).
   */
  filled?: boolean;
}) {
  const paint = color ?? "currentColor";

  /** Triangle of round pellets — clear gaps at 16–48px. */
  const grains = [
    { cx: 12, cy: 7.4, r: 3.35 },
    { cx: 7.15, cy: 16.1, r: 3.35 },
    { cx: 16.85, cy: 16.1, r: 3.35 },
  ] as const;

  if (!filled) {
    // Same stroke language as <Sun strokeWidth={2.25} /> / Droplets / Zap.
    const strokeW = 2.25;
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
        style={{ display: "block", overflow: "visible" }}
      >
        {grains.map((g, i) => (
          <circle
            key={i}
            cx={g.cx}
            cy={g.cy}
            r={g.r}
            fill="none"
            stroke={paint}
            strokeWidth={strokeW}
          />
        ))}
      </svg>
    );
  }

  const fillPaint = paint === "currentColor" ? "currentColor" : paint;
  const strokePaint =
    paint === "currentColor" ? "currentColor" : "#78350f";
  const strokeW = Math.max(1.4, Math.min(2.1, size * 0.07));

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      style={{ display: "block", overflow: "visible" }}
    >
      {grains.map((g, i) => (
        <circle
          key={i}
          cx={g.cx}
          cy={g.cy}
          r={g.r}
          fill={fillPaint}
          stroke={strokePaint}
          strokeWidth={strokeW}
        />
      ))}
      {/* Soft highlights — same weight language as Droplets fill. */}
      <circle cx="10.9" cy="6.5" r="1.05" fill={fillPaint} fillOpacity="0.45" />
      <circle cx="6.2" cy="15.1" r="1.05" fill={fillPaint} fillOpacity="0.4" />
      <circle cx="15.9" cy="15.1" r="1.05" fill={fillPaint} fillOpacity="0.4" />
    </svg>
  );
}
