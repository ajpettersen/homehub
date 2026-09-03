---
name: Household account bootstrap
description: Trusted access and role-assignment rule for HomeHub household accounts.
---

## The rule
Bootstrap only the configured Clerk identity as a family administrator, and only when no profile exists yet. Every other account starts pending with no household. A pending user may explicitly submit an administrator email, but the server stores only a reviewable join request—not a household attachment—and gives the requester the same accepted response for every valid lookup. The request records the verified requester's identity snapshot for the target household administrator to review.

**Why:** CRM data and AI household context are sensitive. A pending user must never learn household metadata, enumerate administrator accounts, or promote their own account to gain access. Family membership and household administration are separate: only `role = family` plus `isAdmin = true` can manage access.

**Administrator boundary:** Approved non-admin family members may collaborate on household content such as chores, tasks, meals, shopping, workouts, maintenance work, and assistant interactions. Household identity and configuration—including onboarding/setup, properties, family profiles, household-wide navigation, and account access—require an approved family administrator. Authorization scopes must carry administrator status so every configuration mutation can enforce this boundary server-side.

**How to apply:** Store the vetted Clerk ID in `HOMEHUB_BOOTSTRAP_CLERK_ID`, serialize first-account bootstrap, and never auto-attach non-bootstrap users. Resolve join-request emails only on the server with database-backed fixed-window rate limits keyed by requester and client-IP hashes (never raw IP), comparable lookup work, and a padded generic accepted response for syntactically valid inputs. Serialize resubmission and decisions on the requester key; a decision must lock and conditionally transition its pending request so only one action can attach a profile. Scope request review/decisions to the target household administrator. Approval must transactionally attach a pending profile as a non-admin family member and mark the request approved; denial must not attach it. Keep pending accounts outside the application shell until approved.