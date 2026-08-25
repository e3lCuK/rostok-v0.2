import { useEffect, useRef, useState } from "react";
import {
  api,
  type EconomyV2ExcessRewardDelta,
  type EconomyV2ExcessSessionState,
  type EconomyV2ExcessState,
  type EconomyV2ExcessWeb,
} from "@/lib/api";
import { computeExcessCleaningRemainingSeconds } from "@/lib/excessCleaningCountdown";
import {
  buildClearRewardFloatsFromResponse,
  type ExcessRewardFloat,
} from "@/lib/excessCleaningRewardFloat";
import {
  canClickExcessWeb,
  excessWebExitDurationMs,
  excessWebIndexLabel,
  filterVisibleExcessWebs,
} from "@/lib/excessWebClearUi";
import ExcessWebIcon from "./ExcessWebIcon";

type WebRewardKind = "regular" | "special" | "base_income" | "progress";

type Props = {
  session?: EconomyV2ExcessSessionState | null;
  onExcessApplied: (excess: EconomyV2ExcessState) => void;
  onClearInFlightChange?: (count: number) => void;
  onDebugError?: (message: string) => void;
  /** When false (finished / legacy result), disable clears. */
  clearsEnabled?: boolean;
  /**
   * Ephemeral reward floats — owned by parent (body portal) so snapshot/finish
   * remounts do not wipe mid-animation feedback.
   */
  onRewardFloats?: (floats: ExcessRewardFloat[]) => void;
  /** Per-click balance/XP sync from server (Metelka settles cash immediately). */
  onWebReward?: (reward: {
    kind: WebRewardKind;
    xpGained: number;
    moneyGained: number;
    rewardDelta?: EconomyV2ExcessRewardDelta | null;
    playerXp: number;
    playerLevel: number;
    balances: { balance: number; earned: number };
    clientX: number;
    clientY: number;
  }) => void;
};

const BASE_PX = 42;
/** Extra hit padding beyond the visual glyph (each side). */
const HIT_PAD_PX = 10;
/** Mobile-friendly minimum hit box. */
const HIT_MIN_PX = 44;
const TICK_MS = 250;

/** Exported for visual/hit-area contracts in tests. */
export const EXCESS_WEB_VISUAL = {
  basePx: BASE_PX,
  hitPadPx: HIT_PAD_PX,
  hitMinPx: HIT_MIN_PX,
} as const;

export function excessWebDisplaySize(serverSize: number | null | undefined): number {
  const mult = Number.isFinite(serverSize) ? Number(serverSize) : 1;
  return BASE_PX * mult;
}

export function excessWebHitSize(visualPx: number): number {
  return Math.max(HIT_MIN_PX, visualPx + HIT_PAD_PX * 2);
}

/**
 * Production cobweb layer for active Metelka cleaning.
 * Clicks go to POST /game/v2/excess/webs/clear — no optimistic removal.
 * Version=2 floats use server rewardDelta only (no local formulas).
 */
export default function ExcessCleaningWebLayer({
  session,
  onExcessApplied,
  onClearInFlightChange,
  onDebugError,
  clearsEnabled = true,
  onRewardFloats,
  onWebReward,
}: Props) {
  const active = session?.active === true;
  const webs = Array.isArray(session?.webs) ? session!.webs : [];

  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    active ? computeExcessCleaningRemainingSeconds(session) : 0,
  );
  const [exitingIds, setExitingIds] = useState<Set<string>>(() => new Set());
  const [inFlightTick, setInFlightTick] = useState(0);
  const inFlightRef = useRef<Set<string>>(new Set());
  const exitTimersRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!active) {
      setRemainingSeconds(0);
      return;
    }
    const tick = () => {
      setRemainingSeconds(computeExcessCleaningRemainingSeconds(session));
    };
    tick();
    const id = window.setInterval(tick, TICK_MS);
    return () => {
      window.clearInterval(id);
    };
  }, [
    active,
    session?.startedAt,
    session?.presetSeconds,
    session?.sourceSeconds,
    session?.rate,
  ]);

  const onClearInFlightChangeRef = useRef(onClearInFlightChange);
  onClearInFlightChangeRef.current = onClearInFlightChange;

  useEffect(() => {
    return () => {
      for (const t of exitTimersRef.current.values()) {
        window.clearTimeout(t);
      }
      exitTimersRef.current.clear();
      // Never leave finish guard waiting on a remounted layer's clears.
      inFlightRef.current.clear();
      onClearInFlightChangeRef.current?.(0);
    };
  }, []);

  if (!active) return null;
  if (webs.length === 0) return null;

  const visible = filterVisibleExcessWebs(webs, exitingIds);
  if (visible.length === 0) return null;

  const total = session?.webCount ?? webs.length;

  function beginExitAnimation(webId: string) {
    setExitingIds((prev) => {
      const next = new Set(prev);
      next.add(webId);
      return next;
    });
    const reduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ms = excessWebExitDurationMs(reduced);
    if (ms <= 0) {
      setExitingIds((prev) => {
        const next = new Set(prev);
        next.delete(webId);
        return next;
      });
      return;
    }
    const prevTimer = exitTimersRef.current.get(webId);
    if (prevTimer != null) window.clearTimeout(prevTimer);
    const timer = window.setTimeout(() => {
      exitTimersRef.current.delete(webId);
      setExitingIds((prev) => {
        const next = new Set(prev);
        next.delete(webId);
        return next;
      });
    }, ms);
    exitTimersRef.current.set(webId, timer);
  }

  async function handleClear(
    web: EconomyV2ExcessWeb,
    clientX: number,
    clientY: number,
  ) {
    const webId = web.id;
    if (
      !canClickExcessWeb({
        remainingSeconds,
        cleared: web.cleared,
        inFlight: inFlightRef.current.has(webId),
        exiting: exitingIds.has(webId),
      })
    ) {
      return;
    }

    inFlightRef.current.add(webId);
    setInFlightTick((n) => n + 1);
    onClearInFlightChange?.(inFlightRef.current.size);

    try {
      const res = await api.clearEconomyV2ExcessWeb(webId);
      // Floats first — before snapshot apply / possible layer remount.
      if (res.reward) {
        const floats = buildClearRewardFloatsFromResponse({
          clientX,
          clientY,
          reward: res.reward,
          rewardDelta: res.rewardDelta ?? null,
        });
        if (floats.length > 0) {
          const reduced =
            typeof window !== "undefined" &&
            typeof window.matchMedia === "function" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          if (reduced) {
            for (const f of floats) {
              f.dx = 0;
              f.dy = 0;
            }
          }
          onRewardFloats?.(floats);
        }
        onWebReward?.({
          kind: res.reward.kind,
          xpGained: res.reward.xpGained,
          moneyGained: res.reward.moneyGained,
          rewardDelta: res.rewardDelta ?? null,
          playerXp: res.playerXp,
          playerLevel: res.playerLevel,
          balances: res.balances,
          clientX,
          clientY,
        });
      }
      onExcessApplied(res.excess);
      beginExitAnimation(webId);
    } catch (err: any) {
      const code = err?.code != null ? String(err.code) : "";
      if (
        code === "excess_session_finished" ||
        code === "excess_session_not_active"
      ) {
        try {
          const data = await api.getState();
          if (data.game?.v2Excess) onExcessApplied(data.game.v2Excess);
        } catch {
          // keep previous
        }
      } else if (code === "excess_web_already_cleared") {
        if (err?.excess) {
          onExcessApplied(err.excess);
        } else {
          try {
            const data = await api.getState();
            if (data.game?.v2Excess) onExcessApplied(data.game.v2Excess);
          } catch {
            // keep previous
          }
        }
        beginExitAnimation(webId);
      } else if (code === "excess_session_time_expired") {
        try {
          const data = await api.getState();
          if (data.game?.v2Excess) onExcessApplied(data.game.v2Excess);
        } catch {
          // keep previous
        }
        setRemainingSeconds(0);
      } else if (code === "excess_session_not_active") {
        try {
          const data = await api.getState();
          if (data.game?.v2Excess) onExcessApplied(data.game.v2Excess);
        } catch {
          // keep previous
        }
      } else {
        const msg = err?.message ? String(err.message) : "clear failed";
        onDebugError?.(msg);
      }
    } finally {
      inFlightRef.current.delete(webId);
      setInFlightTick((n) => n + 1);
      onClearInFlightChange?.(inFlightRef.current.size);
    }
  }

  void inFlightTick;

  return (
    <div
      className="excess-cleaning-web-layer"
      data-excess-cleaning-webs="true"
      data-excess-web-count={session?.webCount ?? webs.length}
      data-excess-remaining-seconds={remainingSeconds}
    >
      {visible.map((web) => {
        const exiting = exitingIds.has(web.id);
        const inFlight = inFlightRef.current.has(web.id);
        const clickable =
          clearsEnabled &&
          canClickExcessWeb({
            remainingSeconds,
            cleared: web.cleared,
            inFlight,
            exiting,
          });
        return (
          <WebMarker
            key={web.id}
            web={web}
            total={total}
            clickable={clickable}
            exiting={exiting}
            onClear={(cx, cy) => void handleClear(web, cx, cy)}
          />
        );
      })}
    </div>
  );
}

function WebMarker({
  web,
  total,
  clickable,
  exiting,
  onClear,
}: {
  web: EconomyV2ExcessWeb;
  total: number;
  clickable: boolean;
  exiting: boolean;
  onClear: (clientX: number, clientY: number) => void;
}) {
  const isBaseIncome =
    web.kind === "base_income" ||
    web.type === "base_income" ||
    web.id === "base-income-web";
  const isSpecial =
    isBaseIncome ||
    web.kind === "special" ||
    web.type === "special" ||
    web.id === "web-special";
  const size = excessWebDisplaySize(web.size);
  const hit = excessWebHitSize(size);
  const half = hit / 2;
  const rotation = Number.isFinite(web.rotation) ? web.rotation : 0;
  const left = `clamp(${half}px, ${(web.x * 100).toFixed(3)}%, calc(100% - ${half}px))`;
  const top = `clamp(${half}px, ${(web.y * 100).toFixed(3)}%, calc(100% - ${half}px))`;
  const index = excessWebIndexLabel(web.id);
  const label = isBaseIncome
    ? "Собрать базовый доход"
    : isSpecial
      ? "Собрать банковский доход"
      : index == null
        ? "Убрать паутину"
        : `Убрать паутину ${index + 1} из ${total}`;

  return (
    <button
      type="button"
      className={[
        "excess-cleaning-web",
        isSpecial ? "excess-cleaning-web--special" : "",
        isBaseIncome ? "excess-cleaning-web--base-income" : "",
        clickable ? "excess-cleaning-web--clickable" : "",
        exiting ? "excess-cleaning-web--exiting" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-excess-web-id={web.id}
      data-excess-web-kind={
        isBaseIncome ? "base_income" : isSpecial ? "special" : "regular"
      }
      data-excess-web-x={web.x}
      data-excess-web-y={web.y}
      data-excess-web-size={web.size}
      data-excess-web-display-px={size.toFixed(2)}
      data-excess-web-hit-px={hit.toFixed(2)}
      data-excess-web-cleared={web.cleared ? "true" : "false"}
      data-excess-web-exiting={exiting ? "true" : "false"}
      disabled={!clickable}
      aria-label={label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!clickable) return;
        onClear(e.clientX, e.clientY);
      }}
      style={{
        left,
        top,
        width: hit,
        height: hit,
        transform: "translate(-50%, -50%)",
      }}
    >
      <span
        className="excess-cleaning-web-visual"
        style={{
          width: size,
          height: size,
          transform: `rotate(${rotation}deg)`,
        }}
        aria-hidden="true"
      >
        <span className="excess-cleaning-web-glyph">
          <ExcessWebIcon
            size={size}
            variant={isSpecial ? "special" : "regular"}
          />
        </span>
      </span>
    </button>
  );
}
