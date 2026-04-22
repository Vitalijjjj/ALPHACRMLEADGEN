# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Priority:** Rules in `.claude/rules/` are the primary authority. Skills in `.claude/skills/` are tools to invoke — they serve the rules, not override them.

---

## Project Goal

Dark CRM + Instagram Bot — high-performance sales automation system. Instagram is the core channel.

**Decision filter:** Every technical decision must either speed up the system or increase sales. Otherwise — don't implement it.

---

## Mandatory Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router) + React 19 + TypeScript + TailwindCSS v4 + shadcn/ui + TanStack Table + React Query |
| Database | PostgreSQL via Neon (serverless) |
| ORM | Prisma 6 |
| Auth | NextAuth.js v5 beta — credentials only (single admin user via env vars) |
| Charts | Recharts |
| DnD | @hello-pangea/dnd (Kanban pipeline) |
| Deploy | Vercel (frontend + API routes in one repo) |

**Forbidden:** Separate NestJS server, MongoDB, jQuery.

---

## Architecture

Two separate packages in one repo:

**`/` — Main Next.js CRM app** (deployed to Vercel)
```
src/app/(auth)/login/            → public login page
src/app/(dashboard)/             → all protected CRM pages
src/app/api/                     → API Route Handlers (backend)
src/components/                  → UI components
src/lib/db.ts                    → Prisma client singleton
src/lib/auth.ts                  → NextAuth config (credentials against env vars)
prisma/schema.prisma             → DB schema
```

**`/bot/` — Standalone Instagram bot** (separate Node.js process, own `package.json`)
```
bot/index.ts          → main worker: polls CRM API queue, sends DMs via Playwright
bot/instagram.ts      → Playwright browser automation for Instagram DMs
bot/api.ts            → HTTP client for CRM API
bot/login.ts          → one-off Instagram account login helper
```

The bot polls `/api/campaigns/[id]/queue` on the CRM every 20s for PENDING recipients, sends DMs with randomized delays (55–75s default), then updates recipient status back via the CRM API. Telegram bot (grammy) sends admin notifications.

---

## Core DB Models

```
Lead → Deal (1:many) → Task (1:many)
Activity — timeline events linked to Lead or Deal
Campaign → CampaignRecipient (1:many)
```

Lead statuses: `NEW → CONTACTED → NEGOTIATION → WON / LOST`
Deal statuses: `PLANNING → DESIGN → DEVELOPMENT → TESTING → COMPLETED`
Task statuses: `TODO | IN_PROGRESS | DONE` — priority: `LOW | MEDIUM | HIGH | URGENT`
Recipient statuses: `PENDING | SENDING | SENT | ERROR | NOT_FOUND | SKIPPED`

---

## Commands

```bash
# Main CRM app
npm run dev                  # local dev (Next.js)
npm run build                # runs `prisma generate && next build`
npm run lint                 # ESLint

# Prisma
npx prisma migrate dev       # create + apply migration
npx prisma studio            # DB GUI
npx prisma generate          # regenerate client after schema change

# Instagram Bot (run from /bot directory)
cd bot && npm install
npx tsx index.ts             # run bot worker
npx tsx login.ts             # one-time Instagram login (saves session)
pm2 start ecosystem.config.cjs  # run via PM2 in production
```

---

## Environment Setup

**Main app** (`.env.local`):
```bash
DATABASE_URL=postgresql://...       # Neon pooled connection
DIRECT_URL=postgresql://...         # Neon direct (for migrations)
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD_HASH=...             # generate: node -e "require('bcryptjs').hash('pass',10).then(console.log)"
NEXTAUTH_SECRET=...                 # generate: openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000
```

**Bot** (`bot/.env`):
```bash
BOT_TOKEN=                   # Telegram bot token
BOT_SECRET=                  # shared secret for CRM API auth header
CRM_URL=http://localhost:3000
INSTAGRAM_USERNAME=
INSTAGRAM_PASSWORD=
TELEGRAM_CHAT_ID=
MIN_DELAY=55000              # ms between DMs
MAX_DELAY=75000
BOT_HTTP_PORT=3001
POLL_INTERVAL=20000
```

---

## Key Patterns

**Auth**: Single user — credentials validated against `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH` env vars. JWT sessions. All routes protected by `src/middleware.ts` except `/login` and `/api/auth/*`.

**Data fetching**: TanStack Query with 3s stale time, no refetch on window focus. Campaign detail page uses 5s polling interval while campaign is RUNNING. Always use optimistic updates in mutations.

**API routes**: All DB operations go through `/api/` handlers. Every handler checks session via `getServerSession`. Bot requests authenticate via `x-bot-secret` header checked against `BOT_SECRET` env var.

**Styling**: Tailwind v4 (PostCSS config, not tailwind.config.js). CSS variables defined in `globals.css`. Root layout adds Aurora background (three blurred gradient orbs + scanline overlay). Glassmorphic style throughout — `backdrop-blur`, semi-transparent backgrounds.

---

## UI Rules (Dark CRM Standard)

- **Dark theme only** — no light-mode fallback in MVP
- Keyboard-first UX — shortcuts for common actions
- Minimum clicks: quick-add popups, inline editing
- Style: Linear/Notion — sidebar + workspace layout
- No emojis as icons — use SVG (Lucide)
- Transitions 150–300ms, contrast ≥ 4.5:1

---

## MVP Scope

Leads, Pipeline (Kanban), Clients (Deals), Tasks, Unified Timeline, Dashboard.

---

## Available Skills

### `ui-ux-pro-max` — Design Intelligence

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "crm saas dashboard dark professional" --design-system -p "CRM" --stack shadcn
```

### `06-developer-experience` — DX Subagents

Key subagents: `refactoring-specialist.md`, `dependency-manager.md`, `build-engineer.md`
