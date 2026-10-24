import assert from "node:assert/strict";
import { HatchAuthError, HatchRateError, buildDevice, shapeOf, daysOfWeekLabel, forgetHatchAccount, getHatchSnapshot, verifyHatchLogin, wakeTimeOf, type HatchAccount } from "../src/lib/hatchClient";

// ── pure helpers ──────────────────────────────────────────────────────────────
assert.equal(daysOfWeekLabel(127), "Every day");
assert.equal(daysOfWeekLabel(2 | 4 | 8 | 16 | 32), "Weekdays");
assert.equal(daysOfWeekLabel(1 | 64), "Weekends");
assert.equal(daysOfWeekLabel(2 | 8), "Mon, Wed");
assert.equal(daysOfWeekLabel(0), "Once");
assert.equal(daysOfWeekLabel(null), "Once");
assert.equal(daysOfWeekLabel(undefined), "Once");

// Wake time is the end of the sunrise window; fall back to the start.
assert.equal(wakeTimeOf({ startTime: "2026-05-08T07:30:00", endTime: "2026-05-08T08:00:00" }), "08:00");
assert.equal(wakeTimeOf({ startTime: "2026-05-08T07:30:00", endTime: null }), "07:30");
assert.equal(wakeTimeOf({}), null);

const restore = buildDevice(
  { macAddress: "AA:BB:CC:DD:EE:01", name: "  Maya's room ", product: "restoreV5" },
  [
    { id: 2, name: "Later", type: "alarm", enabled: false, endTime: "2026-05-08T08:00:00", daysOfWeek: 1 | 64, displayOrder: 2 },
    { id: 1, name: "School", type: "alarm", enabled: true, endTime: "2026-05-08T06:45:00", daysOfWeek: 2 | 4 | 8 | 16 | 32, displayOrder: 1 },
    { id: 9, name: "Not an alarm", type: "routine", enabled: true },
  ],
);
assert.ok(restore);
assert.equal(restore.name, "Maya's room");
assert.equal(restore.alarmsSupported, true);
assert.deepEqual(restore.alarms.map(alarm => alarm.name), ["School", "Later"], "alarms only, in display order");
assert.equal(restore.alarms[0].wakeTime, "06:45");
assert.equal(restore.alarms[0].days, "Weekdays");
assert.equal(restore.alarms[1].enabled, false);
assert.ok(!restore.id.includes("AA:BB"), "the device's MAC address is not exposed as its id");

const oldRest = buildDevice({ macAddress: "AA:BB:CC:DD:EE:02", name: "Leo's old Rest", product: "restBaby" }, null);
assert.ok(oldRest);
assert.equal(oldRest.alarmsSupported, false, "first-generation Rest has no scheduled-routine alarms");
assert.deepEqual(oldRest.alarms, []);
assert.equal(buildDevice({ name: "No mac", product: "restoreV5" }, []), null, "devices without a MAC are ignored");

// ── client against a pretend Hatch ────────────────────────────────────────────
assert.equal(await getHatchSnapshot(null), null, "no login means no network calls and no data");

const account: HatchAccount = { key: "household:1", email: "parent@example.com", password: "not-a-real-password" };

type Call = { method: string; path: string; search: string; auth: string | null; body: unknown };
const calls: Call[] = [];
let rejectNextAuthedCall = false;
let loginStatus = 200;
let loginMode: "ok" | "error-payload" | "real-failure" = "ok";
let expiredStyle: "http" | "payload" = "http";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

globalThis.fetch = (async (input: URL | string, init?: RequestInit) => {
  const url = new URL(String(input));
  const headers = new Headers(init?.headers);
  calls.push({
    method: init?.method ?? "GET",
    path: url.pathname,
    search: url.search,
    auth: headers.get("X-HatchBaby-Auth"),
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  });
  assert.equal(url.origin, "https://data.hatchbaby.com", "only ever talks to Hatch");
  if (url.pathname === "/public/v1/login") {
    if (loginMode === "real-failure") return json({ errorCode: "1001", message: "Login failed for [parent@example.com]", payload: null, status: "failure", sync: null });
    if (loginMode === "error-payload") return json({ status: "error", errorCode: "2002", message: "Invalid credentials" });
    if (loginStatus !== 200) return json({}, loginStatus);
    return json({ status: "success", token: `token-${calls.filter(c => c.path === "/public/v1/login").length}` });
  }
  if (rejectNextAuthedCall) {
    rejectNextAuthedCall = false;
    return expiredStyle === "payload" ? json({ status: "error", errorCode: "1001", message: "session invalid" }) : json({}, 401);
  }
  if (url.pathname === "/service/app/v2/member") {
    return json({ status: "success", payload: { id: 1, email: "probe@example.com", firstName: "Probe", locations: [{ id: 3, locationName: "Cabin" }] } });
  }
  if (url.pathname === "/service/app/iotDevice/v2/fetch") {
    return json({ status: "success", payload: [
      { macAddress: "AA:BB:CC:DD:EE:01", name: "Maya's room", product: "restoreV5" },
      { macAddress: "AA:BB:CC:DD:EE:02", name: "Leo's old Rest", product: "restBaby" },
    ] });
  }
  if (url.pathname === "/service/app/routine/v3/fetch") {
    return json({ status: "success", payload: [{ id: 1, name: "School", type: "alarm", enabled: true, endTime: "2026-05-08T06:45:00", daysOfWeek: 62 }] });
  }
  return json({}, 404);
}) as typeof fetch;

const first = await getHatchSnapshot(account);
assert.ok(first);
assert.equal(first.stale, false);
assert.equal(first.devices.length, 2);
assert.equal(first.devices[0].alarms[0].wakeTime, "06:45");
assert.equal(first.devices[1].alarmsSupported, false);

const login = calls.find(call => call.path === "/public/v1/login");
assert.ok(login);
assert.equal(login.method, "POST");
assert.deepEqual(login.body, { email: "parent@example.com", password: "not-a-real-password" });
assert.ok(calls.filter(call => call.path !== "/public/v1/login").every(call => call.auth === "token-1"), "the token is sent on every data call");
const deviceCall = calls.find(call => call.path === "/service/app/iotDevice/v2/fetch");
assert.ok(deviceCall?.search.includes("iotProducts=restoreV5") && deviceCall.search.includes("iotProducts=restBaby"), "product list is sent as repeated parameters");
const alarmCalls = calls.filter(call => call.path === "/service/app/routine/v3/fetch");
assert.equal(alarmCalls.length, 1, "alarms are only fetched for devices that support them");
assert.ok(alarmCalls[0].search.includes("macAddress=AA%3ABB%3ACC%3ADD%3AEE%3A01") && alarmCalls[0].search.includes("types=alarm"));

// A second call within five minutes is served from the cache: no extra requests.
const callsBefore = calls.length;
const second = await getHatchSnapshot(account);
assert.equal(calls.length, callsBefore, "cached snapshot makes no network calls");
assert.equal(second, first);

// ── account handling ──────────────────────────────────────────────────────────
const logins = () => calls.filter(call => call.path === "/public/v1/login");

// A different household gets its own session and cache.
const otherAccount: HatchAccount = { key: "household:2", email: "other@example.com", password: "another-password" };
const loginsBeforeOther = logins().length;
const other = await getHatchSnapshot(otherAccount);
assert.ok(other);
assert.equal(logins().length, loginsBeforeOther + 1, "a second household signs in separately");
assert.deepEqual(logins().at(-1)?.body, { email: "other@example.com", password: "another-password" });

// Reconnecting the same household with new credentials never reuses the old session.
const changed: HatchAccount = { key: "household:1", email: "new@example.com", password: "new-password" };
const loginsBeforeChange = logins().length;
await getHatchSnapshot(changed);
assert.equal(logins().length, loginsBeforeChange + 1, "new credentials trigger a fresh sign-in");
assert.deepEqual(logins().at(-1)?.body, { email: "new@example.com", password: "new-password" });

// Disconnecting clears the cache, so the next request starts from scratch.
forgetHatchAccount("household:2");
const loginsBeforeForget = logins().length;
await getHatchSnapshot(otherAccount);
assert.equal(logins().length, loginsBeforeForget + 1, "a forgotten account signs in again");

// An expired session is refreshed once, transparently.
const flaky: HatchAccount = { key: "household:3", email: "flaky@example.com", password: "flaky-password" };
await getHatchSnapshot(flaky);
const loginsBeforeExpiry = logins().length;
forgetHatchAccount("household:3");
await getHatchSnapshot(flaky); // fresh state, fresh login
rejectNextAuthedCall = true;
forgetHatchAccount("household:3");
const recovered = await getHatchSnapshot(flaky);
assert.ok(recovered, "a 401 mid-request is recovered by signing in again");
assert.ok(logins().length >= loginsBeforeExpiry + 3);

// verifyHatchLogin: yes, no, and unreachable are told apart, and nothing is cached.
const loginsBeforeVerify = logins().length;
await verifyHatchLogin("parent@example.com", "right-password");
assert.equal(logins().length, loginsBeforeVerify + 1);
loginStatus = 401;
await assert.rejects(() => verifyHatchLogin("parent@example.com", "wrong"), HatchAuthError, "a refused login is an auth error");
loginStatus = 500;
await assert.rejects(
  () => verifyHatchLogin("parent@example.com", "anything"),
  (error: unknown) => error instanceof Error && !(error instanceof HatchAuthError),
  "an outage is not mistaken for a wrong password",
);
loginStatus = 200;

// A wrong password is not retried in a loop: after a failed sign-in the client waits.
const wrong: HatchAccount = { key: "household:4", email: "wrong@example.com", password: "wrong" };
loginStatus = 401;
const loginsBeforeWrong = logins().length;
assert.equal(await getHatchSnapshot(wrong), null, "bad credentials yield no data");
assert.equal(await getHatchSnapshot(wrong), null);
assert.equal(logins().length, loginsBeforeWrong + 1, "only one sign-in attempt, then it backs off");
loginStatus = 200;

// Hatch's own error styles. A refusal inside a normal-looking reply is a refused login...
loginMode = "error-payload";
await assert.rejects(() => verifyHatchLogin("parent@example.com", "wrong"), HatchAuthError, "an error payload at sign-in is a refused login");
loginMode = "ok";
// ...including the exact shape real Hatch uses (HTTP 200 with status "failure" and errorCode "1001").
loginMode = "real-failure";
await assert.rejects(() => verifyHatchLogin("parent@example.com", "wrong"), HatchAuthError, "Hatch's real bad-login reply is a refused login");
loginMode = "ok";
// ...a 400-style rejection at sign-in is too...
loginStatus = 400;
await assert.rejects(() => verifyHatchLogin("parent@example.com", "wrong"), HatchAuthError, "a 4xx at sign-in is a refused login");
// ...but a rate limit or an outage never is, so the household isn't told its password is wrong.
loginStatus = 429;
await assert.rejects(
  () => verifyHatchLogin("parent@example.com", "anything"),
  HatchRateError,
  "rate limiting is reported as rate limiting, not as a wrong password or an outage",
);
loginStatus = 200;

// An expired session reported the Hatch way (errorCode 1001 inside the reply) is also refreshed once.
const payloadExpiry: HatchAccount = { key: "household:5", email: "p@example.com", password: "payload-password" };
await getHatchSnapshot(payloadExpiry);
forgetHatchAccount("household:5");
expiredStyle = "payload";
rejectNextAuthedCall = true;
const recoveredFromPayload = await getHatchSnapshot(payloadExpiry);
assert.ok(recoveredFromPayload, "an expired-session code inside the reply is recovered by signing in again");
expiredStyle = "http";

// Devices whose alarms can't be read are looked at once per refresh and noted in the log;
// readable ones aren't, and nothing is logged when no sink is given.
const noted: Array<{ details: Record<string, unknown>; message: string }> = [];
const probeAccount: HatchAccount = { key: "household:6", email: "probe@example.com", password: "probe-password" };
const probed = await getHatchSnapshot(probeAccount, { info: (details, message) => noted.push({ details: details as Record<string, unknown>, message }) });
assert.ok(probed);
const deviceNotes = noted.filter(note => note.message === "Hatch device without scheduled-routine alarms");
assert.equal(deviceNotes.length, 1, "only the device without readable alarms is noted");
assert.equal(deviceNotes[0].details.product, "restBaby");
assert.equal(deviceNotes[0].details.routineCount, 1);
const accountNotes = noted.filter(note => note.message === "Hatch account shape");
assert.equal(accountNotes.length, 1, "the account's structure is noted once per refresh");
assert.ok(JSON.stringify(accountNotes[0]).includes("Cabin"), "location names from the account are visible in the note");
assert.ok(!JSON.stringify(noted).includes("AA:BB"), "device MAC addresses are never logged");
assert.ok(!JSON.stringify(noted).includes("probe-password") && !JSON.stringify(noted).includes("probe@example.com"), "credentials are never logged");

// Diagnostics describe structure without leaking personal data or device identifiers.
const shape = JSON.stringify(shapeOf({
  id: 7, email: "mom@example.com", macAddress: "AA:BB:CC:DD:EE:FF", token: "secret-token", firstName: "Emily",
  locations: [{ id: 3, locationName: "Cabin", homeAddress: "1 Lake Rd", macAddress: "AA:11" }],
  nested: { deep: { deeper: { deepest: { tooDeep: true } } } },
}));
assert.ok(shape.includes("Cabin"), "location names are shown");
assert.ok(!shape.includes("mom@example.com") && !shape.includes("AA:BB") && !shape.includes("secret-token") && !shape.includes("Emily") && !shape.includes("1 Lake Rd"), "personal data and identifiers are never shown");
assert.ok(shape.includes('"email":"string"') && shape.includes('"locations":{"array":1'), "structure and types are still visible");

console.log("hatch-client: all checks passed");
