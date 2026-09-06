---
name: Weekly kitchen inventory
description: Privacy, ownership, and freshness rules for inventory extracted during meal planning.
---

When Plan My Week receives at least two kitchen photos, it first runs an isolated visual transcription that replaces the active property’s current inventory snapshot with only confidently visible ingredient names, quantities, and categories. Meal planning runs afterward and consumes that extracted inventory as context; recipes and meal suggestions must never feed back into inventory. The photos themselves remain transient and are never stored. Manual inventory edits are allowed between weekly scans.

**Why:** Food inventory changes quickly, so permanent cookbook labels would become misleading. Combining photo interpretation and recipe generation in one AI output allowed suggested recipe ingredients to resemble or contaminate the photographed inventory. An isolated photo-only pass preserves provenance while supporting useful “already have” matches without retaining household photos or crossing property boundaries.

**How to apply:** Require explicit property authorization for every inventory read/write, replace the snapshot transactionally only after a valid two-photo planning result, and compute meal/cookbook/shopping matches against the current snapshot. Grocery generation must use the final edited plan, skip matched inventory items, and list those matches separately as already available.