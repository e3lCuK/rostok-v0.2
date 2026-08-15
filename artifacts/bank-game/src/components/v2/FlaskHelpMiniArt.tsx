/**
 * Mini hourglass art for the flask help modal (gold vs grey).
 * Same silhouette family as the live capital flask.
 */

import { V3_HOURGLASS_OUTER_PATH } from "@/components/v2/V3WaitTimerHourglass";

type Tone = "gold" | "grey";

const TONE = {
  gold: {
    rim: "#c9920a",
    fill: "rgba(201, 146, 10, 0.45)",
    shell: "#f7fee7",
  },
  grey: {
    rim: "#8a847c",
    fill: "rgba(138, 132, 124, 0.42)",
    shell: "#f3f1ee",
  },
} as const;

type Props = {
  tone: Tone;
  /** Fill 0–1 from the bottom of the visible bulb. */
  fill?: number;
  label?: string;
};

export default function FlaskHelpMiniArt({
  tone,
  fill = 0.55,
  label = "12:00",
}: Props) {
  const c = TONE[tone];
  const f = Math.min(1, Math.max(0, fill));
  const vh = 90;
  const fillH = vh * f;
  const fillY = vh - fillH;
  const uid = `flask-help-${tone}`;

  return (
    <div
      className={`flask-help-mini flask-help-mini--${tone}`}
      data-flask-help-mini={tone}
      aria-hidden="true"
    >
      <svg
        className="flask-help-mini__svg"
        viewBox="0 0 80 90"
        width="52"
        height="58"
        focusable="false"
      >
        <defs>
          <clipPath id={`${uid}-body`}>
            <path d={V3_HOURGLASS_OUTER_PATH} />
          </clipPath>
          <clipPath id={`${uid}-band`}>
            <rect x={0} y={0} width={80} height={90} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${uid}-band)`}>
          <path fill={c.shell} d={V3_HOURGLASS_OUTER_PATH} />
          <g clipPath={`url(#${uid}-body)`}>
            <rect x={0} y={fillY} width={80} height={fillH} fill={c.fill} />
          </g>
          <path
            d={V3_HOURGLASS_OUTER_PATH}
            fill="none"
            stroke={c.rim}
            strokeWidth={1.4}
            strokeLinejoin="round"
          />
        </g>
      </svg>
      <span className="flask-help-mini__time" style={{ color: c.rim }}>
        {label}
      </span>
    </div>
  );
}
