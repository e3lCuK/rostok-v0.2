import { useState } from "react";
import {
  api,
  type EconomyV2ExcessState,
  type EconomyV2RootsState,
} from "@/lib/api";
import type { UserState } from "@/lib/engine";
import { deriveExcessLiveFields } from "@/lib/excessEconomyDerive";
import { normalizeV2Roots, parseReadyMask, V2_ROOT_SECTION_COUNT } from "@/lib/v2Roots";

type EnergyPatch = { deltaSeconds?: number; setSeconds?: number };
type RootsAction = { action: "reset" } | { action: "add"; count: 1 | 15 };
type ExcessAction =
  | { action: "reset" }
  | { action: "addPresetSeconds"; seconds: number }
  | { action: "add"; seconds: number }
  | { action: "setPreset"; presetSeconds: number; elapsedMs?: number }
  | { action: "setElapsed"; elapsedMs: number }
  | { action: "setFinancial"; seconds: number; elapsedMs: number }
  | { action: "resetSession" };

interface Props {
  energySeconds: number;
  /** Server readyMask from game state — sole source of truth for display. */
  readyMask?: string;
  readyCount?: number;
  /** Server excess snapshot — sole source of truth for display. */
  excess?: EconomyV2ExcessState | null;
  onEnergyApplied: (patch: {
    v2EnergySeconds: number;
    v2EnergyAnchorAt: number;
    lastSessionTime: number | null;
    missedSessions: number;
    v2Roots: EconomyV2RootsState;
  }) => void;
  onRootsApplied: (patch: {
    v2Roots: EconomyV2RootsState;
    v2EnergySeconds: number;
    v2EnergyAnchorAt: number;
  }) => void;
  onExcessApplied: (patch: { v2Excess: EconomyV2ExcessState }) => void;
}

const ENERGY_ACTIONS: { label: string; key: string; body: EnergyPatch }[] = [
  { label: "+1 сек", key: "p1", body: { deltaSeconds: 1 } },
  { label: "+5 сек", key: "p5", body: { deltaSeconds: 5 } },
  { label: "+15 сек", key: "p15", body: { deltaSeconds: 15 } },
  { label: "Заполнить до 60", key: "fill", body: { setSeconds: 60 } },
  { label: "−5 сек", key: "m5", body: { deltaSeconds: -5 } },
  { label: "Сбросить в 0", key: "zero", body: { setSeconds: 0 } },
];

const ROOTS_ACTIONS: { label: string; key: string; body: RootsAction }[] = [
  { label: "Сбросить секции", key: "r0", body: { action: "reset" } },
  { label: "+1 секция", key: "r1", body: { action: "add", count: 1 } },
  { label: "+15 секций", key: "r15", body: { action: "add", count: 15 } },
];

/** Compact excess telemetry is always on — do not conflate ledger with Metelka T. */
const SHOW_EXCESS_SESSION_DEBUG_UI = true;

/**
 * Quick financial-time chips (labels in hours).
 * At reference capital, 1h financial ≈ 5 ledger seconds via addPresetSeconds.
 */
const EXCESS_PRESET_ACTIONS: {
  label: string;
  key: string;
  body: ExcessAction;
}[] = [
  { label: "+1ч", key: "xt1h", body: { action: "addPresetSeconds", seconds: 5 } },
  { label: "+2ч", key: "xt2h", body: { action: "addPresetSeconds", seconds: 10 } },
  { label: "+3ч", key: "xt3h", body: { action: "addPresetSeconds", seconds: 15 } },
  { label: "+4ч", key: "xt4h", body: { action: "addPresetSeconds", seconds: 20 } },
  { label: "+5ч", key: "xt5h", body: { action: "addPresetSeconds", seconds: 25 } },
];

/** Reset only — ledger/finance are driven by addPresetSeconds. */
const EXCESS_ACTIONS: { label: string; key: string; body: ExcessAction }[] = [
  { label: "Сбросить избыток и сессию", key: "x0", body: { action: "reset" } },
];

export function formatExcessElapsedMsDisplay(ms: number): string {
  const n = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  if (n < 1000) return `${n.toFixed(0)} мс`;
  if (n < 60_000) return `${(n / 1000).toFixed(1)} с`;
  if (n < 3_600_000) return `${(n / 60_000).toFixed(1)} мин`;
  return `${(n / 3_600_000).toFixed(2)} ч (${n.toFixed(0)} мс)`;
}

function readyCountOf(maskStr: string): number {
  const m = parseReadyMask(maskStr);
  let n = 0;
  for (let i = 0; i < V2_ROOT_SECTION_COUNT; i++) {
    if (((m >> BigInt(i)) & 1n) === 1n) n += 1;
  }
  return n;
}

/** Debug bank label — exact decimals, never Math.floor. */
export function formatDebugBankLabel(seconds: number): string {
  const n = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return `Банк ${n.toFixed(2)} / 60 сек`;
}

export function formatExcessSecondsDisplay(seconds: number): string {
  const n = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return `${n.toFixed(2)} сек`;
}

export function formatExcessCycleDisplay(cycle: number): string {
  const n = Number.isFinite(cycle) ? Math.max(0, cycle) : 0;
  return n.toFixed(3);
}

export function formatExcessRatePercent(rate: number): string {
  const n = Number.isFinite(rate) ? Math.max(0, rate) : 0;
  return `${(n * 100).toFixed(2)}%`;
}

/** Local clock for session.startedAt; em dash when inactive / missing. */
export function formatExcessSessionStartedAt(startedAt: number | null): string {
  if (startedAt == null || !Number.isFinite(startedAt)) return "—";
  const d = new Date(startedAt);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function isExcessStartEnabled(
  excess: EconomyV2ExcessState,
  busy: boolean,
): boolean {
  return (
    !busy &&
    !!excess.excessAvailable &&
    !excess.session?.active &&
    !excess.result?.available
  );
}

export function isExcessResetSessionEnabled(
  excess: EconomyV2ExcessState,
  busy: boolean,
): boolean {
  return (
    !busy && (!!excess.session?.active || !!excess.result?.available)
  );
}

export function emptyV2ExcessState(): EconomyV2ExcessState {
  const live = deriveExcessLiveFields(0);
  return {
    excessSeconds: live.excessSeconds,
    excessElapsedMs: 0,
    excessBaseIncome: 0,
    excessFinanciallyValid: true,
    excessCycle: live.excessCycle,
    excessAvailable: live.excessAvailable,
    // Derived T(n) only — never independent state.
    excessPresetSeconds: live.excessPresetSeconds,
    excessRate: live.excessRate,
    session: {
      active: false,
      version: null,
      startedAt: null,
      sourceSeconds: null,
      sourceElapsedMs: null,
      capital: null,
      baseIncome: null,
      baseWebCleared: false,
      baseWebCollectionMode: null,
      presetSeconds: null,
      rate: null,
      webCount: null,
      whiteWebCount: null,
      layoutSeed: null,
      clearedWebIds: [],
      clearedWebCount: 0,
      remainingWebCount: 0,
      specialWebId: null,
      baseWebId: null,
      specialCleared: false,
      bonusRawUnlocked: null,
      xpAwarded: null,
      webs: [],
    },
    result: {
      available: false,
      sessionVersion: null,
      finishedAt: null,
      reason: null,
      clearedCount: null,
      clearedWhiteCount: null,
      webCount: null,
      whiteWebCount: null,
      skill: null,
      sourceSeconds: null,
      presetSeconds: null,
      rate: null,
      xp: {
        max: null,
        raw: null,
        awarded: null,
        applied: false,
      },
      income: {
        available: false,
        reason: null,
        capital: null,
        excessElapsedMs: null,
        annualRate: null,
        gross: null,
        paymentFactor: null,
        paid: null,
        applied: false,
        base: { amount: null, collectionMode: null, applied: false },
        bonus: { gross: null, skill: null, paid: null, applied: false },
        total: { paid: null, applied: false },
      },
    },
  };
}

export function normalizeV2Excess(
  raw: EconomyV2ExcessState | null | undefined,
): EconomyV2ExcessState {
  if (!raw) return emptyV2ExcessState();
  const sessionRaw = raw.session;
  const websRaw = Array.isArray(sessionRaw?.webs) ? sessionRaw!.webs : [];
  const clearedWebIdsRaw = Array.isArray(sessionRaw?.clearedWebIds)
    ? sessionRaw!.clearedWebIds.map(String)
    : [];
  const clearedWebCount =
    sessionRaw?.clearedWebCount == null
      ? clearedWebIdsRaw.length
      : Math.max(0, Math.floor(Number(sessionRaw.clearedWebCount) || 0));
  const webCount =
    sessionRaw?.webCount == null ? null : Number(sessionRaw.webCount);
  const remainingWebCount =
    sessionRaw?.remainingWebCount == null
      ? Math.max(0, (webCount ?? 0) - clearedWebCount)
      : Math.max(0, Math.floor(Number(sessionRaw.remainingWebCount) || 0));
  const resultRaw = raw.result;
  const reasonRaw = resultRaw?.reason;
  const reason =
    reasonRaw === "time_expired" || reasonRaw === "all_webs_cleared"
      ? reasonRaw
      : null;
  // Live T / n / rate always from ledger — ignore stale excessPresetSeconds.
  const live = deriveExcessLiveFields(raw.excessSeconds);
  return {
    excessSeconds: live.excessSeconds,
    // Production financial wall-clock — never derive from preset T.
    excessElapsedMs: (() => {
      const n = Number(raw.excessElapsedMs);
      return Number.isFinite(n) && n > 0 ? n : 0;
    })(),
    excessBaseIncome: Number(raw.excessBaseIncome) || 0,
    excessFinanciallyValid:
      raw.excessFinanciallyValid == null
        ? live.excessSeconds <= 0 || (Number(raw.excessElapsedMs) || 0) > 0
        : !!raw.excessFinanciallyValid,
    excessCycle: live.excessCycle,
    excessAvailable: live.excessAvailable,
    excessPresetSeconds: live.excessPresetSeconds,
    excessRate: live.excessRate,
    session: {
      active: !!sessionRaw?.active,
      version:
        sessionRaw?.version == null
          ? null
          : Math.floor(Number(sessionRaw.version) || 0) || null,
      startedAt:
        sessionRaw?.startedAt == null ? null : Number(sessionRaw.startedAt) || null,
      sourceSeconds:
        sessionRaw?.sourceSeconds == null
          ? null
          : Number(sessionRaw.sourceSeconds),
      sourceElapsedMs:
        sessionRaw?.sourceElapsedMs == null
          ? null
          : Number(sessionRaw.sourceElapsedMs),
      capital:
        sessionRaw?.capital == null ? null : Number(sessionRaw.capital),
      baseIncome:
        sessionRaw?.baseIncome == null ? null : Number(sessionRaw.baseIncome),
      baseWebCleared: !!sessionRaw?.baseWebCleared,
      baseWebCollectionMode:
        sessionRaw?.baseWebCollectionMode === "manual" ||
        sessionRaw?.baseWebCollectionMode === "automatic"
          ? sessionRaw.baseWebCollectionMode
          : null,
      presetSeconds:
        sessionRaw?.presetSeconds == null
          ? null
          : Number(sessionRaw.presetSeconds) || null,
      rate: sessionRaw?.rate == null ? null : Number(sessionRaw.rate),
      webCount,
      whiteWebCount:
        sessionRaw?.whiteWebCount == null
          ? webCount
          : Number(sessionRaw.whiteWebCount),
      layoutSeed:
        sessionRaw?.layoutSeed == null ? null : Number(sessionRaw.layoutSeed),
      clearedWebIds: clearedWebIdsRaw,
      clearedWebCount,
      remainingWebCount,
      specialWebId:
        sessionRaw?.specialWebId == null
          ? null
          : String(sessionRaw.specialWebId),
      baseWebId:
        sessionRaw?.baseWebId == null ? null : String(sessionRaw.baseWebId),
      specialCleared: !!sessionRaw?.specialCleared,
      bonusRawUnlocked:
        sessionRaw?.bonusRawUnlocked == null
          ? null
          : Number(sessionRaw.bonusRawUnlocked),
      xpAwarded:
        sessionRaw?.xpAwarded == null
          ? null
          : Math.max(0, Math.floor(Number(sessionRaw.xpAwarded) || 0)),
      webs: websRaw.map((w, i) => {
        const id = String(w?.id ?? `web-${i}`);
        const isBase =
          w?.kind === "base_income" ||
          w?.kind === "special" ||
          w?.type === "base_income" ||
          w?.type === "special" ||
          id === "base-income-web" ||
          id === "web-special";
        return {
          id,
          x: Number(w?.x) || 0,
          y: Number(w?.y) || 0,
          size: Number(w?.size) || 1,
          rotation: Number(w?.rotation) || 0,
          kind: isBase
            ? id === "base-income-web" || w?.kind === "base_income" || w?.type === "base_income"
              ? ("base_income" as const)
              : ("special" as const)
            : ("regular" as const),
          type: isBase
            ? id === "base-income-web" || w?.type === "base_income" || w?.kind === "base_income"
              ? ("base_income" as const)
              : ("special" as const)
            : ("regular" as const),
          cleared: !!w?.cleared,
        };
      }),
    },
    result: {
      available: !!resultRaw?.available,
      sessionVersion:
        resultRaw?.sessionVersion == null
          ? null
          : Math.floor(Number(resultRaw.sessionVersion) || 0) || null,
      finishedAt:
        resultRaw?.finishedAt == null
          ? null
          : Number(resultRaw.finishedAt) || null,
      reason,
      clearedCount:
        resultRaw?.clearedCount == null
          ? null
          : Math.max(0, Math.floor(Number(resultRaw.clearedCount) || 0)),
      clearedWhiteCount:
        resultRaw?.clearedWhiteCount == null
          ? resultRaw?.clearedCount == null
            ? null
            : Math.max(0, Math.floor(Number(resultRaw.clearedCount) || 0))
          : Math.max(0, Math.floor(Number(resultRaw.clearedWhiteCount) || 0)),
      webCount:
        resultRaw?.webCount == null
          ? null
          : Math.max(0, Math.floor(Number(resultRaw.webCount) || 0)),
      whiteWebCount:
        resultRaw?.whiteWebCount == null
          ? resultRaw?.webCount == null
            ? null
            : Math.max(0, Math.floor(Number(resultRaw.webCount) || 0))
          : Math.max(0, Math.floor(Number(resultRaw.whiteWebCount) || 0)),
      skill:
        resultRaw?.skill == null ? null : Number(resultRaw.skill),
      sourceSeconds:
        resultRaw?.sourceSeconds == null
          ? null
          : Number(resultRaw.sourceSeconds),
      presetSeconds:
        resultRaw?.presetSeconds == null
          ? null
          : Number(resultRaw.presetSeconds) || null,
      rate: resultRaw?.rate == null ? null : Number(resultRaw.rate),
      xp: {
        max:
          resultRaw?.xp?.max == null ? null : Number(resultRaw.xp.max),
        raw:
          resultRaw?.xp?.raw == null ? null : Number(resultRaw.xp.raw),
        awarded:
          resultRaw?.xp?.awarded == null
            ? null
            : Math.max(0, Math.floor(Number(resultRaw.xp.awarded) || 0)),
        applied: !!resultRaw?.xp?.applied,
      },
      income: {
        available: !!resultRaw?.income?.available,
        reason:
          resultRaw?.income?.reason === "ok" ||
          resultRaw?.income?.reason === "missing_excess_elapsed_history" ||
          resultRaw?.income?.reason === "zero"
            ? resultRaw.income.reason
            : null,
        capital:
          resultRaw?.income?.capital == null
            ? null
            : Number(resultRaw.income.capital),
        excessElapsedMs:
          resultRaw?.income?.excessElapsedMs == null
            ? null
            : Number(resultRaw.income.excessElapsedMs),
        annualRate:
          resultRaw?.income?.annualRate == null
            ? null
            : Number(resultRaw.income.annualRate),
        gross:
          resultRaw?.income?.gross == null
            ? null
            : Number(resultRaw.income.gross),
        paymentFactor:
          resultRaw?.income?.paymentFactor == null
            ? null
            : Number(resultRaw.income.paymentFactor),
        paid:
          resultRaw?.income?.paid == null
            ? null
            : Number(resultRaw.income.paid),
        applied: !!resultRaw?.income?.applied,
        base: {
          amount:
            resultRaw?.income?.base?.amount == null
              ? null
              : Number(resultRaw.income.base.amount),
          collectionMode:
            resultRaw?.income?.base?.collectionMode === "manual" ||
            resultRaw?.income?.base?.collectionMode === "automatic"
              ? resultRaw.income.base.collectionMode
              : null,
          applied: !!resultRaw?.income?.base?.applied,
        },
        bonus: {
          gross:
            resultRaw?.income?.bonus?.gross == null
              ? resultRaw?.income?.gross == null
                ? null
                : Number(resultRaw.income.gross)
              : Number(resultRaw.income.bonus.gross),
          skill:
            resultRaw?.income?.bonus?.skill == null
              ? resultRaw?.skill == null
                ? null
                : Number(resultRaw.skill)
              : Number(resultRaw.income.bonus.skill),
          paid:
            resultRaw?.income?.bonus?.paid == null
              ? null
              : Number(resultRaw.income.bonus.paid),
          applied: !!resultRaw?.income?.bonus?.applied,
        },
        total: {
          paid:
            resultRaw?.income?.total?.paid == null
              ? resultRaw?.income?.paid == null
                ? null
                : Number(resultRaw.income.paid)
              : Number(resultRaw.income.total.paid),
          applied: !!(
            resultRaw?.income?.total?.applied ?? resultRaw?.income?.applied
          ),
        },
      },
    },
  };
}

const btnStyle = (busy: boolean, activeKey: string | null, key: string) => ({
  background: "#313244",
  color: "#cdd6f4",
  border: "1px solid #45475a",
  borderRadius: 6,
  padding: "5px 8px",
  fontSize: "0.68rem",
  fontWeight: 600,
  cursor: busy ? ("wait" as const) : ("pointer" as const),
  opacity: busy && activeKey !== key ? 0.55 : 1,
  textAlign: "left" as const,
  fontFamily: "monospace",
});

/**
 * Dev-only Economy v2 energy + roots + excess debug controls.
 * Mounted only under `import.meta.env.DEV` (see GamePage).
 */
export default function EconomyV2EnergyDebugControls({
  energySeconds,
  readyMask = "0",
  readyCount,
  excess: excessRaw,
  onEnergyApplied,
  onRootsApplied,
  onExcessApplied,
}: Props) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const serverReady =
    typeof readyCount === "number" && Number.isFinite(readyCount)
      ? Math.max(0, Math.floor(readyCount))
      : readyCountOf(readyMask);

  const excess = normalizeV2Excess(excessRaw);

  async function runEnergy(key: string, body: EnergyPatch) {
    if (busyKey != null) return;
    setBusyKey(key);
    setError(null);
    try {
      const res = await api.debugEconomyV2Energy(body);
      if (!res.game.v2Roots) {
        throw new Error("debug energy response missing game.v2Roots");
      }
      onEnergyApplied({
        v2EnergySeconds: res.game.v2EnergySeconds,
        v2EnergyAnchorAt: res.game.v2EnergyAnchorAt,
        lastSessionTime: res.game.lastSessionTime,
        missedSessions: res.game.missedSessions,
        v2Roots: normalizeV2Roots(res.game.v2Roots),
      });
    } catch (e: any) {
      const status = e?.status != null ? `HTTP ${e.status}` : "ошибка";
      const msg = e?.message ? String(e.message) : "запрос не удался";
      setError(`${status}: ${msg}`);
    } finally {
      setBusyKey(null);
    }
  }

  async function runRoots(key: string, body: RootsAction) {
    if (busyKey != null) return;
    setBusyKey(key);
    setError(null);
    try {
      const res = await api.debugEconomyV2Roots(body);
      onRootsApplied({
        v2Roots: normalizeV2Roots(res.roots ?? res.game.v2Roots),
        v2EnergySeconds: res.energySeconds,
        v2EnergyAnchorAt: res.anchorAt,
      });
    } catch (e: any) {
      const status = e?.status != null ? `HTTP ${e.status}` : "ошибка";
      const msg = e?.message ? String(e.message) : "запрос не удался";
      setError(`${status}: ${msg}`);
    } finally {
      setBusyKey(null);
    }
  }

  async function runExcess(key: string, body: ExcessAction) {
    if (busyKey != null) return;
    setBusyKey(key);
    setError(null);
    try {
      const res = await api.debugEconomyV2Excess(body);
      onExcessApplied({
        v2Excess: normalizeV2Excess(res.excess ?? res.game.v2Excess),
      });
    } catch (e: any) {
      const status = e?.status != null ? `HTTP ${e.status}` : "ошибка";
      const msg = e?.message ? String(e.message) : "запрос не удался";
      setError(`${status}: ${msg}`);
    } finally {
      setBusyKey(null);
    }
  }

  async function refreshExcessFromState() {
    const data = await api.getState();
    if (data.game?.v2Excess) {
      onExcessApplied({
        v2Excess: normalizeV2Excess(data.game.v2Excess),
      });
    }
  }

  async function runExcessStart(key: string) {
    if (busyKey != null) return;
    if (!isExcessStartEnabled(excess, false)) return;
    setBusyKey(key);
    setError(null);
    try {
      const res = await api.startEconomyV2ExcessSession();
      onExcessApplied({
        v2Excess: normalizeV2Excess(res.excess),
      });
    } catch (e: any) {
      const code = e?.code != null ? String(e.code) : "";
      if (
        code === "excess_not_available" ||
        code === "excess_session_already_active"
      ) {
        try {
          await refreshExcessFromState();
        } catch {
          // keep previous display if refresh fails
        }
      }
      const status = e?.status != null ? `HTTP ${e.status}` : "ошибка";
      const msg = e?.message ? String(e.message) : "запрос не удался";
      setError(`${status}: ${msg}`);
    } finally {
      setBusyKey(null);
    }
  }

  async function runExcessResetSession(key: string) {
    if (busyKey != null) return;
    if (!isExcessResetSessionEnabled(excess, false)) return;
    setBusyKey(key);
    setError(null);
    try {
      const res = await api.debugEconomyV2Excess({ action: "resetSession" });
      onExcessApplied({
        v2Excess: normalizeV2Excess(res.excess ?? res.game.v2Excess),
      });
    } catch (e: any) {
      const status = e?.status != null ? `HTTP ${e.status}` : "ошибка";
      const msg = e?.message ? String(e.message) : "запрос не удался";
      setError(`${status}: ${msg}`);
    } finally {
      setBusyKey(null);
    }
  }

  const busy = busyKey != null;
  const session = excess.session ?? {
    active: false,
    startedAt: null,
    sourceSeconds: null,
    sourceElapsedMs: null,
    capital: null,
    presetSeconds: null,
    rate: null,
    webCount: null,
    layoutSeed: null,
    webs: [],
  };
  const result = excess.result ?? {
    available: false,
    finishedAt: null,
    reason: null,
    clearedCount: null,
    webCount: null,
    skill: null,
    sourceSeconds: null,
    presetSeconds: null,
    rate: null,
    xp: {
      max: null,
      raw: null,
      awarded: null,
      applied: false,
    },
    income: {
      available: false,
      reason: null,
      capital: null,
      excessElapsedMs: null,
      annualRate: null,
      gross: null,
      paymentFactor: null,
      paid: null,
      applied: false,
    },
  };
  const canStart = isExcessStartEnabled(excess, busy);
  const canResetSession = isExcessResetSessionEnabled(excess, busy);

  return (
    <div className="v2-energy-debug" data-debug-panel="economy-v2">
      <div style={{ color: "#f9e2af", fontSize: "0.68rem", fontWeight: 700, marginBottom: 4 }}>
        Отладка · энергия
      </div>
      <div style={{ color: "#cdd6f4", fontSize: "0.78rem", marginBottom: 5 }}>
        {formatDebugBankLabel(energySeconds)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {ENERGY_ACTIONS.map((a) => (
          <button
            key={a.key}
            type="button"
            disabled={busy}
            onClick={() => void runEnergy(a.key, a.body)}
            style={btnStyle(busy, busyKey, a.key)}
          >
            {busyKey === a.key ? "…" : a.label}
          </button>
        ))}
      </div>

      <div
        style={{
          color: "#f9e2af",
          fontSize: "0.68rem",
          fontWeight: 700,
          marginTop: 8,
          marginBottom: 4,
        }}
      >
        Отладка корней
      </div>
      <div style={{ color: "#cdd6f4", fontSize: "0.78rem", marginBottom: 5 }}>
        Готово секций: {serverReady} / 60
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {ROOTS_ACTIONS.map((a) => (
          <button
            key={a.key}
            type="button"
            disabled={busy}
            onClick={() => void runRoots(a.key, a.body)}
            style={btnStyle(busy, busyKey, a.key)}
          >
            {busyKey === a.key ? "…" : a.label}
          </button>
        ))}
      </div>

      <div
        className="v2-excess-debug"
        data-debug-section="excess"
        style={{
          color: "#f9e2af",
          fontSize: "0.68rem",
          fontWeight: 700,
          marginTop: 8,
          marginBottom: 4,
        }}
      >
        Избыток (раздельные поля)
      </div>
      <div
        data-excess-seconds="true"
        style={{ color: "#cdd6f4", fontSize: "0.72rem", marginBottom: 2 }}
      >
        Ledger (игр.сек, ∞): {formatExcessSecondsDisplay(excess.excessSeconds)}
      </div>
      <div
        data-excess-preset="true"
        style={{ color: "#a6e3a1", fontSize: "0.72rem", marginBottom: 2 }}
      >
        Пресет Метёлки T: {excess.excessPresetSeconds} сек
      </div>
      <div
        data-excess-cycle="true"
        style={{ color: "#cdd6f4", fontSize: "0.68rem", marginBottom: 2 }}
      >
        Цикл n: {formatExcessCycleDisplay(excess.excessCycle)}
      </div>
      <div
        data-excess-elapsed="true"
        style={{ color: "#cdd6f4", fontSize: "0.68rem", marginBottom: 2 }}
      >
        t_excess (стена):{" "}
        {formatExcessElapsedMsDisplay(excess.excessElapsedMs ?? 0)}
      </div>
      <div
        data-excess-base-income="true"
        style={{ color: "#cdd6f4", fontSize: "0.68rem", marginBottom: 2 }}
      >
        D_base: {Number(excess.excessBaseIncome ?? 0).toFixed(4)}
      </div>
      <div
        data-excess-rate="true"
        style={{ color: "#cdd6f4", fontSize: "0.68rem", marginBottom: 5 }}
      >
        r_excess: {formatExcessRatePercent(excess.excessRate)} · Метёлка:{" "}
        {excess.excessAvailable ? "Да" : "Нет"}
      </div>
      <div
        style={{
          color: "#89b4fa",
          fontSize: "0.62rem",
          marginBottom: 3,
          lineHeight: 1.3,
        }}
      >
        Добавить секунды избытка:
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {EXCESS_PRESET_ACTIONS.map((a) => (
          <button
            key={a.key}
            type="button"
            disabled={busy}
            data-excess-action={a.key}
            data-excess-add-preset-seconds={String(
              a.body.action === "addPresetSeconds" ? a.body.seconds : "",
            )}
            onClick={() => void runExcess(a.key, a.body)}
            style={btnStyle(busy, busyKey, a.key)}
          >
            {busyKey === a.key ? "…" : a.label}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 6 }}>
        {EXCESS_ACTIONS.map((a) => (
          <button
            key={a.key}
            type="button"
            disabled={busy}
            data-excess-action={a.key}
            onClick={() => void runExcess(a.key, a.body)}
            style={btnStyle(busy, busyKey, a.key)}
          >
            {busyKey === a.key ? "…" : a.label}
          </button>
        ))}
      </div>

      {SHOW_EXCESS_SESSION_DEBUG_UI && (
        <>
          <div
            style={{
              color: "#a6adc8",
              fontSize: "0.62rem",
              lineHeight: 1.35,
              marginTop: 5,
              marginBottom: 5,
              fontFamily: "monospace",
            }}
          >
            <div data-excess-financial="true">
              Финансово:{" "}
              {excess.excessFinanciallyValid === false ? "Нет (synthetic)" : "Да"}
            </div>
            <div data-excess-session-version="true">
              session version: {excess.session?.version ?? "—"}
            </div>
          </div>

          <div
            data-excess-session="true"
            style={{
              color: "#a6adc8",
              fontSize: "0.62rem",
              lineHeight: 1.35,
              marginTop: 8,
              marginBottom: 5,
              fontFamily: "monospace",
            }}
          >
            <div
              style={{
                color: "#f9e2af",
                fontSize: "0.68rem",
                fontWeight: 700,
                marginBottom: 3,
              }}
            >
              Сессия Метёлки
            </div>
            <div data-excess-session-status="true">
              Статус:{" "}
              {session.active
                ? "Активна"
                : result.available
                  ? "Завершена"
                  : "Нет результата"}
            </div>
            <div data-excess-session-finish-reason="true">
              Причина:{" "}
              {result.available
                ? result.reason === "all_webs_cleared"
                  ? "all_webs_cleared"
                  : result.reason === "time_expired"
                    ? "time_expired"
                    : "—"
                : "—"}
            </div>
            <div data-excess-session-started="true">
              Начало: {formatExcessSessionStartedAt(session.startedAt)}
            </div>
            <div data-excess-session-source="true">
              Источник:{" "}
              {session.sourceSeconds == null && result.sourceSeconds == null
                ? "—"
                : formatExcessSecondsDisplay(
                    session.sourceSeconds ?? result.sourceSeconds ?? 0,
                  )}
            </div>
            <div data-excess-session-source-elapsed="true">
              Source elapsed:{" "}
              {session.sourceElapsedMs == null &&
              result.income?.excessElapsedMs == null
                ? "—"
                : formatExcessElapsedMsDisplay(
                    session.sourceElapsedMs ??
                      result.income?.excessElapsedMs ??
                      0,
                  )}
            </div>
            <div data-excess-session-capital="true">
              Капитал K:{" "}
              {session.capital == null && result.income?.capital == null
                ? "—"
                : String(session.capital ?? result.income?.capital)}
            </div>
            <div data-excess-session-preset="true">
              Пресет:{" "}
              {(session.presetSeconds ?? result.presetSeconds) == null
                ? "—"
                : `${session.presetSeconds ?? result.presetSeconds} сек`}
            </div>
            <div data-excess-session-rate="true">
              Ставка:{" "}
              {(session.rate ?? result.rate) == null
                ? "—"
                : formatExcessRatePercent(session.rate ?? result.rate ?? 0)}
            </div>
            <div data-excess-session-webs="true">
              Паутин:{" "}
              {session.active
                ? session.webCount == null
                  ? "—"
                  : session.webCount
                : result.available
                  ? (result.webCount ?? "—")
                  : session.webCount == null
                    ? "—"
                    : session.webCount}
            </div>
            <div data-excess-session-cleared="true">
              Очищено:{" "}
              {session.active
                ? `${session.clearedWebCount ?? 0} / ${session.webCount ?? 0}`
                : result.available
                  ? `${result.clearedCount ?? 0} / ${result.webCount ?? 0}`
                  : "—"}
            </div>
            <div data-excess-session-remaining="true">
              Осталось:{" "}
              {session.active ? (session.remainingWebCount ?? 0) : "—"}
            </div>
            <div data-excess-session-skill="true">
              Skill:{" "}
              {result.available && result.skill != null
                ? `${Math.round(Math.min(1, Math.max(0, Number(result.skill))) * 100)}%`
                : "—"}
            </div>
            <div data-excess-session-xp-max="true">
              XP max:{" "}
              {result.available && result.xp?.max != null
                ? Number(result.xp.max).toFixed(2)
                : "—"}
            </div>
            <div data-excess-session-xp-raw="true">
              XP raw:{" "}
              {result.available && result.xp?.raw != null
                ? Number(result.xp.raw).toFixed(2)
                : "—"}
            </div>
            <div data-excess-session-xp-awarded="true">
              XP начислено:{" "}
              {result.available && result.xp?.awarded != null
                ? result.xp.awarded
                : "—"}
            </div>
            <div data-excess-session-xp-applied="true">
              XP применён:{" "}
              {result.available ? (result.xp?.applied ? "Да" : "Нет") : "—"}
            </div>
            <div data-excess-result-version="true">
              result version: {result.sessionVersion ?? "—"}
            </div>
            <div data-excess-income-base="true">
              base:{" "}
              {result.available && result.income?.base?.amount != null
                ? `${Number(result.income.base.amount).toFixed(4)} (${result.income.base.collectionMode ?? "—"})`
                : "—"}
            </div>
            <div data-excess-income-bonus-gross="true">
              bonus gross:{" "}
              {result.available && result.income?.bonus?.gross != null
                ? Number(result.income.bonus.gross).toFixed(6)
                : result.available && result.income?.gross != null
                  ? Number(result.income.gross).toFixed(6)
                  : result.available && result.income?.reason
                    ? result.income.reason
                    : "—"}
            </div>
            <div data-excess-income-bonus-skill="true">
              Skill:{" "}
              {result.available && result.income?.bonus?.skill != null
                ? Number(result.income.bonus.skill).toFixed(4)
                : result.available && result.skill != null
                  ? Number(result.skill).toFixed(4)
                  : "—"}
            </div>
            <div data-excess-income-bonus-paid="true">
              bonus paid:{" "}
              {result.available && result.income?.bonus?.paid != null
                ? Number(result.income.bonus.paid).toFixed(6)
                : "—"}
            </div>
            <div data-excess-income-total="true">
              total:{" "}
              {result.available && result.income?.total?.paid != null
                ? Number(result.income.total.paid).toFixed(6)
                : result.available && result.income?.paid != null
                  ? Number(result.income.paid).toFixed(6)
                  : "—"}
            </div>
            <div data-excess-income-factor="true">
              Factor:{" "}
              {result.available && result.income?.paymentFactor != null
                ? Number(result.income.paymentFactor).toFixed(4)
                : "—"}
            </div>
            <div data-excess-income-applied="true">
              applied:{" "}
              {result.available
                ? result.income?.total?.applied || result.income?.applied
                  ? "Да"
                  : "Нет"
                : "—"}
            </div>
            <div data-excess-session-seed="true">
              Seed:{" "}
              {session.layoutSeed == null
                ? "—"
                : String(session.layoutSeed).slice(0, 10)}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <button
              type="button"
              disabled={!canStart}
              data-excess-action="start"
              onClick={() => void runExcessStart("xstart")}
              style={{
                ...btnStyle(busy, busyKey, "xstart"),
                opacity: canStart ? 1 : 0.45,
                cursor: canStart ? (busy ? "wait" : "pointer") : "not-allowed",
              }}
            >
              {busyKey === "xstart" ? "…" : "Запустить Метёлку"}
            </button>
            <button
              type="button"
              disabled={!canResetSession}
              data-excess-action="resetSession"
              onClick={() => void runExcessResetSession("xresetSession")}
              style={{
                ...btnStyle(busy, busyKey, "xresetSession"),
                opacity: canResetSession ? 1 : 0.45,
                cursor: canResetSession
                  ? busy
                    ? "wait"
                    : "pointer"
                  : "not-allowed",
              }}
            >
              {busyKey === "xresetSession" ? "…" : "Сбросить сессию"}
            </button>
          </div>
        </>
      )}

      {error && (
        <div
          data-debug-error="true"
          style={{ color: "#f38ba8", fontSize: "0.62rem", marginTop: 4, lineHeight: 1.3 }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

/** Merge energy debug response into UserState without dropping other fields. */
export function applyEconomyV2EnergyToState(
  state: UserState,
  patch: {
    v2EnergySeconds: number;
    v2EnergyAnchorAt: number;
    lastSessionTime: number | null;
    missedSessions: number;
    /** Fresh roots snapshot after bank debug — required (no bank-only partial). */
    v2Roots: EconomyV2RootsState;
  },
): UserState {
  return {
    ...state,
    game: {
      ...state.game,
      v2EnergySeconds: patch.v2EnergySeconds,
      v2EnergyAnchorAt: patch.v2EnergyAnchorAt,
      lastSessionTime: patch.lastSessionTime,
      missedSessions: patch.missedSessions,
      v2Roots: normalizeV2Roots(patch.v2Roots),
    },
  };
}

/** Merge server roots-debug response into UserState (mask from server only). */
export function applyEconomyV2RootsDebugToState(
  state: UserState,
  patch: {
    v2Roots: EconomyV2RootsState;
    v2EnergySeconds: number;
    v2EnergyAnchorAt: number;
  },
): UserState {
  return {
    ...state,
    game: {
      ...state.game,
      v2Roots: normalizeV2Roots(patch.v2Roots),
      v2EnergySeconds: patch.v2EnergySeconds,
      v2EnergyAnchorAt: patch.v2EnergyAnchorAt,
    },
  };
}

/** Merge excess response into UserState (excess + optional absolute XP/balances). */
export function applyEconomyV2ExcessDebugToState(
  state: UserState,
  patch: {
    v2Excess?: EconomyV2ExcessState;
    playerXp?: number;
    playerLevel?: number;
    balances?: { balance: number; earned: number };
  },
): UserState {
  return {
    ...state,
    ...(patch.balances
      ? {
          balances: {
            ...state.balances,
            balance: Number(patch.balances.balance) || 0,
            earned: Number(patch.balances.earned) || 0,
          },
        }
      : {}),
    game: {
      ...state.game,
      ...(patch.v2Excess != null
        ? { v2Excess: normalizeV2Excess(patch.v2Excess) }
        : {}),
      ...(patch.playerXp != null
        ? { playerXP: Math.max(0, Math.floor(Number(patch.playerXp) || 0)) }
        : {}),
      ...(patch.playerLevel != null
        ? {
            playerLevel: Math.max(
              1,
              Math.floor(Number(patch.playerLevel) || 1),
            ),
          }
        : {}),
    },
  };
}
