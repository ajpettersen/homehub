---
name: Household account bootstrap
description: Trusted access and role-assignment rule for HomeHub household accounts.
---

## The rule
Bootstrap only the configured Clerk identity into a new household, and only when no profile exists yet. Every other account starts pending with no household. A pending user may submit any approved adult’s exact email, or redeem a secure single-use household invite. Email requests remain reviewable; invite redemption connects the account before self-profile setup.

**Why:** CRM data and AI household context are sensitive. A pending user must never learn household metadata, enumerate accounts, or promote their own account. The family chose shared adult responsibility for linking instead of a single administrator bottleneck.

**Administrator boundary:** Every approved, account-linked adult may create/revoke household invites and approve/deny join requests. Unrelated sensitive household configuration—including onboarding/setup, properties, household-wide navigation, and account role changes—keeps its existing elevated authorization boundary.

**Adult identity rule:** An active adult family member is the household identity for exactly one approved family login account. Children and pets may exist without accounts. Never infer which legacy adult belongs to an account from a matching name, and never delete an unlinked legacy adult automatically.

**Why:** Names are mutable and non-unique, while adult profiles can own assignments and history. Guessing or deleting during migration can attach private data to the wrong person or destroy household records.

**Self-profile boundary:** Every approved linked family account may edit its own display profile, including non-administrators. Identity must come from the authenticated account link, never a client-selected member.

**Why:** AJ and Emily each need control of their own household-facing name without gaining permission to edit other family identities or account access.

**Joined-adult setup boundary:** The first account completes household-wide setup and seeding. Every later approved or invited adult gets a separate, idempotent personal-profile prompt and must never enter or rerun the household creator wizard.

**Why:** Household setup owns shared data; joining setup owns only the new adult’s identity. Mixing them can duplicate seeded content, overwrite shared choices, or make one adult’s preferences look like another’s.

**How to apply:** Keep pending accounts outside the application shell until approved or invited. Joining must create or explicitly claim one adult identity transactionally. Invite bearer tokens belong in URL fragments and request bodies only, are stored hashed, expire, and are consumed once; never place them in request paths, referrers, or logs. Gate all joining methods on the same server-backed personal-setup state. Preserve ambiguous legacy adults for explicit reconciliation. Self-service edits may change presentation fields only; household identity, elevated roles, and destructive changes remain server-controlled.