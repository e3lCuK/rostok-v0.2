/**
 * Solid chestnut / seed silhouette for match-3 fertilizer granules.
 * Shape follows the 🌰 cutout; fill is a single flat color.
 */

type Props = {
  size?: number;
  className?: string;
  color?: string;
};

export default function FertilizerGranuleIcon({
  size = 36,
  className,
  color = "currentColor",
}: Props) {
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
      {/* Sharp tip → wide belly → gently flattened base */}
      <path
        fill={color}
        d="M12 1.4
           C13.1 3.8 15.8 6.6 17.4 9.8
           C19.2 13.4 19.85 16.7 18.35 19.15
           C16.95 21.4 14.55 22.55 12 22.55
           C9.45 22.55 7.05 21.4 5.65 19.15
           C4.15 16.7 4.8 13.4 6.6 9.8
           C8.2 6.6 10.9 3.8 12 1.4Z"
      />
    </svg>
  );
}
