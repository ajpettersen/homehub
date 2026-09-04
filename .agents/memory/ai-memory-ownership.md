---
name: AI memory ownership
description: Visibility and attribution rules for personal versus household-wide assistant memories.
---

## The rule

Facts learned directly from an adult’s assistant conversation are personal to that linked adult by default. Household-wide memories are reserved for explicitly shared or system-derived household facts.

**Why:** Statements such as “I dislike mushrooms” must not silently become another adult’s preference. Sharing every learned fact across the household crosses identities and makes assistant behavior untrustworthy.

**How to apply:** Attribute direct-chat memories to the authenticated linked adult. Build assistant context from household-wide memories plus that adult’s own memories only. Never let another adult—including a household owner—list, prompt with, or delete someone else’s personal memories. Keep aggregate/system-derived family facts household-wide and enforce subject/household integrity in storage.