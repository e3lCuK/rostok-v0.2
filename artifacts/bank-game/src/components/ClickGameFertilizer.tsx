import { useEffect, useRef, useCallback } from "react";

interface Props {
  onComplete: (skillScore: number) => void;
}

// ---- canvas dimensions ----
const W = 280;
const H = 310;

// ---- game ----
const GAME_MS     = 15_000;
const SKILL_DENOM = 7;       // hits at this level → max skill score
const COOLDOWN_MS = 260;     // anti-spam delay after each click

// ---- bar layout ----
const BAR_W = 200;
const BAR_H = 28;
const BAR_X = (W - BAR_W) / 2;   // 40
const BAR_Y = H / 2 - BAR_H / 2; // ~141

// ---- target zone (fixed size, random position on success) ----
const ZONE_W = Math.round(BAR_W * 0.22);  // ~44 px ≈ 22% of bar

// ---- indicator ----
const IND_W   = 12;
const IND_SPEED = 185;  // px/s — medium feel

const CFG = {
  bg:          "rgba(240,253,244,0.97)",
  timerBg:     "#dcfce7",
  timerColor:  "#22c55e",
  border:      "2px solid #bbf7d0",
  scoreFg:     "#166534",
  resultColor: "#166534",
};

function randomZoneX(): number {
  const margin = 10;
  return BAR_X + margin + Math.random() * (BAR_W - ZONE_W - margin * 2);
}

function isInZone(indLeft: number, zoneX: number): boolean {
  const center = indLeft + IND_W / 2;
  return center >= zoneX && center <= zoneX + ZONE_W;
}

function feedbackLabel(n: number): string {
  if (n >= 6) return "Отлично!";
  if (n >= 4) return "Хорошо";
  return "Попробуйте ещё";
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x,     y + h, x,     y + h - r, r);
  ctx.lineTo(x,     y + r);
  ctx.arcTo(x,     y,     x + r, y,         r);
  ctx.closePath();
}

export default function ClickGameFertilizer({ onComplete }: Props) {
  const canvasRef      = useRef<HTMLCanvasElement>(null);
  const doneRef        = useRef(false);
  const pendingScore   = useRef<number | null>(null);
  const forceFinishRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.style.cursor = "none";

    let catches      = 0;
    let rafId        = 0;
    const start      = performance.now();

    let indPos       = BAR_X;            // left edge of indicator
    let indDir       = 1;                // 1 = right, -1 = left
    let lastTs       = -1;

    let zoneX        = randomZoneX();    // position of target zone
    let lastClickTs  = -Infinity;        // for cooldown guard
    let hitFlashTs   = -Infinity;        // for success flash animation

    // ---------- result screen ----------
    function finish() {
      if (doneRef.current) return;
      doneRef.current = true;
      cancelAnimationFrame(rafId);
      canvas.style.cursor = "default";

      const skillScore = Math.min(80, Math.round((catches / SKILL_DENOM) * 80));
      pendingScore.current = skillScore;
      console.log(`[ClickGameFertilizer] catches: ${catches}  skillScore: ${skillScore}/80`);

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = CFG.bg;
      ctx.fillRect(0, 0, W, H);

      ctx.textAlign    = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 36px sans-serif";
      ctx.fillText("🌱", W / 2, H / 2 - 36);

      ctx.font      = "bold 20px sans-serif";
      ctx.fillStyle = CFG.resultColor;
      ctx.fillText(`Поймано: ${catches}`, W / 2, H / 2 + 6);

      ctx.font      = "14px sans-serif";
      ctx.fillStyle = "#6b7280";
      ctx.fillText(feedbackLabel(catches), W / 2, H / 2 + 32);
    }

    // ---------- click / touch ----------
    function handleClick() {
      if (doneRef.current) return;
      const now = performance.now();
      if (now - lastClickTs < COOLDOWN_MS) return;
      lastClickTs = now;

      if (isInZone(indPos, zoneX)) {
        catches++;
        hitFlashTs = now;
        zoneX = randomZoneX();  // move zone after each hit
      }
    }

    function handleTouch(e: TouchEvent) {
      e.preventDefault();
      handleClick();
    }

    canvas.addEventListener("click",      handleClick);
    canvas.addEventListener("touchstart", handleTouch, { passive: false });

    // ---------- draw loop ----------
    function frame(ts: number) {
      if (doneRef.current) return;
      if (lastTs < 0) lastTs = ts;
      const dt      = Math.min(ts - lastTs, 50) / 1000;
      lastTs        = ts;
      const elapsed = ts - start;

      if (elapsed >= GAME_MS) { finish(); return; }

      // move indicator (ping-pong)
      indPos += IND_SPEED * dt * indDir;
      const maxPos = BAR_X + BAR_W - IND_W;
      if (indPos >= maxPos) { indPos = maxPos; indDir = -1; }
      if (indPos <= BAR_X)  { indPos = BAR_X;  indDir =  1; }

      const inZone = isInZone(indPos, zoneX);

      // ---- background ----
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = CFG.bg;
      ctx.fillRect(0, 0, W, H);

      // success flash
      const flashAge = ts - hitFlashTs;
      if (flashAge < 300) {
        ctx.fillStyle = `rgba(34,197,94,${0.20 * (1 - flashAge / 300)})`;
        ctx.fillRect(0, 0, W, H);
      }

      // ---- timer bar ----
      const pct = Math.max(0, 1 - elapsed / GAME_MS);
      ctx.fillStyle = CFG.timerBg;
      ctx.fillRect(0, 0, W, 5);
      ctx.fillStyle = CFG.timerColor;
      ctx.fillRect(0, 0, W * pct, 5);

      // ---- catch counter ----
      ctx.textAlign    = "left";
      ctx.textBaseline = "alphabetic";
      ctx.font         = "bold 13px sans-serif";
      ctx.fillStyle    = CFG.scoreFg;
      ctx.fillText(`🌱 ${catches}`, 10, 22);

      // ---- hint text ----
      ctx.textAlign    = "center";
      ctx.font         = "13px sans-serif";
      ctx.fillStyle    = "#4b5563";
      ctx.fillText("Нажмите в нужный момент", W / 2, BAR_Y - 22);

      // ---- bar background ----
      ctx.save();
      ctx.shadowColor   = "rgba(0,0,0,0.10)";
      ctx.shadowBlur    = 6;
      ctx.shadowOffsetY = 2;
      drawRoundedRect(ctx, BAR_X, BAR_Y, BAR_W, BAR_H, BAR_H / 2);
      ctx.fillStyle = "#e5e7eb";
      ctx.fill();
      ctx.shadowBlur    = 0;
      ctx.shadowOffsetY = 0;
      ctx.restore();

      // ---- target zone (clipped to bar shape) ----
      ctx.save();
      drawRoundedRect(ctx, BAR_X, BAR_Y, BAR_W, BAR_H, BAR_H / 2);
      ctx.clip();

      // zone fill
      ctx.fillStyle   = "#22c55e";
      ctx.globalAlpha = 0.32;
      ctx.fillRect(zoneX, BAR_Y, ZONE_W, BAR_H);
      ctx.globalAlpha = 1;

      // zone border lines
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth   = 2;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(zoneX, BAR_Y);
      ctx.lineTo(zoneX, BAR_Y + BAR_H);
      ctx.moveTo(zoneX + ZONE_W, BAR_Y);
      ctx.lineTo(zoneX + ZONE_W, BAR_Y + BAR_H);
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.restore();

      // ---- indicator (drawn on top, slightly taller than bar) ----
      const indY = BAR_Y - 5;
      const indH = BAR_H + 10;
      ctx.save();
      ctx.shadowColor = inZone ? "rgba(74,222,128,0.7)" : "rgba(255,255,255,0.6)";
      ctx.shadowBlur  = inZone ? 12 : 6;
      drawRoundedRect(ctx, indPos, indY, IND_W, indH, 4);
      ctx.fillStyle = inZone ? "#4ade80" : "white";
      ctx.fill();
      ctx.restore();

      // ---- success ✓ floating up ----
      if (flashAge < 500) {
        const alpha  = Math.max(0, 1 - flashAge / 500);
        const rise   = 36 * (flashAge / 500);
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.font         = `bold ${20 - 4 * (flashAge / 500)}px sans-serif`;
        ctx.fillStyle    = `rgba(22,163,74,${alpha})`;
        ctx.fillText("✓", W / 2, BAR_Y - 10 - rise);
      }

      rafId = requestAnimationFrame(frame);
    }

    forceFinishRef.current = finish;
    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener("click",      handleClick);
      canvas.removeEventListener("touchstart", handleTouch);
      canvas.style.cursor = "default";
    };
  }, []);

  const handleCanvasClick = useCallback(() => {
    if (doneRef.current && pendingScore.current !== null) {
      onComplete(pendingScore.current);
    }
  }, [onComplete]);

  return (
    <div className="mini-game-card" style={{ background: CFG.bg, border: CFG.border, height: "auto" }}>
      <button
        className="mini-game-force-close"
        style={{ color: CFG.timerColor }}
        onClick={() => pendingScore.current !== null ? onComplete(pendingScore.current) : forceFinishRef.current()}
      >✕</button>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        onClick={handleCanvasClick}
        style={{
          display:     "block",
          touchAction: "none",
          userSelect:  "none",
          cursor:      "default",
        }}
      />
    </div>
  );
}
