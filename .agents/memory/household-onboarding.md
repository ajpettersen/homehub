---
name: Household onboarding wizard
description: How first-login setup is gated and why seeding goes through one transactional endpoint
---

# Household onboarding

- The first-login setup wizard is web-only and gates on `role === 'family'` AND the household's `onboarding_completed_at` being NULL. Pending users and cleaners never see it.
- The completion flag lives on **households**, not user profiles. **Why:** setup seeds household-wide data, so later-approved members of an already-set-up household must skip it. The migration backfilled all pre-existing households as completed.
- All wizard seeding (household rename, property, members, starter grocery list/chores/maintenance) goes through ONE transactional endpoint (`POST /onboarding`). Normal first-run retries no-op after completion; deliberate settings reruns use an explicit additive mode that preserves existing household data and creates only missing starter records.
- **Why:** an earlier client-side sequential-mutation version could duplicate records when a retry or page refresh happened mid-sequence (code review flagged it). React state is not durable enough for duplicate prevention — idempotency must be enforced server-side.
- **How to apply:** any new onboarding surface (e.g. mobile) or new seed content should reuse/extend this endpoint rather than issuing per-entity creates from the client. The completion flag remains one-way; rerunning setup never clears it and must remain duplicate-safe under the household transaction lock.
