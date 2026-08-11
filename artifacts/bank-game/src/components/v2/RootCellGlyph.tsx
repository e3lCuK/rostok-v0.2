/**
 * Compact root glyph for each Economy v3 root segment cell.
 * Flat fill + thin stroke — same language as wrap roots / tree.
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
        {/* Collar stub */}
        <rect
          x="10"
          y="2"
          width="4"
          height="4"
          rx="1"
          fill="currentColor"
        />
        {/* Center taper stem */}
        <path
          d="M12 6v15"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        {/* Three lobe pairs — flat fork, thin outline weight */}
        <path
          d="M12 8.5C9.6 9 7.6 10.4 6.2 12.4M12 8.5c2.4.5 4.4 1.9 5.8 3.9M12 13c-2 .5-3.6 1.7-4.7 3.3M12 13c2 .5 3.6 1.7 4.7 3.3M12 17.2c-1.3.5-2.3 1.3-2.9 2.4M12 17.2c1.3.5 2.3 1.3 2.9 2.4"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
