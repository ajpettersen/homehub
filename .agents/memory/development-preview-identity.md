---
name: Development preview identity
description: Safe authentication boundary for interactive no-login HomeHub previews.
---

HomeHub’s development preview may use a synthetic family identity so users can interact with household-scoped demo data without passing through Clerk.

**Why:** A frontend-only authentication bypass rendered the application but every API call failed with 401. A broad backend bypass could expose real household data if it ever reached production.

**How to apply:** Keep preview identity resolution server-side, restrict it to development and non-deployment environments, and attach it only to the designated demo household profile. Production must always require real Clerk authentication.