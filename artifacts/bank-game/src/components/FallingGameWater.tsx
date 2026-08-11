import { useEffect, useRef, useCallback, useState } from "react";
import { Droplets, Sun } from "lucide-react";
import GameTimer from "./GameTimer";
import FertilizerIcon from "./FertilizerIcon";
import {
  buildWaterV1LegacyPreset,
  type WaterPreset,
} from "@/lib/gamePresets/waterPresets";
import { V3_ACTIVITY_ACCENT_COLORS } from "@/lib/v3ActivityColors";

export type GameType = "water" | "sun" | "fertilizer";

interface Props {
  type?: GameType;
  onComplete: (skillScore: number, count: number) => void;
  /** @deprecated Prefer `preset.durationSec` (includes streak bonus in v1 legacy preset). */
  bonusSeconds?: number;
  preset?: WaterPreset;
}

const CONFIGS = {
  water: {
    bg:          "rgba(239,246,255,0.97)",
    timerBg:     "#dbeafe",
    timerColor:  V3_ACTIVITY_ACCENT_COLORS.water,
    scoreFg:     "#1e40af",
    dropColor:   V3_ACTIVITY_ACCENT_COLORS.water,
    dropShadow:  "rgba(43,127,255,0.22)",
    barColor:    "#1565e0",
    resultColor: "#1d4ed8",
    border:      "2px solid #93c5fd",
  },
  sun: {
    bg:          "rgba(255,251,235,0.97)",
    timerBg:     "#fef3c7",
    timerColor:  V3_ACTIVITY_ACCENT_COLORS.sun,
    scoreFg:     "#92400e",
    dropColor:   V3_ACTIVITY_ACCENT_COLORS.sun,
    dropShadow:  "rgba(255,193,7,0.22)",
    barColor:    "#e8900c",
    resultColor: "#92400e",
    border:      "2px solid #fcd34d",
  },
  fertilizer: {
    bg:          "rgba(240,253,244,0.97)",
    timerBg:     "#dcfce7",
    timerColor:  "#22c55e",
    scoreFg:     "#166534",
    dropColor:   "#22c55e",
    dropShadow:  "rgba(34,197,94,0.15)",
    barColor:    "#16a34a",
    resultColor: "#166534",
    border:      "2px solid #bbf7d0",
  },
} as const;

function ScoreIcon({ type, size }: { type: GameType; size: number }) {
  if (type === "water") {
    return (
      <Droplets
        size={size}
        strokeWidth={2.25}
        color={V3_ACTIVITY_ACCENT_COLORS.water}
      />
    );
  }
  if (type === "sun") {
    return (
      <Sun
        size={size}
        strokeWidth={2.25}
        color={V3_ACTIVITY_ACCENT_COLORS.sun}
      />
    );
  }
  return (
    <FertilizerIcon
      size={size}
      filled={false}
      color={V3_ACTIVITY_ACCENT_COLORS.fertilizer}
    />
  );
}

const DROP_R      = 11;
const BAR_W       = 88;
const BAR_H       = 11;
const W           = 296;
const H           = 348;
const BAR_Y       = H - 28;
const DROP_SPEED  = 100;

function feedbackLabel(n: number): string {
  if (n >= 20) return "Отлично!";
  if (n >= 10) return "Хорошо";
  return "Попробуйте ещё";
}

interface Drop {
  id: number;
  x: number;
  y: number;
  spawnAt: number;
  active: boolean;
  caught: boolean;
}

export default function FallingGameWater({
  type = "water",
  onComplete,
  bonusSeconds = 0,
  preset,
}: Props) {
  const activePreset = preset ?? buildWaterV1LegacyPreset(bonusSeconds);
  const totalMs = activePreset.durationSec * 1000;
  const totalDrops = activePreset.totalDrops;
  const spawnIntervalMs = activePreset.spawnIntervalMs;
  const uncappedSpawns = activePreset.id === "water-v1-legacy";

  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const barX            = useRef(W / 2);
  const doneRef         = useRef(false);
  const forceFinishRef  = useRef<() => void>(() => {});
  const [timerMs, setTimerMs]     = useState(totalMs);
  const [catchCount, setCatchCount] = useState(0);
  const [result, setResult]       = useState<{ catches: number; skillScore: number } | null>(null);

  useEffect(() => {
    setTimerMs(totalMs);
  }, [totalMs]);

  useEffect(() => {
    const id = setInterval(() => setTimerMs(t => Math.max(0, t - 100)), 100);
    return () => clearInterval(id);
  }, [totalMs]);

  const clampBar = (x: number) =>
    Math.max(BAR_W / 2, Math.min(W - BAR_W / 2, x));

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) barX.current = clampBar(e.clientX - rect.left);
  }, []);

  const onTouchMove = useCallback((e: TouchEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) barX.current = clampBar(e.touches[0].clientX - rect.left);
  }, []);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    const ctxEl = canvasEl.getContext("2d");
    if (!ctxEl) return;

    const canvas: HTMLCanvasElement = canvasEl;
    const ctx: CanvasRenderingContext2D = ctxEl;

    const cfg = CONFIGS[type];
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.style.cursor = "none";

    doneRef.current = false;
    const activeDrops: Drop[] = [];
    let dropIdCounter = 0;
    let catches = 0;
    let lastSpawnAt = -spawnIntervalMs;
    let rafId   = 0;
    let lastTs  = -1;
    const start = performance.now();

    function drawRoundedRect(x: number, y: number, w: number, h: number, r: number) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
    }

    function finish() {
      if (doneRef.current) return;
      doneRef.current = true;
      cancelAnimationFrame(rafId);
      canvas.style.cursor = "default";
      const skillScore = Math.min(
        100,
        Math.round((Math.min(catches, totalDrops) / totalDrops) * 100),
      );
      console.log(
        `[FallingGame:${type}] catches: ${catches}/${totalDrops}  skillScore: ${skillScore}/100  preset: ${activePreset.id}`,
      );
      setResult({ catches, skillScore });
    }
    forceFinishRef.current = finish;

    function frame(ts: number) {
      if (doneRef.current) return;
      if (lastTs < 0) lastTs = ts;
      const dt      = Math.min(ts - lastTs, 50) / 1000;
      lastTs        = ts;
      const elapsed = ts - start;

      if (elapsed >= totalMs) { finish(); return; }

      while (elapsed - lastSpawnAt >= spawnIntervalMs) {
        if (!uncappedSpawns && dropIdCounter >= totalDrops) break;
        lastSpawnAt += spawnIntervalMs;
        activeDrops.push({
          id: dropIdCounter++,
          x: DROP_R + Math.random() * (W - DROP_R * 2),
          y: -DROP_R,
          spawnAt: lastSpawnAt,
          active: true,
          caught: false,
        });
      }

      for (const d of activeDrops) {
        if (!d.active) continue;
        d.y += DROP_SPEED * dt;
        if (!d.caught && d.y + DROP_R >= BAR_Y - BAR_H && d.y - DROP_R <= BAR_Y + BAR_H) {
          const bx = barX.current;
          if (d.x >= bx - BAR_W / 2 - DROP_R && d.x <= bx + BAR_W / 2 + DROP_R) {
            d.caught = true;
            d.active = false;
            catches++;
            setCatchCount(catches);
            continue;
          }
        }
        if (d.y - DROP_R > H) { d.active = false; }
      }

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = cfg.bg;
      ctx.fillRect(0, 0, W, H);

      for (const d of activeDrops) {
        if (!d.active) continue;
        ctx.beginPath();
        ctx.arc(d.x + 2, d.y + 2, DROP_R, 0, Math.PI * 2);
        ctx.fillStyle = cfg.dropShadow;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(d.x, d.y, DROP_R, 0, Math.PI * 2);
        ctx.fillStyle = cfg.dropColor;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(d.x - 3, d.y - 3, 4, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.45)";
        ctx.fill();
      }

      const bx = barX.current;
      ctx.shadowColor   = "rgba(0,0,0,0.18)";
      ctx.shadowBlur    = 4;
      ctx.shadowOffsetY = 2;
      drawRoundedRect(bx - BAR_W / 2, BAR_Y - BAR_H / 2, BAR_W, BAR_H, BAR_H / 2);
      ctx.fillStyle = cfg.barColor;
      ctx.fill();
      ctx.shadowColor   = "transparent";
      ctx.shadowBlur    = 0;
      ctx.shadowOffsetY = 0;
      drawRoundedRect(bx - BAR_W / 2 + 6, BAR_Y - BAR_H / 2 + 2, BAR_W - 12, 3, 2);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fill();

      rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.style.cursor = "default";
    };
  }, [type, totalMs, totalDrops, spawnIntervalMs, uncappedSpawns, activePreset.id]);

  const cfg = CONFIGS[type];

  return (
    <div className="mini-game-card" style={{ background: cfg.bg, border: cfg.border }}>
      <div className="mini-game-top-bar">
        <button
          className="mini-game-force-close"
          style={{ color: cfg.timerColor }}
          onClick={() => result ? onComplete(result.skillScore, result.catches) : forceFinishRef.current()}
        >✕</button>
      </div>
      <div className="mini-game-header">
        <GameTimer timeLeftMs={timerMs} totalMs={totalMs} color={cfg.timerColor} trackColor={cfg.timerBg} />
        <div className="mini-game-counter">
          <ScoreIcon type={type} size={20} />
          <span className="mini-game-counter-val">{catchCount}</span>
        </div>
      </div>
      <div className="game-content">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onMouseMove={onMouseMove}
          style={{ display: "block", touchAction: "none", userSelect: "none" }}
        />
      </div>
      {result && (
        <div
          className="mini-game-result"
          style={{ background: cfg.bg }}
          onClick={() => onComplete(result.skillScore, result.catches)}
        >
          <span className="mini-game-result-emoji" aria-hidden="true">
            <ScoreIcon type={type} size={42} />
          </span>
          <p className="mini-game-result-count" style={{ color: cfg.resultColor }}>
            Поймано: {result.catches}
          </p>
          <p className="mini-game-result-label">{feedbackLabel(result.catches)}</p>
        </div>
      )}
    </div>
  );
}
