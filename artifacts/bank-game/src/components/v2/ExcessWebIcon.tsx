/** Outline cobweb SVG for Metelka cleaning mode (display only). */
export default function ExcessWebIcon({
  size = 42,
  className,
  variant = "regular",
}: {
  size?: number;
  className?: string;
  /** Special red income web vs ordinary Skill/XP webs. */
  variant?: "regular" | "special";
}) {
  const stroke = Math.max(1, size * (variant === "special" ? 0.045 : 0.038));
  const isSpecial = variant === "special";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      data-excess-web-icon="true"
      data-excess-web-variant={variant}
      style={{ display: "block", overflow: "visible" }}
    >
      {[0, 30, 60, 90, 120, 150].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        return (
          <line
            key={`spoke-${deg}`}
            x1={32 - 26 * Math.cos(rad)}
            y1={32 - 26 * Math.sin(rad)}
            x2={32 + 26 * Math.cos(rad)}
            y2={32 + 26 * Math.sin(rad)}
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinecap="round"
            opacity={isSpecial ? 1 : 0.95}
          />
        );
      })}
      {[10, 16, 22, 28].map((r) => (
        <path
          key={`arc-${r}`}
          d={arcRing(32, 32, r)}
          stroke="currentColor"
          strokeWidth={stroke * 0.9}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={isSpecial ? 0.92 : 0.82}
        />
      ))}
    </svg>
  );
}

/** Soft hexagonal ring approximation via cubic arcs. */
function arcRing(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    pts.push(i === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : `L ${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return `${pts.join(" ")} Z`;
}
