# 🌳 Rostok

A gamified banking simulator where a virtual tree grows as you earn active income. Complete sessions, play mini-games, collect rewards — come back in 8 hours and do it again.

Built as a portfolio project to explore game economy design, session state management, and fullstack TypeScript architecture.

---

## Why this exists

Most savings apps are boring. Rostok asks: what if growing a deposit felt like tending a garden? The goal was to design a real game loop — session cooldowns, degrading bonuses, stored sessions, skill-based multipliers — around the mechanics of interest rates and compounding, while keeping the UI intuitive and the code maintainable.

---

## Features

- **Session system** — complete a session every 8 hours to earn active income
- **Super sessions** — missed sessions stack up and play together with a multiplied reward
- **Bonus efficiency** — yield depends on mini-game performance, capital tier, and consistency
- **Three mini-games** per session:
  - 💧 **Water** — catch falling drops
  - ☀️ **Sunlight** — click accuracy challenge
  - 🍃 **Fertilizer** — Match-3 puzzle
- **Tree growth** — 1 ₽ of active income = 1 mm of visible growth, across 5 visual stages
- **Leaderboard** — compare tree growth across players, filtered by capital tier
- **Mandatory tutorial** — walks new users through all three mini-games before unlocking the main game
- **Session history** — full audit log of earnings
- **Smooth animations** — spring physics, floaters, stage transitions via Framer Motion

---

## Game Mechanics

### Income

Each session earns a base reward plus an optional bonus:

```
Base reward  = balance × 12% / 365 / 3 × storedSessions
Bonus reward = balance × bonusPercent / 365 / 3 × bonusMultiplier × storedSessions
```

`bonusPercent` is capped at 3% annually and computed as:

```
bonusPercent = 0.03 × min(skillPart + capitalPart + randomPart, 1)

skillPart   = (avgSkillScore / 80) × 0.75
capitalPart = 0.16 / 0.18 / 0.20   (by starting capital tier)
randomPart  = 0–0.04
```

### Super Sessions

Missing a session does not cancel it — it accumulates:

```
storedSessions  = 1 + missedSessions
bonusMultiplier = max(1 - missedSessions × 0.1, 0.1)   // minimum 10%
```

Base income scales fully with stored sessions. The bonus degrades with missed sessions, but never reaches zero.

### Tree Growth

| Rule | Value |
|------|-------|
| Growth rate | 1 ₽ active income = 1 mm |
| Source | Active sessions only |
| Reset | Never |

| Stage | Threshold |
|-------|-----------|
| Sprout | 0 mm |
| Sapling | 500 mm |
| Young tree | 2 000 mm |
| Mature tree | 5 000 mm |
| Full tree | 8 500 mm |

### Starting Capital & Leaderboard Tiers

Chosen at onboarding, stored immutably:

| Tier | Amount |
|------|--------|
| Starter | 20 000 ₽ |
| Standard | 200 000 ₽ |
| Premium | 2 000 000 ₽ |

Leaderboard filters by tier and sorts by tree growth in mm.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript, Vite, TanStack Query, Framer Motion |
| Backend | Express 5, PostgreSQL (raw `pg` pool), Drizzle ORM, Zod, Pino |
| Auth | Custom session auth — email/password, cookie-based, `SESSION_SECRET` |
| Monorepo | pnpm workspaces |
| Codegen | Orval — OpenAPI → React Query hooks + Zod schemas |
| Build | esbuild (CJS server bundle) |

---

## Project Structure

```
/
├── artifacts/
│   ├── bank-game/          # React frontend (Vite, served at /bank/)
│   │   └── src/
│   │       ├── components/ # UI components, mini-games, animations
│   │       ├── pages/      # GamePage, OnboardingPage
│   │       └── lib/        # Game engine, formulas, API client
│   └── api-server/         # Express backend (port 8080)
│       └── src/
│           ├── routes/     # game.ts — all game endpoints
│           └── index.ts    # Server setup, middleware, DB migrations
├── lib/
│   ├── db/                 # Drizzle schema + migrations
│   └── api-spec/           # OpenAPI spec + Orval codegen config
└── scripts/                # Utility scripts
```

---

## Getting Started

**Prerequisites:** Node.js 24+, pnpm 9+, PostgreSQL

```bash
# Install dependencies
pnpm install

# Apply database schema
pnpm --filter @workspace/db run push

# Start API server (port 8080)
pnpm --filter @workspace/api-server run dev

# Start frontend (separate terminal)
pnpm --filter @workspace/bank-game run dev
```

**Key commands:**

```bash
pnpm run typecheck                          # Full typecheck across all packages
pnpm run build                              # Typecheck + build all packages
pnpm --filter @workspace/api-spec run codegen  # Regenerate API hooks from OpenAPI spec
```

---

## What this project demonstrates

- **Game economy design** — session loops, degrading bonuses, stored sessions, skill-based multipliers
- **Contract-first API** — OpenAPI spec → generated Zod schemas and React Query hooks via Orval
- **Fullstack TypeScript** — strict types end-to-end across frontend, backend, and shared libs
- **Session state management** — all state persists in PostgreSQL; page reloads are seamless
- **Animation-driven UX** — spring physics, layout transitions, and visual feedback without a UI kit
- **Monorepo architecture** — pnpm workspaces with shared libs, composite TypeScript, and path-based proxy routing

---

> TypeScript · React · Express · PostgreSQL · Framer Motion · pnpm workspaces
