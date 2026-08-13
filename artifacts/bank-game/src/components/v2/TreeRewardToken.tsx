/**
 * Care / Metelka collectible on the tree — flat fill + thin outline
 * (same language as basket apples / wood chrome).
 */

type Kind = "apple" | "coin";
/** Care reward = gold; Metelka / excess reward = stone grey. */
type Tone = "gold" | "stone";

type Props = {
  kind: Kind;
  tone?: Tone;
  className?: string;
};

const WOOD = "#5c3a1a";
const STONE_EDGE = "#57534e";
const LEAF = "#2f5c0e";
const STROKE = 1.05;
const COIN_FILL: Record<Tone, string> = {
  gold: "#f0b429",
  stone: "#cdc7bf",
};

export default function TreeRewardToken({
  kind,
  tone = "gold",
  className,
}: Props) {
  if (kind === "coin") {
    const edge = tone === "stone" ? STONE_EDGE : WOOD;
    return (
      <svg
        className={[
          "tree-reward-token",
          "tree-reward-token--coin",
          tone === "stone" ? "tree-reward-token--stone" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        viewBox="0 0 20 20"
        width="100%"
        height="100%"
        aria-hidden="true"
        focusable="false"
        data-reward-tone={tone}
      >
        <circle
          cx="10"
          cy="10"
          r="8"
          fill={COIN_FILL[tone]}
          stroke={edge}
          strokeWidth={STROKE}
        />
        <circle
          cx="10"
          cy="10"
          r="5.2"
          fill="none"
          stroke={edge}
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
