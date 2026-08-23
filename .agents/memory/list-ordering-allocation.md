---
name: List ordering allocation
description: How manual list reordering (sort_order) must allocate values safely
---

Manual "move to top" ordering uses an integer `sort_order` with GET sorted `sort_order DESC, id ASC`; new values are allocated as household max+1.

**Why:** A bare read-max-then-write can collide under concurrent requests, and the ascending-id tie-breaker then puts the wrong list on top (found in code review).

**How to apply:** Any endpoint that allocates a new sort_order (web or future mobile reordering) must do it inside a transaction holding `pg_advisory_xact_lock(hashtext('todo_list_order:<householdId>'))` (or an equivalent per-household lock), not a plain max+1 read/write.
