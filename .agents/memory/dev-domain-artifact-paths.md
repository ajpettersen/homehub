---
name: Dev-domain artifact paths for e2e testing
description: Which app each dev-domain path serves; testing the wrong root app wasted multiple e2e rounds.
---

The workspace dev domain uses path routing with the React web app as the primary root artifact:

- `/` → the React web app (sign-in at `/sign-in`)
- `/mobile/` → the retired Expo app, normally stopped
- `/api/...` → api-server

**Why:** An e2e session repeatedly "failed" to show a web-only feature because the tester was loading `/` (the Expo app). Symptoms of this mistake: HMR edits to the web app have no visible effect, and correct API responses don't change what renders.

**How to apply:** Point browser testers at `/` for web-app behavior. If UI ignores both code edits and API state, confirm which artifact the page actually is before debugging the app.
