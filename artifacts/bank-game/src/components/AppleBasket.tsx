/**
 * Interactive apple basket on the play field (right of the left bush).
 * Replaces the former topbar apple row; click opens the shop.
 */

import type { ReactNode } from "react";

type Props = {
  apples: number;
  onClick: () => void;
  /** Optional reward popup (+N ябл) anchored above the basket. */
  popup?: ReactNode;
  /** Pulse while a Care apple is being dragged (same language as activity cards). */
  dropHighlight?: boolean;
};

export default function AppleBasket({
  apples,
  onClick,
  popup,
  dropHighlight = false,
}: Props) {
  const label = Math.max(0, Math.floor(apples)).toLocaleString("ru-RU");

  return (
    <div className="apple-basket-host" data-apple-basket-host="true">
      {popup}
      <button
        type="button"
        className={`apple-basket${dropHighlight ? " apple-basket--receiving" : ""}`}
        data-apple-basket="true"
        aria-label={`Яблоки: ${label}. Открыть магазин`}
        onClick={dropHighlight ? undefined : onClick}
      >
        {/* Pulse only the basket art — never the count pill below. */}
        <span
          className={`apple-basket-art-wrap${dropHighlight ? " apple-basket-art-wrap--drop-target" : ""}`}
          data-apple-basket-drop-target={dropHighlight ? "true" : undefined}
          aria-hidden="true"
        >
          <svg
            className="apple-basket-art"
            viewBox="0 0 56 48"
            width="56"
            height="48"
          >
            {/*
              Same paint language as field bushes: flat fills, thin uniform
              stroke on each piece, no weave / opacity overlays.
            */}
            {/* Body */}
            <path
              d="M12 21
                 C10.5 21 10 23 10.5 27.5
                 L12 40
                 Q28 45.5 44 40
                 L45.5 27.5
                 C46 23 45.5 21 44 21
                 Q28 24.5 12 21Z"
              fill="#8b623e"
              stroke="#5c3a1a"
              strokeWidth="1.1"
              strokeLinejoin="round"
            />
            {/* Weave bands */}
            <path
              d="M14 29 Q28 33.5 42 29"
              fill="none"
              stroke="#5c3a1a"
              strokeWidth="1.05"
              strokeLinecap="round"
              opacity="0.55"
            />
            <path
              d="M14.5 34.5 Q28 38.5 41.5 34.5"
              fill="none"
              stroke="#5c3a1a"
              strokeWidth="1.05"
              strokeLinecap="round"
              opacity="0.45"
            />
            {/* Rim */}
            <ellipse
              cx="28"
              cy="19.5"
              rx="16.5"
              ry="3.4"
              fill="#dcc4a0"
              stroke="#5c3a1a"
              strokeWidth="1.1"
            />
            {/* Apples — solid circles + thin rim (like bush lobes) */}
            <circle
              cx="22"
              cy="15.2"
              r="5"
              fill="#e74c3c"
              stroke="#5c3a1a"
              strokeWidth="1.05"
            />
            <path
              d="M22 10.2 Q23 8.4 24.8 8"
              fill="none"
              stroke="#2f5c0e"
              strokeWidth="1.05"
              strokeLinecap="round"
            />
            <circle
              cx="33.5"
              cy="14.8"
              r="4.6"
              fill="#d6453d"
              stroke="#5c3a1a"
              strokeWidth="1.05"
            />
            <path
              d="M33.5 10.2 Q34.4 8.6 36 8.2"
              fill="none"
              stroke="#2f5c0e"
              strokeWidth="1.05"
              strokeLinecap="round"
            />
            <circle
              cx="28"
              cy="17.2"
              r="3.5"
              fill="#c0392b"
              stroke="#5c3a1a"
              strokeWidth="1.05"
            />
          </svg>
        </span>
        <span
          className="field-caption-badge apple-basket-badge"
          data-apple-basket-count="true"
        >
          <span className="field-caption-value">{label}</span>
          <span className="field-caption-unit">ябл</span>
        </span>
      </button>
    </div>
  );
}
