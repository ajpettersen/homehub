import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { serializeRequestForLog } from "../src/lib/requestLogging";

const token = randomBytes(32).toString("base64url");
const validateRequest = {
  id: "validate",
  method: "POST",
  url: "/api/me/household-invites/validate",
  // The test deliberately models a token-bearing request body. The serializer
  // must not inspect or emit it.
  body: { token },
};
const redeemRequest = {
  id: "redeem",
  method: "POST",
  url: "/api/me/household-invites/redeem",
  body: { token },
};
const captured = [
  serializeRequestForLog(validateRequest),
  serializeRequestForLog(redeemRequest),
];

const logOutput = JSON.stringify(captured);
assert.equal(logOutput.includes(token), false);
assert.match(logOutput, /household-invites\/validate/);
assert.match(logOutput, /household-invites\/redeem/);

console.log("Invite token request logging tests passed");