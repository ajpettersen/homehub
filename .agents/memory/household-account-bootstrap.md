---
name: Household account bootstrap
description: Trusted access and role-assignment rule for HomeHub household accounts.
---

## The rule
Bootstrap only the configured Clerk identity as a family administrator, and only when no profile exists yet. Every other account starts pending with no household. A pending user may explicitly submit an administrator email, but the server stores only a reviewable join request—not a household attachment—and gives the requester the same accepted response for every valid lookup. The request records the verified requester's identity snapshot for the target household administrator to review.

**Why:** CRM data and AI household context are sensitive. A pending user must never learn household metadata, enumerate administrator accounts, or promote their own account to gain access. Family membership and household administration are separate: only `role = family` plus `isAdmin = true` can manage access.

**Administrator boundary:** Approved non-admin family members may collaborate on household content such as chores, tasks, meals, shopping, workouts, maintenance work, and assistant interactions. Household identity and configuration—including onboarding/setup, properties, family profiles, household-wide navigation, and account access—require an approved family administrator. Authorization scopes must carry administrator status so every configuration mutation can enforce this boundary server-side.

**Adult identity rule:** An active adult family member is the household identity for exactly one approved family login account. Children and pets may exist without accounts. Never infer which legacy adult belongs to an account from a matching name, and never delete an unlinked legacy adult automatically.

**Why:** Names are mutable and non-unique, while adult profiles can own assignments and history. Guessing or deleting during migration can attach private data to the wrong person or destroy household records.

**Self-profile boundary:** Every approved linked family account may edit its own display profile, including non-administrators. Identity must come from the authenticated account link, never a client-selected member.

**Why:** AJ and Emily each need control of their own household-facing name without gaining permission to edit other family identities or account access.

**How to apply:** Keep pending accounts outside the application shell until approved. Joining and role changes must create or explicitly claim one adult identity transactionally. Preserve ambiguous legacy adults for explicit administrator reconciliation. A merge must keep the linked adult, transfer history safely, and remove the unlinked duplicate only after confirmation and reference verification. Self-service edits may change presentation fields only; role, household, administration, linking, and deletion remain administrator-controlled.