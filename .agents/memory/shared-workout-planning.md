---
name: Shared workout planning
description: Product and data-integrity rules for multi-person workouts, exercise reuse, and AI planning.
---

## The rule

A workout may be shared by multiple account-backed adults. Exercises used in a workout belong to a household library organized by muscle group. AI coach and weekly-planning responses are editable drafts only; nothing is persisted until a person explicitly saves the reviewed workout or week.

**Why:** Couples train together, but each person still needs accurate history. AI output can be wrong or inappropriate, so implicit persistence would pollute schedules and exercise history. Calendar plans must also remain stable across browser and server timezones.

**How to apply:** Treat participant membership as a unique set, authorize every participant against the household, and preserve shared history during adult reconciliation. Use strictly parsed, round-tripped date-only values and derive the current planning week from the saved household IANA timezone. A saved plan remains scheduled until explicit completion. AI drafts default to planning; classify a draft as completed only when the user clearly says the workout already happened. Enforce every scheduled-session transition atomically in the database so concurrent complete, skip, cancel, or dismiss requests cannot overwrite truthful history. Bound AI inputs, context, and structured output; reject malformed drafts explicitly. Serialize create and update operations that enforce the same workout duplicate identity.