# HomeHub

A family household manager — meal planning, a shared cookbook with AI-generated
recipes, grocery lists, chores, workouts, and home maintenance tracking for one
or more properties, with a household AI assistant that can take actions
(add/remove meal plan entries, grocery items, chores, maintenance tasks; save
recipes) on the family's behalf.

## Run & Operate

**Local development** (see `CLAUDE.md` for the full setup, including the
non-obvious parts):
- `pnpm --filter @workspace/api-server run dev` — API server (port 5050
  locally; 5000 conflicts with macOS AirPlay Receiver)
- `pnpm --filter @workspace/home-hub-web run dev` — frontend dev server
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and
  Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

**Production**: deployed on Railway (`railway.json` + `nixpacks.toml`),
auto-deploys on every push to `main`. The Express server serves the built
frontend directly in production (see `app.ts`) since Railway has no
Replit-style automatic frontend/backend routing.

Required env vars: `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`,
`VITE_CLERK_PUBLISHABLE_KEY`, `SESSION_SECRET`, `HOMEHUB_BOOTSTRAP_EMAIL`,
`AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY`. In
production, also `NODE_ENV=production` and `VITE_CLERK_PROXY_URL` (only if
using Clerk's production proxy — see `CLAUDE.md`).

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL (Neon) + Drizzle ORM
- Auth: Clerk
- AI: OpenAI (`gpt-5.6-luna` for text/vision, `gpt-image-1` for recipe
  photos, `gpt-audio` for guided-cooking read-aloud)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle) for the API server, Vite for the frontend

## Where things live

- `artifacts/home-hub-web` — the web frontend (the primary client)
- `artifacts/api-server` — the Express API, including AI routes (`routes/ai.ts`)
- `lib/db` — Drizzle schema (source of truth for the data model) and
  hand-written SQL migrations (`lib/db/migrations`)
- `lib/api-zod` / `lib/api-client-react` — generated (Orval) API contracts and
  React Query hooks; do not hand-edit, regenerate via codegen
- `artifacts/home-hub` — an Expo mobile app; intentionally parked (see below)
- `artifacts/mockup-sandbox` — a design-preview tool, not part of the shipped
  app

## Architecture decisions

- HomeHub Web is the primary client. Keep the existing Expo app intact, but do
  not add features to it unless the user explicitly changes direction.
- The household AI assistant (`routes/ai.ts`, `HouseholdChat` on the
  Dashboard) can take real write actions via tool calls (`AI_ACTION_TOOLS`),
  not just chat. Any new capability for it needs both a tool definition and an
  `executeAiAction` branch, and should only fire on an explicit user ask —
  never guess into a destructive action.

## Product

Family members sign in via Clerk (Google or email) and land in a household
scoped to their account. One "bootstrap" identity (matching
`HOMEHUB_BOOTSTRAP_EMAIL`) owns the household on first sign-in; everyone else
starts pending until approved or invited. Core surfaces: Dashboard (AI
assistant + overview), Kitchen (meal plan, cookbook, grocery lists, pantry
scanning), Chores, Workouts, Maintenance, People (household contacts/CRM),
Settings.

## User preferences

- Prioritize the installable HomeHub Web app and its Home Screen (PWA)
  experience; do not continue Expo app work.

## Gotchas

See `CLAUDE.md` for the full list — it covers the Node/pnpm version pinning
Railway needs, the AirPlay port conflict, the Clerk production-proxy setup,
and a real week-start convention bug that was fixed (meal plans key off
Monday-based weeks everywhere; don't reintroduce a Sunday-based one).

## Pointers

- `CLAUDE.md` — practical setup notes and gotchas for whoever (human or AI) is
  working in this repo next
