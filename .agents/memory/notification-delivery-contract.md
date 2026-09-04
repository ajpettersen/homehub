---
name: Notification delivery contract
description: Safety and timing rules for household reminders across Web and mobile devices.
---

Notification timing is household-level and follows an explicitly saved IANA timezone. Due-date reminders default to 8:00 AM local; date-only workouts receive a completion check the following local morning.

**Why:** Server time and process restarts previously shifted or repeated reminders. More importantly, broad fallback delivery could expose an assigned adult's task or workout to another household member's device.

**How to apply:** Persist delivery deduplication across restarts, authorize each recipient device against its current linked family account, and never broaden an explicitly assigned reminder when that adult has no reachable device on a channel.