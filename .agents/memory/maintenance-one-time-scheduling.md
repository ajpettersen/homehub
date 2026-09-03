---
name: Maintenance one-time scheduling
description: Defines the expected lifecycle for date-specific maintenance reminders.
---

One-time maintenance reminders use a specific due date, do not have a recurrence interval, and leave the active maintenance lists after completion. New recurring maintenance tasks are due immediately once; after completion, their next due date is the completion date plus the configured interval.

**Why:** A calendar appointment or an isolated repair should not be pushed forward as though it were periodic, while a newly added routine should be actionable now instead of disappearing until its first interval elapses.

**How to apply:** Request a due date for one-time reminders and exclude them after completion. For recurring maintenance, show the first occurrence immediately and schedule later occurrences from each completion date.