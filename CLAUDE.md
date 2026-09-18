# CLAUDE.md

Practical notes for working in this repo, especially the parts that cost real
debugging time to figure out the first time. See `replit.md` for product and
architecture context.

## Local setup

- Requires **Node 24** and **pnpm exactly 12.3.4** (pinned in `package.json`'s
  `packageManager` field — keep it in sync with `nixpacks.toml`, which
  installs pnpm via `npx` rather than corepack; corepack's on-demand download
  is flaky inside Railway's build sandbox).
- Port **5000 conflicts with macOS AirPlay Receiver** on Apple Silicon Macs.
  Local dev uses port 5050 for the API server instead.
- `pnpm-workspace.yaml` used to exclude darwin-arm64 native binaries (rollup,
  lightningcss, `@tailwindcss/oxide`) to shrink Replit's own installs. Don't
  reintroduce a per-platform exclusion like that — it silently breaks
  `pnpm install` for whoever's on that platform, no error pointing at the
  actual cause.
- The API server needs real env vars to even boot (`DATABASE_URL`,
  `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `AI_INTEGRATIONS_OPENAI_*`,
  `SESSION_SECRET`) — most of the app's lib modules throw at import time if
  these are missing, not lazily. A `.env` file at the repo root works for
  local dev; load it into the shell with `set -a && source .env && set +a`
  before running commands (values contain characters like `&` that break a
  naive `node --env-file` in some invocations — test whichever way you load
  it).

## Deployment (Railway)

- `railway.json` + `nixpacks.toml` define the build/start commands
  explicitly. Don't rely on Railway's monorepo auto-detection ("Deploy the
  repo" in the dashboard) — it tries to split this workspace into five
  separate services (one per `artifacts/*` package with a `package.json`),
  which is not what we want. If you ever see that happen, discard the
  proposal and redeploy the existing single `homehub` service instead.
- Auto-deploys on every push to `main`.
- In production, `app.ts` serves the built frontend directly (static files +
  SPA fallback) since Railway has no Replit-style automatic frontend/backend
  routing. This only activates when `NODE_ENV=production`.

## Clerk auth in production

This app uses Clerk via Replit's managed "Users & Auth" integration (not a
normal clerk.com account — there's no dashboard access to it outside Replit's
own UI). It runs on Clerk's free/development tier (`sk_test_...`/`pk_test_...`
keys), not a paid production tier, which is important:

- **In `NODE_ENV=production`, the app tries to proxy Clerk's Frontend API
  through its own domain** (`CLERK_PROXY_PATH`, `VITE_CLERK_PROXY_URL`). That
  proxy mechanism is really meant for Clerk's paid tier, which requires
  registering the proxy domain in a Clerk dashboard we don't have access to —
  using it here causes cryptic failures (`clerk.browser.js` 502s, "unable to
  attribute this request to an instance"). **Leave `VITE_CLERK_PROXY_URL`
  unset** so the frontend talks to Clerk's dev-tier domain directly, the same
  way it already works in local dev. Only revisit this if the app is ever
  moved to Clerk's actual paid production tier with real dashboard access.
- The bootstrap identity (`HOMEHUB_BOOTSTRAP_EMAIL`) only gets promoted to
  household owner on a `pending` profile with no `linked_family_member_id`
  colliding with another linked adult — see `lib/bootstrapIdentity.ts` and
  `routes/me.ts` if this needs to change.

## Data model gotchas

- **Meal plan weeks are Monday-based, everywhere, in UTC.** See
  `mondayForDate` (`routes/ai.ts`), `mondayOfWeek` (frontend, `Kitchen.tsx`),
  `weekStartString` (`lib/aiLiveContext.ts`), `mondayOf`
  (`routes/dashboard.ts`), and `startOfWeek(…, { weekStartsOn: 1 })` in the
  mobile app's `kitchen.tsx`. These must all agree, or queries against
  `mealPlansTable.weekStart` silently return nothing for the real current
  week — the server doesn't reject a non-Monday `weekStart`. (This has broken
  three times: `aiLiveContext.ts`, the dashboard route, and the mobile
  planner each used Sunday weeks until fixed. If meals look empty somewhere
  they shouldn't, check this first.)
- **"Today" is the household's local day, not the server's.** The server
  runs in UTC, which is already tomorrow during US evenings. Routes that
  care take an optional IANA `timezone` (query param or body) and use
  `dateInMaintenanceTimeZone` / `addMaintenanceDays` from
  `lib/maintenanceDates.ts`; clients send `getResolvedTimeZone()` (web) or
  `getDeviceTimeZone()` (mobile). Never use `new Date().toISOString()` for a
  calendar date.
- Recipes saved with `sourceType: "ai"` and empty `instructions` are expected
  to get their real ingredients/instructions filled in automatically (see
  `fetchAndSaveAiRecipeDetails` in `Kitchen.tsx`, and the same logic reused
  server-side by the `save_recipe_to_cookbook` AI tool in `routes/ai.ts`).
  Don't create a bare AI-sourced recipe without also either calling that
  generation, or accepting it'll sit empty until the user opens it.
- Chat attachments (photos sent to the AI) are stored as `bytea` in a
  `chat_attachment_blobs` table (see `lib/chatAttachmentStorage.ts`), not
  external object storage — this repo previously used Replit's private object
  storage sidecar, which only exists inside Replit's infrastructure and
  silently failed everywhere else.

## The AI assistant (`routes/ai.ts`)

- It can take real write actions via OpenAI tool calls (`AI_ACTION_TOOLS` +
  `executeAiAction`), not just chat: add/remove meal plan entries, add/remove
  grocery items, create a grocery list, create maintenance tasks, add chores,
  save a full recipe to the cookbook. Adding a new capability means adding
  both a tool definition and an `executeAiAction` branch — action tools
  should only fire on an explicit user ask, never as a guess.
- The tool-calling loop allows up to 16 rounds per message (`MAX_TOOL_ROUNDS`)
  since a single request like "plan the week, make a list, save the recipes"
  can genuinely need a dozen-plus tool calls. If it's still hitting that cap
  in practice, that's a real signal usage has grown, not just a number to
  bump quietly.
- `getLiveHouseholdSnapshot` (`lib/aiLiveContext.ts`) is what gives the
  assistant real, current ground truth each turn (this week's meals, upcoming
  maintenance, active chores) — extend this rather than trusting the model to
  remember old confirmations from earlier in the conversation, since tool
  call results aren't persisted to chat history between requests.

## Known trade-offs, not yet resolved

- Both this deployment and the original Replit deployment currently point at
  the same live production database — fine today, but a future schema change
  could break whichever one isn't redeployed. No decision yet on when to
  retire the Replit deployment.
- The frontend ships as a single ~1MB JS bundle (no code-splitting) and two
  page files (`Settings.tsx`, `Kitchen.tsx`) are each 2,500+ lines. Nothing
  urgent, but worth splitting if either becomes a real pain point.
