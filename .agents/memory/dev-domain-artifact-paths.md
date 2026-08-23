---
name: Dev-domain artifact paths for e2e testing
description: Which app each dev-domain path serves; testing the wrong root app wasted multiple e2e rounds.
---

The workspace dev domain uses path routing and the ROOT path does NOT serve the React web app:

- `/` → Expo (react-native-web) web build of the mobile app
- `/home-hub-web/` → the React web app (sign-in at `/home-hub-web/sign-in`)
- `/api/...` → api-server

**Why:** An e2e session repeatedly "failed" to show a web-only feature because the tester was loading `/` (the Expo app). Symptoms of this mistake: HMR edits to the web app have no visible effect, and correct API responses don't change what renders.

**How to apply:** Point browser testers at `/home-hub-web/` for web-app behavior. If UI ignores both code edits and API state, confirm which artifact the page actually is before debugging the app.
