/**
 * Compact root glyph for each Economy v3 root segment cell.
 * Stroke SVG — stays legible at ~11px.
 */

type Props = {
  kind: string;
  segment?: number;
  size?: number;
};

export default function RootCellGlyph({ kind, segment, size = 11 }: Props) {
  return (
    <span
      className="v3-root-glyph"
      data-v3-root-glyph={kind}
      data-v3-root-glyph-segment={
        segment == null ? undefined : String(segment)
      }
      aria-hidden="true"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="v3-root-glyph-svg"
      >
        <path d="M10 2.5h4v3.2h-4z" fill="currentColor" />
        <path
          d="M12 5.5v14.5"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
        <path
          d="M12 8.2C9.2 8.6 7 10 5.4 12.2M12 8.2c2.8.4 5 1.8 6.6 4M12 12.2c-2.2.55-4 1.9-5.2 3.7M12 12.2c2.2.55 4 1.9 5.2 3.7M12 16.4c-1.5.55-2.6 1.5-3.3 2.7M12 16.4c1.5.55 2.6 1.5 3.3 2.7"
          stroke="currentColor"
          strokeWidth="1.85"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
