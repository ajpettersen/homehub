// Read-only client for Hatch's unofficial cloud API, ported from the
// maintained community library https://github.com/dahlb/hatch_rest_api
// (see src/hatch_rest_api/hatch.py and scheduled_routine.py). Hatch has no
// public API, so this can break without notice; every failure is contained so
// it never takes the rest of HomeHub with it.
//
// Credentials come from HATCH_EMAIL / HATCH_PASSWORD (set in Railway).

const API_URL = "https://data.hatchbaby.com/";
const REQUEST_TIMEOUT_MS = 10_000;
const TOKEN_TTL_MS = 6 * 60 * 60_000;
const ALARMS_FRESH_MS = 5 * 60_000;
const ALARMS_STALE_OK_MS = 60 * 60_000;
// After a failed login, wait before trying again so a wrong password or a
// rate limit doesn't turn into a stream of login attempts.
const LOGIN_FAILURE_BACKOFF_MS = 15 * 60_000;

// Restore, Restore 2 and Restore 3 keep their alarms as scheduled routines.
const SCHEDULED_ALARM_PRODUCTS = new Set(["restoreIot", "restoreV4", "restoreV5"]);
const IOT_PRODUCTS = ["restMini", "restPlus", "riot", "riotPlus", "restBaby", "restoreIot", "restoreV4", "restoreV5"];

const WEEKDAY_BITS: Array<[string, number]> = [
  ["Mon", 2], ["Tue", 4], ["Wed", 8], ["Thu", 16], ["Fri", 32], ["Sat", 64], ["Sun", 1],
];
const ALL_DAYS_MASK = 127;
const WEEKDAYS_ONLY_MASK = 2 | 4 | 8 | 16 | 32;
const WEEKENDS_MASK = 1 | 64;

export interface HatchAlarm {
  id: string;
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
  alarmsSupported: boolean;
  alarms: HatchAlarm[];
}

export interface HatchSnapshot {
  devices: HatchDevice[];
  fetchedAt: string;
  /** True when Hatch couldn't be reached and this is an older copy. */
  stale: boolean;
}

export function isHatchConfigured(): boolean {
  return !!process.env.HATCH_EMAIL?.trim() && !!process.env.HATCH_PASSWORD;
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
  const match = /T(\d{2}):(\d{2})/.exec(alarm.endTime ?? alarm.startTime ?? "");
  return match ? `${match[1]}:${match[2]}` : null;
}

interface RawDevice { macAddress?: string; name?: string; product?: string }
interface RawAlarm {
  id?: number | string; name?: string; type?: string; enabled?: boolean;
  startTime?: string | null; endTime?: string | null; daysOfWeek?: number | null; displayOrder?: number | null;
}

let token: { value: string; at: number } | null = null;
let loginFailedAt = 0;
let loginInFlight: Promise<string> | null = null;
let snapshot: { value: HatchSnapshot; at: number } | null = null;
let refreshInFlight: Promise<HatchSnapshot> | null = null;

class HatchAuthError extends Error {}

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
  if (response.status === 401 || response.status === 403) throw new HatchAuthError(`Hatch refused the request (${response.status})`);
  if (!response.ok) throw new Error(`Hatch returned ${response.status}`);
  return response.json();
}

async function login(): Promise<string> {
  if (token && Date.now() - token.at < TOKEN_TTL_MS) return token.value;
  if (loginInFlight) return loginInFlight;
  if (Date.now() - loginFailedAt < LOGIN_FAILURE_BACKOFF_MS) throw new Error("Hatch sign-in failed recently; waiting before trying again");
  loginInFlight = (async () => {
    try {
      const body = await hatchFetch("public/v1/login", {
        method: "POST",
        body: { email: process.env.HATCH_EMAIL?.trim(), password: process.env.HATCH_PASSWORD },
      }) as { token?: string };
      if (!body.token) throw new Error("Hatch sign-in returned no token");
      token = { value: body.token, at: Date.now() };
      return body.token;
    } catch (error) {
      loginFailedAt = Date.now();
      throw error;
    } finally {
      loginInFlight = null;
    }
  })();
  return loginInFlight;
}

async function authorizedGet(path: string, params: URLSearchParams): Promise<unknown> {
  try {
    return await hatchFetch(path, { token: await login(), params });
  } catch (error) {
    if (!(error instanceof HatchAuthError)) throw error;
    token = null;
    return hatchFetch(path, { token: await login(), params });
  }
}

export function buildDevice(raw: RawDevice, alarms: RawAlarm[] | null): HatchDevice | null {
  if (!raw.macAddress || !raw.product) return null;
  const supported = SCHEDULED_ALARM_PRODUCTS.has(raw.product);
  return {
    id: Buffer.from(raw.macAddress).toString("base64url"),
    name: raw.name?.trim() || "Hatch",
    product: raw.product,
    alarmsSupported: supported,
    alarms: (alarms ?? [])
      .filter(alarm => alarm.type === "alarm" && alarm.id !== undefined)
      .sort((a, b) => (a.displayOrder ?? Infinity) - (b.displayOrder ?? Infinity))
      .map(alarm => ({
        id: String(alarm.id),
        name: alarm.name?.trim() || "Alarm",
        enabled: alarm.enabled === true,
        wakeTime: wakeTimeOf(alarm),
        days: daysOfWeekLabel(alarm.daysOfWeek),
      })),
  };
}

async function fetchSnapshot(): Promise<HatchSnapshot> {
  const params = new URLSearchParams();
  IOT_PRODUCTS.forEach(product => params.append("iotProducts", product));
  const devicesBody = await authorizedGet("service/app/iotDevice/v2/fetch", params) as { payload?: RawDevice[] };

  const devices: HatchDevice[] = [];
  for (const raw of devicesBody.payload ?? []) {
    let alarms: RawAlarm[] | null = null;
    if (raw.macAddress && raw.product && SCHEDULED_ALARM_PRODUCTS.has(raw.product)) {
      try {
        const alarmParams = new URLSearchParams({ macAddress: raw.macAddress });
        alarmParams.append("types", "alarm");
        alarms = ((await authorizedGet("service/app/routine/v3/fetch", alarmParams)) as { payload?: RawAlarm[] }).payload ?? [];
      } catch {
        alarms = null; // one device failing shouldn't hide the others
      }
    }
    const device = buildDevice(raw, alarms);
    if (device) devices.push(device);
  }
  return { devices, fetchedAt: new Date().toISOString(), stale: false };
}

/** Returns Hatch devices and alarms, or null when Hatch isn't set up or can't be reached and nothing is cached. */
export async function getHatchSnapshot(): Promise<HatchSnapshot | null> {
  if (!isHatchConfigured()) return null;
  if (snapshot && Date.now() - snapshot.at < ALARMS_FRESH_MS) return snapshot.value;
  if (!refreshInFlight) {
    refreshInFlight = fetchSnapshot()
      .then(value => { snapshot = { value, at: Date.now() }; return value; })
      .finally(() => { refreshInFlight = null; });
  }
  try {
    return await refreshInFlight;
  } catch {
    if (snapshot && Date.now() - snapshot.at < ALARMS_STALE_OK_MS) return { ...snapshot.value, stale: true };
    return null;
  }
}
