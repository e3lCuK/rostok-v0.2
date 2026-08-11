/**
 * Care / Metelka collectible on the tree — flat fill + thin outline
 * (same language as basket apples / wood chrome).
 */

type Kind = "apple" | "coin";

type Props = {
  kind: Kind;
  className?: string;
};

const WOOD = "#5c3a1a";
const LEAF = "#2f5c0e";
const STROKE = 1.05;

export default function TreeRewardToken({ kind, className }: Props) {
  if (kind === "coin") {
    return (
      <svg
        className={["tree-reward-token", "tree-reward-token--coin", className]
          .filter(Boolean)
          .join(" ")}
        viewBox="0 0 20 20"
        width="100%"
        height="100%"
        aria-hidden="true"
        focusable="false"
      >
        <circle
          cx="10"
          cy="10"
          r="8"
          fill="#f0b429"
          stroke={WOOD}
          strokeWidth={STROKE}
        />
        <circle
          cx="10"
          cy="10"
          r="5.2"
          fill="none"
          stroke={WOOD}
          strokeWidth={STROKE}
          opacity="0.55"
        />
      </svg>
    );
  }

  return (
    <svg
      className={["tree-reward-token", "tree-reward-token--apple", className]
        .filter(Boolean)
        .join(" ")}
      viewBox="0 0 20 20"
      width="100%"
      height="100%"
      aria-hidden="true"
      focusable="false"
    >
      <circle
        cx="10"
        cy="11"
        r="7.2"
        fill="#c0392b"
        stroke={WOOD}
        strokeWidth={STROKE}
      />
      <path
        d="M10 4.5 Q11.1 3 12.6 2.6"
        fill="none"
        stroke={LEAF}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
    </svg>
  );
}
