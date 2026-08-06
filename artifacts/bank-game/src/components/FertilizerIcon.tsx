/** Earthy fertilizer granules — uses currentColor so disabled/done CSS can gray it out. */
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
   * filled — solid granules (active button / tutorial / match-3).
   * outline — separate non-overlapping contours (completed / disabled).
   */
  filled?: boolean;
}) {
  const paint = color ?? "currentColor";
  /* Outline matches energy-timer Zap (strokeWidth 2.25); filled keeps softer grain edges. */
  const strokeW = filled
    ? Math.max(1.55, size * 0.085)
    : Math.max(2.25, size * 0.14);

  /** Filled cluster — original overlapping look (do not change). */
  const filledGrains = [
    { cx: 7.5, cy: 14.5, rx: 5.2, ry: 3.8, rot: -32, op: 1 },
    { cx: 16.2, cy: 9.2, rx: 5.6, ry: 4.1, rot: 22, op: 0.95 },
    { cx: 13.2, cy: 17.8, rx: 4.8, ry: 3.5, rot: -10, op: 0.88 },
  ] as const;

  /**
   * Outline cluster — three separated ovals (droplet-like stack).
   * Centers chosen so ellipses + stroke do not cross at 18–26px.
   */
  const outlineGrains = [
    { cx: 8.2, cy: 16.2, rx: 3.55, ry: 2.65, rot: -30 },
    { cx: 16.6, cy: 13.4, rx: 3.55, ry: 2.65, rot: 28 },
    { cx: 12.0, cy: 7.4, rx: 3.4, ry: 2.55, rot: -8 },
  ] as const;

  if (!filled) {
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
        {outlineGrains.map((g, i) => (
          <ellipse
            key={i}
            cx={g.cx}
            cy={g.cy}
            rx={g.rx}
            ry={g.ry}
            transform={`rotate(${g.rot} ${g.cx} ${g.cy})`}
            fill="none"
            stroke={paint}
            strokeWidth={strokeW}
            strokeLinejoin="round"
          />
        ))}
      </svg>
    );
  }

  // Warm inner fill + darker outline so weight matches Droplets/Sun strokes.
  const fillPaint = paint === "currentColor" ? "currentColor" : paint;
  const strokePaint =
    paint === "currentColor" ? "currentColor" : "#78350f";

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
      {filledGrains.map((g, i) => (
        <ellipse
          key={i}
          cx={g.cx}
          cy={g.cy}
          rx={g.rx}
          ry={g.ry}
          transform={`rotate(${g.rot} ${g.cx} ${g.cy})`}
          fill={fillPaint}
          fillOpacity={g.op}
          stroke={strokePaint}
          strokeWidth={strokeW}
          strokeLinejoin="round"
        />
      ))}
      <ellipse
        cx="5.8"
        cy="13.2"
        rx="1.6"
        ry="1.05"
        transform="rotate(-32 5.8 13.2)"
        fill={fillPaint}
        fillOpacity="0.55"
      />
      <ellipse
        cx="14.6"
        cy="7.8"
        rx="1.7"
        ry="1.1"
        transform="rotate(22 14.6 7.8)"
        fill={fillPaint}
        fillOpacity="0.5"
      />
    </svg>
  );
}
