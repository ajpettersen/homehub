---
name: Task scheduling separation
description: Defines where one-off household work and recurring property maintenance belong.
---

Date-specific household work and recurring property upkeep are different concepts. New one-offs require a due date; routines may start on a chosen date and advance from the local calendar date on completion. Legacy one-time maintenance remains valid.

**Why:** Mixing isolated errands with property routines made both workflows confusing, while UTC date math could move a household task to the wrong day. Suggested routines also need stable identities so wording changes cannot create duplicates.

**How to apply:** Keep one-offs and routines distinct, preserve date-only values in the household timezone, and require explicit approval before suggested routines are saved.