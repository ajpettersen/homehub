---
name: CRM AI privacy
description: Privacy boundary for household people and contractor context supplied to AI chat.
---

## The rule
Automatically loaded AI context may include a person’s name and groups, plus a contractor’s name, trade, and preferred status. It must not include CRM phone numbers, email addresses, free-form notes, or past-work details.

**Why:** Free-form household notes can contain contact information or sensitive relationship details, so regex redaction is not a safe privacy boundary.

**How to apply:** Keep any expanded CRM context opt-in and purpose-specific. Do not send arbitrary CRM text to the AI prompt without an explicit privacy review and a narrowly scoped retrieval strategy.