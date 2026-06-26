# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Two main products:
1. **Tree Idle Game** (`artifacts/tree-idle-game`) — simple SVG tree idle game at `/`
2. **Росток** (`artifacts/bank-game`) — gamified banking app at `/bank/` with custom session auth + PostgreSQL

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + raw `pg` pool (game state); Drizzle ORM (shared lib)
- **Auth**: custom session-based auth (email+password, cookie sessions via `SESSION_SECRET`)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Bank App Architecture

### Authentication
- Custom session auth (email + password), cookie-based
- Sessions managed by api-server; `SESSION_SECRET` env var required
- Vite dev proxy: `/api` → `http://localhost:8080`

### Database Schema (raw SQL, not Drizzle)
- `users` — credentials, nickname
- `accounts` — user balances, start date, accrual tracking, `starting_capital`
- `game_state` — session state (water/sun/fertilizer flags, last session time, pending rewards, XP, level, streak, tree growth)
- `income_history` — audit log of all earnings

### Economy Formulas
- Standard daily: `balance × 0.12 / 365` (auto-accrued)
- `storedSessions = 1 + missedSessions` — sessions accumulate, never lost
- Base reward: `(activeBalance × 0.12 / 365 / 3) × storedSessions`
- Bonus reward: `(activeBalance × bonusPercent / 365 / 3) × bonusMultiplier × storedSessions`
  - `bonusPercent = 0.03 × min(skillPart + capitalPart + randomPart, 1)` (fixed cap 3%)
  - `bonusMultiplier = max(1 - missedSessions × 0.1, 0.1)` (degrades only bonus, not base)
  - `skillPart = (avgSkillScore/80) × 0.75`; `capitalPart`: 0.16/0.18/0.20; `randomPart`: 0–0.04
- Super session: shown when `storedSessions > 1`; button/status text turns red

### Reward Claim Flow
1. Player completes all 3 mini-games (water, sun, fertilizer)
2. Backend calculates base + bonus rewards, stores in `game_state`:
   - `pending_base_reward` NUMERIC
   - `pending_bonus_reward` NUMERIC
3. Frontend shows single button **"Доход за сессию ×N"** (N = storedSessions)
4. Button calls `POST /api/game/session/claimAll` — claims both base + bonus in one request
5. Rewards persist in DB until claimed (survive page reload)

### State Flow
- API-first: all state lives in PostgreSQL, fetched on load
- Optimistic offline accrual for day-boundary crossings
- Single 8-hour cooldown between sessions
- Pending rewards stored in DB, not just in-memory

### Starting Capital & Leaderboard Tiers
- First login shows onboarding screen with 3 options:
  - **20 000 ₽** — «Начальный»
  - **200 000 ₽** — «Стандартный»
  - **2 000 000 ₽** — «Премиум»
- Chosen amount stored in `accounts.starting_capital` at account creation (immutable)
- Capital split 50/50 between standard and active deposits
- Tree growth speed depends on total balance magnitude

### XP / Leaderboard Modal
- Two main tabs: **История** (session XP log) and **Рейтинг**
- Рейтинг has 4 sub-tabs:
  | Sub-tab | Filter | Sort |
  |---------|--------|------|
  | Опыт | all players | player_xp DESC |
  | Малый | starting_capital ≤ 50 000 | tree_growth_mm DESC |
  | Средний | starting_capital 50 001–500 000 | tree_growth_mm DESC |
  | Крупный | starting_capital > 500 000 | tree_growth_mm DESC |
- Capital tabs show tree growth in mm/m (toFixed(1)) instead of XP
- Leaderboard row shows nickname + «Ур.X» only (no fire emoji, no session XP delta)

### Tree Visual System
- 5 growth stages (0–4), each with a dedicated SVG and clipped `viewBox`
- Container dimensions grow per stage: [82×74] → [82×90] → [115×118] → [130×143] → [148×166] px
- SVGs use `preserveAspectRatio="xMidYMax meet"` — tree root anchored to container bottom
- Game layout: `.game-tree-wrap` is `position:absolute; bottom:56px` — root stays at nav top level, canopy grows upward
- `DailyRewardModal` removed; replaced by the streak widget (opened via bell button in SettingsWidget)

### UI Components
- **SettingsWidget** — leftmost button is a bell icon that opens the 5-day streak widget (`showStreakWidget`)
- **LevelUpAnimation** — title «Новое достижение!», background `#ecfccb`, tree icon with `marginBottom:6px`
- **Dividers** — consistent color `rgba(100, 160, 40, 0.55)` across all modals and panels

### Key Files
- `artifacts/bank-game/src/lib/engine.ts` — all formulas, constants, state types
- `artifacts/bank-game/src/lib/api.ts` — API client
- `artifacts/bank-game/src/pages/GamePage.tsx` — main game UI
- `artifacts/bank-game/src/pages/OnboardingPage.tsx` — starting capital selection
- `artifacts/bank-game/src/components/TreeSVG.tsx` — tree stages, viewBox clipping, STAGE_DIMS
- `artifacts/bank-game/src/components/SettingsWidget.tsx` — settings + bell/streak trigger
- `artifacts/api-server/src/routes/game.ts` — all game API endpoints
- `artifacts/api-server/src/index.ts` — server entry + DB migrations (`runMigrations()`)

## Artifacts

| Artifact | Path | Port |
|----------|------|------|
| tree-idle-game | `/` | $PORT |
| bank-game | `/bank/` | $PORT |
| api-server | — | 8080 |
