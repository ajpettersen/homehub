import assert from "node:assert/strict";
import { decryptSecret, encryptSecret } from "../src/lib/hatchCrypto";

const secret = "a-long-session-secret-for-testing-only-0123456789";
const password = "p@ss word with ünïcode & symbols 🙂";

const token = encryptSecret(password, secret);
assert.ok(token.startsWith("v1."), "tagged with a format version");
assert.ok(!token.includes(password), "plaintext never appears in the stored value");
assert.equal(decryptSecret(token, secret), password, "round trip returns the original password");
assert.notEqual(encryptSecret(password, secret), token, "a fresh random IV makes every encryption different");

assert.equal(decryptSecret(token, "a-different-secret-entirely-0123456789abcdef"), null, "wrong secret fails closed");

const parts = token.split(".");
const flipped = parts[3].slice(0, -2) + (parts[3].endsWith("AA") ? "BB" : "AA");
assert.equal(decryptSecret([parts[0], parts[1], parts[2], flipped].join("."), secret), null, "tampered ciphertext is rejected");
assert.equal(decryptSecret([parts[0], parts[1], "AAAAAAAAAAAAAAAAAAAAAA", parts[3]].join("."), secret), null, "tampered auth tag is rejected");
assert.equal(decryptSecret("v2." + parts.slice(1).join("."), secret), null, "unknown version is rejected");
assert.equal(decryptSecret("not-a-token", secret), null, "garbage is rejected");
assert.equal(decryptSecret("", secret), null, "empty value is rejected");

console.log("hatch-crypto: all checks passed");
