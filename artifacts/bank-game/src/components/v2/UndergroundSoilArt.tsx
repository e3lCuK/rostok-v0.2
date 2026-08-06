/**
 * Artistic soil band under the grass line — uneven surface only.
 * Purely decorative; does not affect roots / hit areas / mechanics.
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

      {/* Soil body — gentle lip meets the grass surface as one earth layer */}
      <path
        d="M0,11 C50,9 100,12 150,10 S250,12 300,10 S360,12 400,11 L400,114 L0,114 Z"
        fill="url(#v2-soil-body)"
      />
    </svg>
  );
}
