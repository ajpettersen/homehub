---
name: Household data migrations
description: Safe ownership backfills for legacy global HomeHub data in multi-household deployments.
---

Legacy rows without a unique property, profile, or member relationship must not be assigned to the first household or any default household. Preserve records in a quarantine table for explicit operator resolution instead.

**Why:** Default ownership backfills can expose private memories, family information, and schedules to the wrong household permanently once non-null constraints are applied.

**How to apply:** Derive ownership only from a single unambiguous, pre-existing relationship. Treat conflicting links as ambiguous, keep original content in a non-live quarantine table, and test migrations with at least two households before applying them.