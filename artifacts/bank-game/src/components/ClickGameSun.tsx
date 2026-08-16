import { useEffect, useRef, useState } from "react";
import { Sun } from "lucide-react";
import GameTimer from "./GameTimer";
import { V3_ACTIVITY_ACCENT_COLORS } from "@/lib/v3ActivityColors";

interface Props {
  onComplete: (skillScore: number, count: number) => void;
  bonusSeconds?: number;
  /** Economy v2: absolute duration in whole seconds (overrides 15 + bonus). */
  durationSec?: number;
}

const GAME_MS = 15_000;
const SUN_R = 26;
const SUN_VISIBLE_MS = 800;
const SPAWN_MIN = 400;
const SPAWN_MAX = 900;
const SKILL_DENOM = 15;
const W = 296;
const H = 348;

const CFG = {
  bg: "rgba(255,251,235,0.97)",
  timerBg: "#fef3c7",
  timerColor: V3_ACTIVITY_ACCENT_COLORS.sun,
  border: "2px solid #fcd34d",
  scoreFg: "#92400e",
  resultColor: "#92400e",
};

function feedbackLabel(n: number): string {
  if (n >= 15) return "Отлично!";
  if (n >= 8) return "Хорошо";
  return "Попробуйте ещё";
}

function drawSun(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  alpha: number,
  scale: number,
) {
  const r = SUN_R * scale;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = V3_ACTIVITY_ACCENT_COLORS.sun;
  ctx.shadowBlur = 20;

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);

  const grad = ctx.createRadialGradient(
    x - r * 0.3,
    y - r * 0.3,
    r * 0.08,
    x,
    y,
    r,
  );

  grad.addColorStop(0, "#fef08a");
  grad.addColorStop(0.5, "#ffc107");
  grad.addColorStop(1, V3_ACTIVITY_ACCENT_COLORS.sun);

  ctx.fillStyle = grad;
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = V3_ACTIVITY_ACCENT_COLORS.sun;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";

  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;

    ctx.beginPath();
    ctx.moveTo(
      x + Math.cos(angle) * (r + 5),
      y + Math.sin(angle) * (r + 5),
    );
    ctx.lineTo(
      x + Math.cos(angle) * (r + 13),
      y + Math.sin(angle) * (r + 13),
    );
    ctx.stroke();
  }

  ctx.restore();
}

export default function ClickGameSun({ onComplete, bonusSeconds = 0, durationSec }: Props) {
  const resolvedSec = durationSec != null ? Math.max(1, Math.floor(durationSec)) : 15 + bonusSeconds;
  const totalMs = resolvedSec * 1000;
  const skillDenom = Math.max(1, Math.round(SKILL_DENOM * (resolvedSec / 15)));

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const doneRef = useRef(false);
  const cursorRef = useRef<{ x: number; y: number } | null>(null);
  const forceFinishRef = useRef<() => void>(() => {});

  const [timerMs, setTimerMs] = useState(totalMs);
  const [catchCount, setCatchCount] = useState(0);
  const [result, setResult] = useState<{
    catches: number;
    skillScore: number;
  } | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setTimerMs((t) => Math.max(0, t - 100));
    }, 100);

    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;

    const canvas: HTMLCanvasElement = canvasEl;
    const context: CanvasRenderingContext2D = ctx;

    canvas.style.cursor = "none";

    let catches = 0;
    let rafId = 0;
    let lastTs = -1;
    const start = performance.now();

    let sun: { x: number; y: number; spawnedAt: number } | null = null;
    let timeSinceLastSpawn = SPAWN_MAX;
    let nextSpawnDelay = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);

    function finish(forced = false) {
      if (doneRef.current) return;

      doneRef.current = true;
      cancelAnimationFrame(rafId);
      canvas.style.cursor = "default";

      const catchSkill = Math.min(
        100,
        Math.round((catches / skillDenom) * 100),
      );
      const elapsedRatio = Math.min(
        1,
        Math.max(0, (performance.now() - start) / totalMs),
      );
      const timeSkill = Math.round(elapsedRatio * 50);
      const skillScore = forced
        ? Math.max(catchSkill, timeSkill)
        : catchSkill;

      console.log(
        `[ClickGameSun] catches: ${catches} skillScore: ${skillScore}/100${forced ? " (forced)" : ""}`,
      );

      setResult({ catches, skillScore });
    }

    forceFinishRef.current = () => finish(true);

    function handlePointer(e: MouseEvent | TouchEvent) {
      if (doneRef.current || !sun) return;

      const rect = canvas.getBoundingClientRect();

      let cx: number;
      let cy: number;

      if (e instanceof TouchEvent) {
        cx = e.changedTouches[0].clientX - rect.left;
        cy = e.changedTouches[0].clientY - rect.top;
      } else {
        cx = e.clientX - rect.left;
        cy = e.clientY - rect.top;
      }

      const dx = cx - sun.x;
      const dy = cy - sun.y;

      if (dx * dx + dy * dy <= (SUN_R + 6) * (SUN_R + 6)) {
        catches++;
        setCatchCount(catches);

        sun = null;
        timeSinceLastSpawn = 0;
        nextSpawnDelay = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
      }
    }

    function handleMouseMove(e: MouseEvent) {
      const rect = canvas.getBoundingClientRect();

      cursorRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }

    function handleMouseLeave() {
      cursorRef.current = null;
    }

    canvas.addEventListener("click", handlePointer);
    canvas.addEventListener("touchstart", handlePointer, { passive: true });
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);

    function frame(ts: number) {
      if (doneRef.current) return;

      if (lastTs < 0) lastTs = ts;

      const dt = Math.min(ts - lastTs, 50);
      lastTs = ts;

      const elapsed = ts - start;

      timeSinceLastSpawn += dt;

      if (!sun && timeSinceLastSpawn >= nextSpawnDelay && elapsed < totalMs - 300) {
        const margin = SUN_R + 18;

        sun = {
          x: margin + Math.random() * (W - margin * 2),
          y: 44 + Math.random() * (H - 44 - margin - 12),
          spawnedAt: ts,
        };

        timeSinceLastSpawn = 0;
        nextSpawnDelay = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
      }

      if (sun && ts - sun.spawnedAt >= SUN_VISIBLE_MS) {
        sun = null;
        timeSinceLastSpawn = 0;
        nextSpawnDelay = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
      }

      if (elapsed >= totalMs && !sun) {
        finish();
        return;
      }

      context.clearRect(0, 0, W, H);
      context.fillStyle = CFG.bg;
      context.fillRect(0, 0, W, H);

      if (sun) {
        const age = ts - sun.spawnedAt;
        const scale = Math.min(1, age / 140);
        const fadeMs = 180;

        const alpha =
          age > SUN_VISIBLE_MS - fadeMs
            ? Math.max(0, 1 - (age - (SUN_VISIBLE_MS - fadeMs)) / fadeMs)
            : 1;

        drawSun(context, sun.x, sun.y, alpha, scale);
      }

      const cur = cursorRef.current;

      if (cur) {
        const cr = 10;
        const cg = 4;

        context.save();
        context.strokeStyle = "rgba(180,80,0,0.85)";
        context.lineWidth = 2;
        context.lineCap = "round";

        context.beginPath();
        context.moveTo(cur.x - cr, cur.y);
        context.lineTo(cur.x - cg, cur.y);
        context.stroke();

        context.beginPath();
        context.moveTo(cur.x + cg, cur.y);
        context.lineTo(cur.x + cr, cur.y);
        context.stroke();

        context.beginPath();
        context.moveTo(cur.x, cur.y - cr);
        context.lineTo(cur.x, cur.y - cg);
        context.stroke();

        context.beginPath();
        context.moveTo(cur.x, cur.y + cg);
        context.lineTo(cur.x, cur.y + cr);
        context.stroke();

        context.beginPath();
        context.arc(cur.x, cur.y, 2, 0, Math.PI * 2);
        context.fillStyle = "rgba(180,80,0,0.85)";
        context.fill();

        context.restore();
      }

      rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);

      canvas.removeEventListener("click", handlePointer);
      canvas.removeEventListener("touchstart", handlePointer);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);

      canvas.style.cursor = "default";
    };
  }, [totalMs, skillDenom]);

  return (
    <div
      className="mini-game-card"
      style={{ background: CFG.bg, border: CFG.border }}
    >
      <div className="mini-game-top-bar">
        <button
          className="mini-game-force-close"
          style={{ color: CFG.timerColor }}
          onClick={() =>
            result
              ? onComplete(result.skillScore, result.catches)
              : forceFinishRef.current()
          }
        >
          ✕
        </button>
      </div>

      <div className="mini-game-header">
        <GameTimer
          timeLeftMs={timerMs}
          totalMs={totalMs}
          color={CFG.timerColor}
          trackColor={CFG.timerBg}
        />

        <div className="mini-game-counter">
          <Sun size={20} strokeWidth={2.25} color={V3_ACTIVITY_ACCENT_COLORS.sun} />
          <span className="mini-game-counter-val">{catchCount}</span>
        </div>
      </div>

      <div className="game-content">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          style={{
            display: "block",
            touchAction: "none",
            userSelect: "none",
            cursor: "none",
          }}
        />
      </div>

      {result && (
        <div
          className="mini-game-result"
          style={{ background: CFG.bg }}
          onClick={() => onComplete(result.skillScore, result.catches)}
        >
          <span className="mini-game-result-emoji" aria-hidden="true">
            <Sun size={42} strokeWidth={2.25} color={V3_ACTIVITY_ACCENT_COLORS.sun} />
          </span>

          <p
            className="mini-game-result-count"
            style={{ color: CFG.resultColor }}
          >
            Поймано: {result.catches}
          </p>

          <p className="mini-game-result-label">
            {feedbackLabel(result.catches)}
          </p>
        </div>
      )}
    </div>
  );
}