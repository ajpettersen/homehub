---
name: Installed Web app freshness
description: Safe update behavior for the installed HomeHub Web app during sign-out.
---

Signing out is the explicit update boundary for the installed Web app: finish a bounded service-worker update and activation attempt, then let authentication complete through a unique base-scoped launch URL.

**Why:** Passive worker registration can leave a Home Screen installation on an older document or waiting worker. Reloading before authentication completes can preserve the session, while broad cache/storage clearing can disrupt Clerk or other artifacts on the same origin.

**How to apply:** Keep every Web sign-out path centralized, bypass worker HTTP caching, limit cleanup to explicitly owned names, preserve Web Push registration, and keep manifest and redirect paths relative to the artifact base.