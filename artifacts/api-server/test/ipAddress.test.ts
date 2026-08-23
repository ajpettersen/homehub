import assert from "node:assert/strict";
import { isBlockedIPv4, isBlockedIPv6 } from "../src/lib/ipAddress";

assert.equal(isBlockedIPv4("127.0.0.1"), true);
assert.equal(isBlockedIPv6("::1"), true);
assert.equal(isBlockedIPv6("::ffff:127.0.0.1"), true);
assert.equal(isBlockedIPv6("::ffff:7f00:1"), true);
assert.equal(isBlockedIPv6("::ffff:c0a8:0101"), true);
assert.equal(isBlockedIPv6("::ffff:a9fe:0101"), true);
assert.equal(isBlockedIPv6("2001:db8::1"), true);
assert.equal(isBlockedIPv6("2606:4700:4700::1111"), false);

console.log("IP address SSRF guard tests passed");