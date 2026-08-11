/**
 * Artistic soil band under the grass line.
 * Brown starts on a flat lip at/below the join so it cannot poke above
 * the thin grass↔soil stroke (wave lives only on that stroke).
 */
/** Matches GameAreaBg surface-earth bottom stop. */
const SURFACE_EARTH = "#a0c250";
/**
 * Flat lip at the grass↔soil join (not a wave — wave is only the stroke).
 * From soil top: peek 18px + horizon-drop 13px ≈ 31px → 31/318 × 114 ≈ 11.
 * Flush to the join (was 12 — left a hair of green under the stroke).
 */
const JOIN_Y = 11;
const SOIL_LIP = `M0,${JOIN_Y} L400,${JOIN_Y}`;

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

      {/* Peek strip above the join — same green as the surface band */}
      <path
        d={`${SOIL_LIP} L400,0 L0,0 Z`}
        fill={SURFACE_EARTH}
      />

      {/* Soil body — flat top sealed under the join stroke */}
      <path
        d={`${SOIL_LIP} L400,114 L0,114 Z`}
        fill="url(#v2-soil-body)"
      />
    </svg>
  );
}
