/**
 * Brown earth band. The grass↔soil join (wavy lip + stroke) is painted in
 * GameAreaBg's ground SVG — same element as the grass, so it cannot drift
 * on resize. This band is all brown and peeks behind that lip.
 */
export default function UndergroundSoilArt() {
  return (
    <svg
      className="v2-underground-soil"
      viewBox="0 0 400 114"
      preserveAspectRatio="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="v2-soil-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c4a878" />
          <stop offset="28%" stopColor="#b89260" />
          <stop offset="70%" stopColor="#ad8054" />
          <stop offset="100%" stopColor="#9a6e48" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="400" height="114" fill="url(#v2-soil-body)" />
    </svg>
  );
}
