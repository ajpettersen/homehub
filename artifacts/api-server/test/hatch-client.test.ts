import assert from "node:assert/strict";
import { buildDevice, daysOfWeekLabel, getHatchSnapshot, isHatchConfigured, wakeTimeOf } from "../src/lib/hatchClient";

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
delete process.env.HATCH_EMAIL;
delete process.env.HATCH_PASSWORD;
assert.equal(isHatchConfigured(), false);
assert.equal(await getHatchSnapshot(), null, "not configured means no network calls and no data");

process.env.HATCH_EMAIL = "parent@example.com";
process.env.HATCH_PASSWORD = "not-a-real-password";
assert.equal(isHatchConfigured(), true);

type Call = { method: string; path: string; search: string; auth: string | null; body: unknown };
const calls: Call[] = [];
let rejectNextAuthedCall = false;
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
  if (url.pathname === "/public/v1/login") return json({ token: `token-${calls.filter(c => c.path === "/public/v1/login").length}` });
  if (rejectNextAuthedCall) { rejectNextAuthedCall = false; return json({}, 401); }
  if (url.pathname === "/service/app/iotDevice/v2/fetch") {
    return json({ payload: [
      { macAddress: "AA:BB:CC:DD:EE:01", name: "Maya's room", product: "restoreV5" },
      { macAddress: "AA:BB:CC:DD:EE:02", name: "Leo's old Rest", product: "restBaby" },
    ] });
  }
  if (url.pathname === "/service/app/routine/v3/fetch") {
    return json({ payload: [{ id: 1, name: "School", type: "alarm", enabled: true, endTime: "2026-05-08T06:45:00", daysOfWeek: 62 }] });
  }
  return json({}, 404);
}) as typeof fetch;

const first = await getHatchSnapshot();
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
const second = await getHatchSnapshot();
assert.equal(calls.length, callsBefore, "cached snapshot makes no network calls");
assert.equal(second, first);

console.log("hatch-client: all checks passed");
