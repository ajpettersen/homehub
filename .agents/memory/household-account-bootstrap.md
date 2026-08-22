---
name: Household account bootstrap
description: Trusted access and role-assignment rule for HomeHub household accounts.
---

## The rule
Bootstrap only the configured Clerk identity as a family administrator, and only when no profile exists yet. All other accounts start pending, and only an existing family administrator may change roles or property access.

**Why:** CRM data and AI household context are sensitive. A pending user must never be able to promote their own account to gain access.

**How to apply:** Keep public account registration out of the app entry flow. Store the vetted Clerk ID in `HOMEHUB_BOOTSTRAP_CLERK_ID`, serialize first-account bootstrap, enforce the family role on account-management endpoints, and use a family administrator to approve subsequent pre-provisioned household accounts.