---
name: CRM property ownership
description: Security rule for household CRM ownership migration and access.
---

## The rule
People and contractor records must have explicit property ownership before they can be listed, matched, edited, deleted, or sent to AI context. Do not assign legacy CRM records by choosing a globally first property or any other inferred default.

**Why:** An inferred property can expose contact details to the wrong household or property user. Availability is less important than protecting CRM data.

**How to apply:** Leave unowned legacy records hidden. If recovery is needed, provide an authenticated, audited owner-assignment flow that shows only records the caller is already entitled to claim.