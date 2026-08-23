---
name: No startup demo seeding
description: Never auto-seed demo/sample data on server boot; why, and where initial data must come from.
---

Rule: never auto-seed demo/sample household data at server startup (or any unconditional boot hook).

**Why:** Startup seeders populated any empty database — including a brand-new PRODUCTION database — with demo content. The first real signup was joined to the seeded household, so onboarding piled real data on top of demo rows (duplicate family members, unwanted starter content). A second startup seeder auto-inserted a large curated maintenance list onto any house+cabin property pair, which would silently re-pollute cleaned households.

**How to apply:** Initial data comes only from the onboarding wizard's transactional endpoint (which clears the household before inserting) or explicit dev-only scripts. If someone proposes a "seed if empty" startup hook, reject it.
