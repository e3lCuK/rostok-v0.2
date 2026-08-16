import { useState, useEffect, useRef } from "react";
import GameTimer from "./GameTimer";
import FertilizerIcon from "./FertilizerIcon";
import FertilizerGranuleIcon from "./FertilizerGranuleIcon";
import {
  V3_ACTIVITY_ACCENT_COLORS,
  V3_ACTIVITY_FILL_WASH_COLORS,
} from "@/lib/v3ActivityColors";

/**
 * Match-3 fertilizer activity (former leaf collector).
 * Tiles: solid chestnut-shaped granules in distinct flat colors.
 */

interface Props {
  onComplete: (skillScore: number, count: number) => void;
  bonusSeconds?: number;
  /** Economy v2: absolute duration in whole seconds (overrides 15 + bonus). */
  durationSec?: number;
}

const GRID = 5;
const TYPES = 5;
const GAME_MS = 15_000;
const MAX_MATCHES = 12;

const COLORS = ["green", "brown", "yellow", "blue", "purple"] as const;
type Color = (typeof COLORS)[number];
type Grid = (Color | null)[][];

const TILE_BG: Record<Color, string> = {
  green:  "#22c55e",
  // Activity amber — keep identical to fertilizer button --ac.
  brown:  V3_ACTIVITY_ACCENT_COLORS.fertilizer,
  // Darker gold so it does not merge with fertilizer amber (#f0a020).
  yellow: "#a16207",
  blue:   V3_ACTIVITY_ACCENT_COLORS.water,
  purple: "#a855f7",
};

const FERT_TIMER = V3_ACTIVITY_ACCENT_COLORS.fertilizer;
const FERT_TIMER_TRACK = V3_ACTIVITY_FILL_WASH_COLORS.fertilizer;

interface Result {
  matchCount: number;
  skillScore: number;
}

function resultLabel(m: number): string {
  if (m < 6) return "Попробуйте ещё";
  if (m <= 12) return "Хорошо";
  return "Отлично!";
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const rand = (): Color => COLORS[Math.floor(Math.random() * TYPES)];

function clone(g: Grid): Grid { return g.map(r => [...r]); }

function swapCells(g: Grid, r1: number, c1: number, r2: number, c2: number): Grid {
  const n = clone(g);
  [n[r1][c1], n[r2][c2]] = [n[r2][c2], n[r1][c1]];
  return n;
}

function findMatches(g: Grid): { cells: Set<string>; events: number } {
  const cells = new Set<string>();
  let events = 0;

  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID - 2; c++) {
      const v = g[r][c];
      if (!v || g[r][c + 1] !== v || g[r][c + 2] !== v) continue;
      let len = 3;
      while (c + len < GRID && g[r][c + len] === v) len++;
      for (let i = 0; i < len; i++) cells.add(`${r},${c + i}`);
      events++;
      c += len - 1;
    }
  }

  for (let c = 0; c < GRID; c++) {
    for (let r = 0; r < GRID - 2; r++) {
      const v = g[r][c];
      if (!v || g[r + 1][c] !== v || g[r + 2][c] !== v) continue;
      let len = 3;
      while (r + len < GRID && g[r + len][c] === v) len++;
      for (let i = 0; i < len; i++) cells.add(`${r + i},${c}`);
      events++;
      r += len - 1;
    }
  }

  return { cells, events };
}

function hasMove(g: Grid): boolean {
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (c + 1 < GRID && findMatches(swapCells(g, r, c, r, c + 1)).cells.size > 0) return true;
      if (r + 1 < GRID && findMatches(swapCells(g, r, c, r + 1, c)).cells.size > 0) return true;
    }
  }
  return false;
}

function applyGravity(g: Grid): Grid {
  const n = clone(g);
  for (let c = 0; c < GRID; c++) {
    const tiles: Color[] = [];
    for (let r = GRID - 1; r >= 0; r--) if (n[r][c]) tiles.push(n[r][c]!);
    for (let r = GRID - 1; r >= 0; r--) n[r][c] = tiles.length > 0 ? tiles.shift()! : rand();
  }
  return n;
}

function makeGrid(): Grid {
  let g: Grid = [];
  let tries = 0;
  do {
    g = Array.from({ length: GRID }, () => Array.from({ length: GRID }, rand));
    let changed = true;
    while (changed) {
      changed = false;
      for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
          const hBad = c >= 2 && g[r][c] === g[r][c - 1] && g[r][c] === g[r][c - 2];
          const vBad = r >= 2 && g[r][c] === g[r - 1][c] && g[r][c] === g[r - 2][c];
          if (!hBad && !vBad) continue;
          const forbid = new Set<Color>();
          if (hBad) forbid.add(g[r][c - 1]!);
          if (vBad) forbid.add(g[r - 1][c]!);
          const opts = COLORS.filter(x => !forbid.has(x));
          g[r][c] = opts[Math.floor(Math.random() * opts.length)];
          changed = true;
        }
      }
    }
    tries++;
  } while (!hasMove(g) && tries < 200);
  return g;
}

export default function FertilizerMatchGame({ onComplete, bonusSeconds = 0, durationSec }: Props) {
  const resolvedSec = durationSec != null ? Math.max(1, Math.floor(durationSec)) : 15 + bonusSeconds;
  const totalMs = resolvedSec * 1000;
  const maxMatches = Math.max(1, Math.round(MAX_MATCHES * (resolvedSec / 15)));
  const [grid, setGrid] = useState<Grid>(() => makeGrid());
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const [matchCount, setMatchCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(totalMs);
  const [gameOver, setGameOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const gridRef = useRef<Grid>(grid);
  const matchRef = useRef(0);
  const doneRef = useRef(false);
  const procRef = useRef(false);
  const startedAtRef = useRef(performance.now());
  const onDoneRef = useRef(onComplete);
  useEffect(() => { onDoneRef.current = onComplete; }, [onComplete]);

  function forceClose() {
    endGame(true);
  }

  function endGame(forced = false) {
    if (doneRef.current) return;
    doneRef.current = true;
    procRef.current = false;
    setGameOver(true);
    setProcessing(false);
    const m = matchRef.current;
    const catchSkill = Math.round(Math.min(1, m / maxMatches) * 100);
    const elapsedRatio = Math.min(
      1,
      Math.max(0, (performance.now() - startedAtRef.current) / totalMs),
    );
    const timeSkill = Math.round(elapsedRatio * 50);
    const skillScore = forced
      ? Math.max(catchSkill, timeSkill)
      : catchSkill;
    setResult({ matchCount: m, skillScore });
  }

  function handleContinue(skillScore: number, count: number) {
    onDoneRef.current(skillScore, count);
  }

  useEffect(() => {
    if (gameOver) return;
    const id = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 100) { clearInterval(id); return 0; }
        return t - 100;
      });
    }, 100);
    return () => clearInterval(id);
  }, [gameOver]);

  useEffect(() => {
    if (timeLeft === 0 && !doneRef.current) endGame();
  }, [timeLeft]);

  async function resolveChains(g: Grid, m: number) {
    let cur = g;
    let count = m;

    while (true) {
      const { cells, events } = findMatches(cur);
      if (cells.size === 0) break;

      const newCount = count + events;
      matchRef.current = newCount;
      count = newCount;
      setMatchCount(newCount);

      setHighlighted(cells);
      await sleep(220);

      const ng = clone(cur);
      cells.forEach(k => {
        const [r, c] = k.split(",").map(Number);
        ng[r][c] = null;
      });
      setHighlighted(new Set());
      cur = ng;
      setGrid(clone(cur));
      await sleep(80);

      cur = applyGravity(cur);
      gridRef.current = cur;
      setGrid(clone(cur));
      await sleep(150);

      if (!hasMove(cur)) {
        cur = makeGrid();
        gridRef.current = cur;
        setGrid(clone(cur));
        await sleep(200);
      }
    }

    if (!hasMove(cur)) {
      cur = makeGrid();
      gridRef.current = cur;
      setGrid(clone(cur));
    }

    procRef.current = false;
    setProcessing(false);
  }

  function handleClick(r: number, c: number) {
    if (doneRef.current || procRef.current) return;

    if (!selected) {
      setSelected([r, c]);
      return;
    }

    const [sr, sc] = selected;

    if (sr === r && sc === c) {
      setSelected(null);
      return;
    }

    if (Math.abs(sr - r) + Math.abs(sc - c) !== 1) {
      setSelected([r, c]);
      return;
    }

    setSelected(null);

    const orig = gridRef.current;
    const swapped = swapCells(orig, sr, sc, r, c);
    const { cells } = findMatches(swapped);

    if (cells.size === 0) {
      procRef.current = true;
      setProcessing(true);
      setGrid(swapped);
      setTimeout(() => {
        setGrid(clone(orig));
        procRef.current = false;
        setProcessing(false);
      }, 280);
      return;
    }

    procRef.current = true;
    setProcessing(true);
    gridRef.current = swapped;
    setGrid(clone(swapped));
    setTimeout(() => resolveChains(swapped, matchRef.current), 50);
  }

  return (
    <div
      className="mini-game-card"
      style={{
        background: "rgba(255, 251, 235, 0.97)",
        border: `2px solid ${FERT_TIMER}`,
      }}
    >
      <div className="mini-game-top-bar">
        <button
          className="mini-game-force-close"
          style={{ color: FERT_TIMER }}
          onClick={() => result ? handleContinue(result.skillScore, result.matchCount) : forceClose()}
        >✕</button>
      </div>
      <div className="mini-game-header">
        <GameTimer
          timeLeftMs={timeLeft}
          totalMs={totalMs}
          color={FERT_TIMER}
          trackColor={FERT_TIMER_TRACK}
        />
        <div className="mini-game-counter">
          <FertilizerIcon
            size={20}
            filled={false}
            color={V3_ACTIVITY_ACCENT_COLORS.fertilizer}
          />
          <span className="mini-game-counter-val">{matchCount}</span>
        </div>
      </div>

      <div className="game-content">
      <div className={`m3-grid${processing ? " m3-busy" : ""}`}>
        {grid.map((row, r) =>
          row.map((cell, c) => {
            const key = `${r},${c}`;
            const isSel = selected?.[0] === r && selected?.[1] === c;
            const isHi = highlighted.has(key);
            return (
              <button
                key={key}
                className={`m3-cell${isSel ? " m3-sel" : ""}${isHi ? " m3-hi" : ""}`}
                onClick={() => handleClick(r, c)}
                disabled={gameOver}
              >
                {cell && (
                  <div className="m3-tile m3-tile--granule">
                    <FertilizerGranuleIcon size={34} color={TILE_BG[cell]} />
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
      </div>

      {gameOver && result && (
        <div
          className="mini-game-result"
          style={{ background: "rgba(255, 251, 235, 0.97)" }}
          onClick={() => handleContinue(result.skillScore, result.matchCount)}
        >
          <span className="mini-game-result-emoji" aria-hidden="true">
            <FertilizerIcon
              size={42}
              filled={false}
              color={V3_ACTIVITY_ACCENT_COLORS.fertilizer}
            />
          </span>
          <p className="mini-game-result-count" style={{ color: FERT_TIMER }}>
            Собрано: {result.matchCount}
          </p>
          <p className="mini-game-result-label">{resultLabel(result.matchCount)}</p>
        </div>
      )}
    </div>
  );
}
