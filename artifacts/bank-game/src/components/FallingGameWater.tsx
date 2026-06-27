import { useEffect, useRef, useCallback, useState } from "react";
import GameTimer from "./GameTimer";

export type GameType = "water" | "sun" | "fertilizer";

interface Props {
  type?: GameType;
  onComplete: (skillScore: number) => void;
  bonusSeconds?: number;
}

const CONFIGS = {
  water: {
    bg:          "rgba(239,246,255,0.97)",
    timerBg:     "#dbeafe",
    timerColor:  "#3b82f6",
    scoreFg:     "#1e40af",
    scoreEmoji:  "💧",
    dropColor:   "#3b82f6",
    dropShadow:  "rgba(59,130,246,0.15)",
    barColor:    "#2563eb",
    resultColor: "#1d4ed8",
    border:      "2px solid #bfdbfe",
  },
  sun: {
    bg:          "rgba(255,251,235,0.97)",
    timerBg:     "#fef3c7",
    timerColor:  "#f59e0b",
    scoreFg:     "#92400e",
    scoreEmoji:  "☀️",
    dropColor:   "#f59e0b",
    dropShadow:  "rgba(245,158,11,0.15)",
    barColor:    "#d97706",
    resultColor: "#92400e",
    border:      "2px solid #fde68a",
  },
  fertilizer: {
    bg:          "rgba(240,253,244,0.97)",
    timerBg:     "#dcfce7",
    timerColor:  "#22c55e",
    scoreFg:     "#166534",
    scoreEmoji:  "🌱",
    dropColor:   "#22c55e",
    dropShadow:  "rgba(34,197,94,0.15)",
    barColor:    "#16a34a",
    resultColor: "#166534",
    border:      "2px solid #bbf7d0",
  },
} as const;

const GAME_MS     = 15_000;
const TOTAL_DROPS = 32;
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

function makeDrop(id: number, gameDuration: number) {
  const spawnAt = (id / TOTAL_DROPS) * (gameDuration * 0.87) + (Math.random() * 300 - 150);
  return {
    id,
    x:       DROP_R + Math.random() * (W - DROP_R * 2),
    y:       -DROP_R,
    spawnAt: Math.max(0, spawnAt),
    active:  false,
    caught:  false,
  };
}

type Drop = ReturnType<typeof makeDrop>;

export default function FallingGameWater({ type = "water", onComplete, bonusSeconds = 0 }: Props) {
  const totalMs = GAME_MS + bonusSeconds * 1000;
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const barX       = useRef(W / 2);
  const doneRef    = useRef(false);
  const [timerMs, setTimerMs]     = useState(totalMs);
  const [catchCount, setCatchCount] = useState(0);
  const [result, setResult]       = useState<{ catches: number; skillScore: number } | null>(null);

  useEffect(() => {
    const id = setInterval(() => setTimerMs(t => Math.max(0, t - 100)), 100);
    return () => clearInterval(id);
  }, []);

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
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cfg = CONFIGS[type];
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.style.cursor = "none";

    const SPAWN_INTERVAL = GAME_MS / TOTAL_DROPS;
    const activeDrops: Drop[] = [];
    let dropIdCounter = 0;
    let catches = 0;
    let lastSpawnAt = -SPAWN_INTERVAL;
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
      const skillScore = Math.min(80, Math.round((Math.min(catches, TOTAL_DROPS) / TOTAL_DROPS) * 80));
      console.log(`[FallingGame:${type}] catches: ${catches}/${TOTAL_DROPS}  skillScore: ${skillScore}/80`);
      setResult({ catches, skillScore });
    }

    function frame(ts: number) {
      if (doneRef.current) return;
      if (lastTs < 0) lastTs = ts;
      const dt      = Math.min(ts - lastTs, 50) / 1000;
      lastTs        = ts;
      const elapsed = ts - start;

      if (elapsed >= totalMs) { finish(); return; }

      while (elapsed - lastSpawnAt >= SPAWN_INTERVAL) {
        lastSpawnAt += SPAWN_INTERVAL;
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
            setCatchCount(Math.min(catches, TOTAL_DROPS));
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
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  const cfg = CONFIGS[type];

  return (
    <div className="mini-game-card" style={{ background: cfg.bg, border: cfg.border }}>
      <div className="mini-game-header">
        <GameTimer timeLeftMs={timerMs} totalMs={totalMs} color={cfg.timerColor} trackColor={cfg.timerBg} />
        <div className="mini-game-counter">
          <span>{cfg.scoreEmoji}</span>
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
          onClick={() => onComplete(result.skillScore)}
        >
          <button
            className="mini-game-result-close"
            onClick={e => { e.stopPropagation(); onComplete(result.skillScore); }}
          >✕</button>
          <span className="mini-game-result-emoji">{cfg.scoreEmoji}</span>
          <p className="mini-game-result-count" style={{ color: cfg.resultColor }}>
            Поймано: {result.catches}
          </p>
          <p className="mini-game-result-label">{feedbackLabel(result.catches)}</p>
        </div>
      )}
    </div>
  );
}
