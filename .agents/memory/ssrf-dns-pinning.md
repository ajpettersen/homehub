---
name: SSRF DNS pinning
description: Why HomeHub outbound URL fetches pin connections to validated public DNS addresses.
---

Any server-side fetch of a user-supplied URL must connect through a lookup pinned to the exact public IP addresses that passed validation. A separate preflight DNS lookup followed by a normal fetch is not sufficient.

**Why:** An attacker-controlled hostname can return a public address during validation and a private, loopback, link-local, or metadata address when the HTTP client resolves it again. This DNS-rebinding gap turns an apparent allowlist into SSRF.

**How to apply:** Validate every redirect hop, reject reserved address ranges, then pass only the validated addresses to the socket's lookup callback while retaining the original hostname for the Host header, TLS SNI, and certificate verification.