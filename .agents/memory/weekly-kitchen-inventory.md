---
name: Weekly kitchen inventory
description: Privacy, ownership, and freshness rules for inventory extracted during meal planning.
---

When Plan My Week receives at least two kitchen photos, it replaces the active property’s current inventory snapshot with detected ingredient names, quantities, and categories. The photos themselves remain transient and are never stored. Manual inventory edits are allowed between weekly scans.

**Why:** Food inventory changes quickly, so permanent cookbook labels would become misleading. A current property-scoped snapshot supports useful “already have” recipe matches without retaining household photos or crossing property boundaries.

**How to apply:** Require explicit property authorization for every inventory read/write, replace the snapshot transactionally only after a valid two-photo planning result, and compute meal/cookbook/shopping matches from structured recipe ingredients against the current snapshot. Automatic shopping-list generation skips matched inventory items and lists them separately as already available.