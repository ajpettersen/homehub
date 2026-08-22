---
name: Expo destructive confirmations
description: Cross-platform confirmation behavior for destructive HomeHub mobile actions.
---

Use an in-app React Native modal or sheet for destructive confirmations that must work across iOS, Android, and the Expo web preview. Do not rely on `Alert.alert` for these shared flows.

**Why:** A maintenance delete button using `Alert.alert` worked as a native pattern but appeared inert in the Expo web runtime, preventing users from confirming or cancelling the action.

**How to apply:** Present explicit cancel and destructive actions in a themed sheet with accessible labels and large touch targets, then verify both paths in the Expo web preview as well as native-oriented layouts.