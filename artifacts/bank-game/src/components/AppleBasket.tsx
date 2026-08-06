/**
 * Interactive apple basket on the play field (left of the left bush).
 * Replaces the former topbar apple row; click opens the shop.
 */

import type { ReactNode } from "react";

type Props = {
  apples: number;
  onClick: () => void;
  /** Optional reward popup (+N ябл) anchored above the basket. */
  popup?: ReactNode;
};

export default function AppleBasket({ apples, onClick, popup }: Props) {
  const label = Math.max(0, Math.floor(apples)).toLocaleString("ru-RU");

  return (
    <div className="apple-basket-host" data-apple-basket-host="true">
      {popup}
      <button
        type="button"
        className="apple-basket"
        data-apple-basket="true"
        aria-label={`Яблоки: ${label}. Открыть магазин`}
        onClick={onClick}
      >
        <span className="apple-basket-art-wrap" aria-hidden="true">
          <svg
            className="apple-basket-art"
            viewBox="0 0 56 48"
            width="56"
            height="48"
          >
            {/* Body — smooth shoulders, width matched to rim (no sharp ears) */}
            <path
              d="M11.5 20.5
                 C10.2 20.5 9.6 22.5 10 27
                 L11.5 40.5
                 Q28 46.5 44.5 40.5
                 L46 27
                 C46.4 22.5 45.8 20.5 44.5 20.5
                 Q28 24.5 11.5 20.5Z"
              fill="#8b623e"
            />
            <path
              d="M13.5 22.5
                 C12.5 22.5 12.2 24.2 12.5 28
                 L14 39
                 Q28 44 42 39
                 L43.5 28
                 C43.8 24.2 43.5 22.5 42.5 22.5
                 Q28 26 13.5 22.5Z"
              fill="#a67845"
            />
            {/* Weave lines */}
            <path
              d="M14 29 Q28 33.5 42 29"
              fill="none"
              stroke="#6b4423"
              strokeWidth="1.1"
              opacity="0.55"
            />
            <path
              d="M14.5 34.5 Q28 38.5 41.5 34.5"
              fill="none"
              stroke="#6b4423"
              strokeWidth="1.1"
              opacity="0.45"
            />
            {/* Rim — flat closed oval (side view, little floor visible) */}
            <ellipse
              cx="28"
              cy="19.2"
              rx="17"
              ry="3.6"
              fill="#dcc4a0"
              stroke="#8b623e"
              strokeWidth="2"
            />
            {/* Apples peeking over the front lip */}
            <circle cx="22" cy="15.5" r="5" fill="#c0392b" />
            <circle cx="22" cy="15.5" r="5" fill="#e74c3c" opacity="0.35" />
            <path
              d="M22 10.5 Q23 8.5 25 8"
              fill="none"
              stroke="#3d6b1a"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
            <circle cx="33" cy="15" r="4.5" fill="#b83228" />
            <circle cx="33" cy="15" r="4.5" fill="#e74c3c" opacity="0.3" />
            <path
              d="M33 10.5 Q34 9 35.5 8.5"
              fill="none"
              stroke="#3d6b1a"
              strokeWidth="1.1"
              strokeLinecap="round"
            />
            <circle cx="28" cy="17.5" r="3.6" fill="#d6453d" />
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
