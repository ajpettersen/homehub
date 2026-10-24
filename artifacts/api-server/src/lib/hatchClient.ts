// Read-only client for Hatch's unofficial cloud API, ported from the
// maintained community library https://github.com/dahlb/hatch_rest_api
// (see src/hatch_rest_api/hatch.py and scheduled_routine.py). Hatch has no
// public API, so this can break without notice; every failure is contained so
// it never takes the rest of HomeHub with it.
//
// The login comes from the household (entered in the app, see hatchCredentials.ts).

import { createHash } from "node:crypto";

// HATCH_API_URL lets local tests point at a pretend Hatch server; it is ignored in production.
const API_URL = process.env.NODE_ENV !== "production" && process.env.HATCH_API_URL ? process.env.HATCH_API_URL : "https://data.hatchbaby.com/";
const REQUEST_TIMEOUT_MS = 10_000;
const TOKEN_TTL_MS = 6 * 60 * 60_000;
const ALARMS_FRESH_MS = 5 * 60_000;
const ALARMS_STALE_OK_MS = 60 * 60_000;
// After a failed login, wait before trying again so a wrong password or a
// rate limit doesn't turn into a stream of login attempts.
const LOGIN_FAILURE_BACKOFF_MS = 15 * 60_000;

// Products asked for by default. The account's own list (from its member record) is added to this,
// so a model this code doesn't know by name is still returned.
const IOT_PRODUCTS = ["restMini", "restPlus", "riot", "riotPlus", "restBaby", "restoreIot", "restoreV4", "restoreV5"];

const WEEKDAY_BITS: Array<[string, number]> = [
  ["Mon", 2], ["Tue", 4], ["Wed", 8], ["Thu", 16], ["Fri", 32], ["Sat", 64], ["Sun", 1],
];
const ALL_DAYS_MASK = 127;
const WEEKDAYS_ONLY_MASK = 2 | 4 | 8 | 16 | 32;
const WEEKENDS_MASK = 1 | 64;

export interface HatchAlarm {
  id: string;
  /** "wake": a wake-up alarm (Restore alarms, Rest "wake" routines). "bedtime": a Rest "sleep" routine. */
  kind: "wake" | "bedtime";
  name: string;
  enabled: boolean;
  /** 24-hour "HH:MM" local time on the device. */
  wakeTime: string | null;
  /** "Weekdays", "Every day", "Mon, Wed" … or "Once". */
  days: string;
}

export interface HatchDevice {
  /** Opaque id for the browser; the device's MAC address stays on the server. */
  id: string;
  name: string;
  product: string;
  /** Hatch's own name for the model, e.g. "Restore 3", when it gives one. */
  modelName: string | null;
  /** False only when Hatch's schedules for this device couldn't be read at all. */
  alarmsSupported: boolean;
  alarms: HatchAlarm[];
}

export interface HatchSnapshot {
  devices: HatchDevice[];
  fetchedAt: string;
  /** True when Hatch couldn't be reached and this is an older copy. */
  stale: boolean;
}

/** Where to note what Hatch returns for devices we can't read alarms from (e.g. a request logger). */
export interface HatchDiagnostics {
  info: (details: object, message: string) => void;
}

export interface HatchAccount {
  /** Stable id for caching, e.g. "household:3". */
  key: string;
  email: string;
  password: string;
}

export function daysOfWeekLabel(daysOfWeek: number | null | undefined): string {
  const mask = typeof daysOfWeek === "number" && Number.isInteger(daysOfWeek) ? daysOfWeek & ALL_DAYS_MASK : 0;
  if (mask === 0) return "Once";
  if (mask === WEEKDAYS_ONLY_MASK) return "Weekdays";
  if (mask === WEEKENDS_MASK) return "Weekends";
  if (mask === ALL_DAYS_MASK) return "Every day";
  return WEEKDAY_BITS.filter(([, bit]) => mask & bit).map(([name]) => name).join(", ");
}

/** The wake time is the end of the alarm's sunrise window; Hatch stores it as local wall-clock text. */
export function wakeTimeOf(alarm: { startTime?: string | null; endTime?: string | null }): string | null {
  // Restore uses "2026-05-08T07:30:00"; Rest uses "2026-01-07 06:45:00".
  const match = /[T ](\d{2}):(\d{2})/.exec(alarm.endTime ?? alarm.startTime ?? "");
  return match ? `${match[1]}:${match[2]}` : null;
}

interface RawDevice { macAddress?: string; name?: string; product?: string; productDevice?: { marketingName?: string | null } }
interface RawAlarm {
  id?: number | string; name?: string; type?: string; enabled?: boolean;
  startTime?: string | null; endTime?: string | null; daysOfWeek?: number | null; displayOrder?: number | null;
}

interface AccountState {
  fingerprint: string;
  token: { value: string; at: number } | null;
  loginFailedAt: number;
  loginInFlight: Promise<string> | null;
  snapshot: { value: HatchSnapshot; at: number } | null;
  refreshInFlight: Promise<HatchSnapshot> | null;
}

const accounts = new Map<string, AccountState>();

/** Thrown when Hatch itself rejects the email and password. */
export class HatchAuthError extends Error {}

function stateFor(account: HatchAccount): AccountState {
  const fingerprint = createHash("sha256").update(`${account.email}\n${account.password}`).digest("hex");
  let state = accounts.get(account.key);
  // New credentials for the same household: start clean rather than reuse the old session.
  if (!state || state.fingerprint !== fingerprint) {
    state = { fingerprint, token: null, loginFailedAt: 0, loginInFlight: null, snapshot: null, refreshInFlight: null };
    accounts.set(account.key, state);
  }
  return state;
}

export function forgetHatchAccount(key: string): void {
  accounts.delete(key);
}

/** Hatch asked us to slow down (HTTP 429). */
export class HatchRateError extends Error {}
/** Hatch understood the request and said no: bad input, bad login, or an error payload. */
class HatchRejectedError extends Error {}

// Hatch doesn't rely on HTTP status codes alone (see dahlb/hatch_rest_api,
// hatch.py): replies carry `status: "success"`, and an expired session is
// `errorCode: "1001"` inside the JSON. Both styles are handled here.
async function hatchFetch(path: string, init: { method?: string; body?: unknown; token?: string; params?: URLSearchParams } = {}): Promise<unknown> {
  const url = new URL(path, API_URL);
  init.params?.forEach((value, key) => url.searchParams.append(key, value));
  const response = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      "User-Agent": "hatch_rest_api",
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(init.token ? { "X-HatchBaby-Auth": init.token } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 429) throw new HatchRateError("Hatch is rate limiting requests");

  const json = await response.json().catch(() => null) as { status?: unknown; errorCode?: unknown; message?: unknown } | null;
  if (json && typeof json === "object" && "status" in json && json.status !== "success") {
    if (String(json.errorCode) === "1001") throw new HatchAuthError("Hatch says the session is no longer valid");
    throw new HatchRejectedError(`Hatch error ${String(json.errorCode ?? response.status)}`);
  }
  if (response.status === 401 || response.status === 403) throw new HatchAuthError(`Hatch refused the request (${response.status})`);
  if (response.status >= 400 && response.status < 500) throw new HatchRejectedError(`Hatch rejected the request (${response.status})`);
  if (!response.ok) throw new Error(`Hatch returned ${response.status}`);
  if (json === null) throw new Error("Hatch sent a reply that isn't JSON");
  return json;
}

async function requestToken(email: string, password: string): Promise<string> {
  try {
    const body = await hatchFetch("public/v1/login", { method: "POST", body: { email, password } }) as { token?: string };
    if (!body.token) throw new HatchAuthError("Hatch sign-in returned no token");
    return body.token;
  } catch (error) {
    // At sign-in, Hatch saying "no" in any form means the email or password was not accepted.
    if (error instanceof HatchRejectedError) throw new HatchAuthError(error.message);
    throw error;
  }
}

/**
 * Checks an email and password against Hatch without touching any cached
 * session. Throws HatchAuthError if Hatch says no, another Error if it can't be reached.
 */
export async function verifyHatchLogin(email: string, password: string): Promise<void> {
  await requestToken(email, password);
}

async function login(account: HatchAccount, state: AccountState): Promise<string> {
  if (state.token && Date.now() - state.token.at < TOKEN_TTL_MS) return state.token.value;
  if (state.loginInFlight) return state.loginInFlight;
  if (Date.now() - state.loginFailedAt < LOGIN_FAILURE_BACKOFF_MS) throw new Error("Hatch sign-in failed recently; waiting before trying again");
  state.loginInFlight = (async () => {
    try {
      const value = await requestToken(account.email, account.password);
      state.token = { value, at: Date.now() };
      return value;
    } catch (error) {
      state.loginFailedAt = Date.now();
      throw error;
    } finally {
      state.loginInFlight = null;
    }
  })();
  return state.loginInFlight;
}

async function authorizedGet(account: HatchAccount, state: AccountState, path: string, params: URLSearchParams): Promise<unknown> {
  try {
    return await hatchFetch(path, { token: await login(account, state), params });
  } catch (error) {
    if (!(error instanceof HatchAuthError)) throw error;
    state.token = null;
    return hatchFetch(path, { token: await login(account, state), params });
  }
}

const LOCATION_KEY = /location|home|room|space|group|label/i;
const SHOWN_CODE_KEY = /^(products?|marketingName)$/;
const NEVER_SHOWN_KEY = /mac|thing|email|token|password|phone|address|serial|secret|key/i;

/**
 * A description of a reply's structure for diagnostics: field names and types,
 * plus short values only for fields that look like locations. Never includes
 * anything that looks personal or like a credential or device identifier.
 */
export function shapeOf(value: unknown, depth = 0, key = ""): unknown {
  if (Array.isArray(value)) {
    if (SHOWN_CODE_KEY.test(key) && value.every(item => typeof item === "string")) return value.slice(0, 12).map(item => String(item).slice(0, 40));
    return { array: value.length, first: value.length ? shapeOf(value[0], depth + 1, key) : null };
  }
  if (value && typeof value === "object") {
    if (depth >= 4) return "{…}";
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shapeOf(v, depth + 1, k)]));
  }
  if ((SHOWN_CODE_KEY.test(key) || LOCATION_KEY.test(key)) && !NEVER_SHOWN_KEY.test(key) && (typeof value === "string" || typeof value === "number")) return String(value).slice(0, 60);
  return value === null ? "null" : typeof value;
}

const WAKE_TYPES = new Set(["alarm", "wake"]);

/** `routines` is everything Hatch holds for the device, or null if it couldn't be read. */
export function buildDevice(raw: RawDevice, routines: RawAlarm[] | null): HatchDevice | null {
  if (!raw.macAddress || !raw.product) return null;
  const usable = (routines ?? []).filter(routine => routine.id !== undefined);
  const wake: HatchAlarm[] = usable
    .filter(routine => WAKE_TYPES.has(routine.type ?? ""))
    .sort((a, b) => (a.displayOrder ?? Infinity) - (b.displayOrder ?? Infinity))
    .map(routine => ({
      id: String(routine.id),
      kind: "wake" as const,
      name: routine.name?.trim() || "Alarm",
      enabled: routine.enabled === true,
      wakeTime: wakeTimeOf(routine),
      days: daysOfWeekLabel(routine.daysOfWeek),
    }));
  // Rest models list the same bedtime more than once (one per sound); show each time and days once.
  const seenBedtimes = new Set<string>();
  const bedtimes: HatchAlarm[] = usable
    .filter(routine => routine.type === "sleep" && wakeTimeOf(routine) !== null)
    .sort((a, b) => (a.displayOrder ?? Infinity) - (b.displayOrder ?? Infinity))
    .filter(routine => {
      const key = `${wakeTimeOf(routine)}|${routine.daysOfWeek ?? 0}|${routine.enabled === true}`;
      if (seenBedtimes.has(key)) return false;
      seenBedtimes.add(key);
      return true;
    })
    .map(routine => ({
      id: String(routine.id),
      kind: "bedtime" as const,
      name: routine.name?.trim() || "Bedtime",
      enabled: routine.enabled === true,
      wakeTime: wakeTimeOf(routine),
      days: daysOfWeekLabel(routine.daysOfWeek),
    }));
  return {
    id: Buffer.from(raw.macAddress).toString("base64url"),
    name: raw.name?.trim() || "Hatch",
    product: raw.product,
    modelName: raw.productDevice?.marketingName?.trim() || null,
    alarmsSupported: routines !== null,
    alarms: [...wake, ...bedtimes],
  };
}

async function fetchSnapshot(account: HatchAccount, state: AccountState, log?: HatchDiagnostics): Promise<HatchSnapshot> {
  // Ask for every product the account owns, not just the ones this code knows by name;
  // otherwise a newer model is silently left out of the list.
  let ownedProducts: string[] = [];
  let memberPayload: unknown = null;
  try {
    const member = await authorizedGet(account, state, "service/app/v2/member", new URLSearchParams()) as { payload?: { products?: unknown } };
    memberPayload = member.payload;
    const products = member.payload?.products;
    if (Array.isArray(products)) ownedProducts = products.filter((item): item is string => typeof item === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(item));
  } catch (error) {
    if (error instanceof HatchRateError) throw error;
    log?.info({ error: error instanceof Error ? error.message : String(error) }, "Hatch account look-up failed");
  }
  const params = new URLSearchParams();
  [...new Set([...IOT_PRODUCTS, ...ownedProducts])].forEach(product => params.append("iotProducts", product));
  const devicesBody = await authorizedGet(account, state, "service/app/iotDevice/v2/fetch", params) as { payload?: RawDevice[] };

  log?.info({
    memberShape: shapeOf(memberPayload),
    deviceShape: shapeOf((devicesBody.payload ?? [])[0]),
    deviceCount: (devicesBody.payload ?? []).length,
    ownedProducts,
  }, "Hatch account shape");

  const devices: HatchDevice[] = [];
  for (const raw of devicesBody.payload ?? []) {
    let routines: RawAlarm[] | null = null;
    if (raw.macAddress) {
      try {
        // Everything Hatch holds for the device; wake-ups and bedtimes are picked out by type.
        routines = ((await authorizedGet(account, state, "service/app/routine/v3/fetch", new URLSearchParams({ macAddress: raw.macAddress }))) as { payload?: RawAlarm[] }).payload ?? [];
      } catch (error) {
        if (error instanceof HatchRateError) throw error;
        routines = null; // one device failing shouldn't hide the others
      }
    }
    const device = buildDevice(raw, routines);
    if (device) devices.push(device);
    if (log && raw.macAddress && raw.product && routines && device && !device.alarms.some(alarm => alarm.kind === "wake")) {
      log.info({
        product: raw.product,
        routineCount: routines.length,
        routines: routines.slice(0, 20).map(r => ({ type: r.type, name: r.name, enabled: r.enabled, start: r.startTime, end: r.endTime, days: r.daysOfWeek })),
      }, "Hatch device with no wake-up schedule");
    }
  }
  return { devices, fetchedAt: new Date().toISOString(), stale: false };
}

/** Returns Hatch devices and alarms, or null when there's no login or Hatch can't be reached and nothing is cached. */
export async function getHatchSnapshot(account: HatchAccount | null, log?: HatchDiagnostics): Promise<HatchSnapshot | null> {
  if (!account) return null;
  const state = stateFor(account);
  if (state.snapshot && Date.now() - state.snapshot.at < ALARMS_FRESH_MS) return state.snapshot.value;
  if (!state.refreshInFlight) {
    state.refreshInFlight = fetchSnapshot(account, state, log)
      .then(value => { state.snapshot = { value, at: Date.now() }; return value; })
      .finally(() => { state.refreshInFlight = null; });
  }
  try {
    return await state.refreshInFlight;
  } catch {
    if (state.snapshot && Date.now() - state.snapshot.at < ALARMS_STALE_OK_MS) return { ...state.snapshot.value, stale: true };
    return null;
  }
}
