import ical, { type VEvent } from "node-ical";

export interface KioskCalendarEvent {
  id: string;
  title: string;
  /** ISO timestamp, or YYYY-MM-DD for all-day events. */
  start: string;
  end: string | null;
  allDay: boolean;
  calendar: string;
}

export interface KioskWeather {
  temperatureF: number;
  feelsLikeF: number;
  windMph: number;
  humidityPct: number;
  code: number;
  isDay: boolean;
  highF: number;
  lowF: number;
  rainChancePct: number;
  /** Local wall-clock times such as "2026-10-07T07:21", in the forecast location's time zone. */
  sunrise: string | null;
  sunset: string | null;
  forecast: Array<{ date: string; highF: number; lowF: number; code: number; rainChancePct: number }>;
}

const CACHE_MS = 10 * 60_000;
const FETCH_TIMEOUT_MS = 8_000;
const calendarCache = new Map<string, { at: number; events: KioskCalendarEvent[] }>();
let weatherCache: { at: number; key: string; value: KioskWeather } | null = null;

/** KIOSK_CALENDAR_ICS_URLS: comma-separated, each either `https://…` or `Label|https://…`. */
export function parseCalendarSources(value: string | undefined): Array<{ label: string; url: string }> {
  const sources: Array<{ label: string; url: string }> = [];
  for (const entry of (value ?? "").split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf("|");
    const label = separator > 0 ? trimmed.slice(0, separator).trim() : `Calendar ${sources.length + 1}`;
    const url = (separator > 0 ? trimmed.slice(separator + 1) : trimmed).trim().replace(/^webcal:/i, "https:");
    if (url.startsWith("https://")) sources.push({ label, url });
  }
  return sources;
}

function localDateOnly(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

async function fetchCalendarEvents(label: string, url: string, from: Date, to: Date): Promise<KioskCalendarEvent[]> {
  const cached = calendarCache.get(url);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.events;

  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Calendar "${label}" returned ${response.status}`);
  const parsed = ical.parseICS(await response.text());

  const events: KioskCalendarEvent[] = [];
  for (const item of Object.values(parsed)) {
    if (!item || item.type !== "VEVENT") continue;
    const event = item as VEvent;
    const instances = event.rrule
      ? ical.expandRecurringEvent(event, { from, to })
      : [{ start: event.start, end: event.end, summary: event.summary, isFullDay: event.datetype === "date" }];
    for (const instance of instances) {
      const start = instance.start as Date | undefined;
      if (!start || start > to) continue;
      const end = (instance.end as Date | undefined) ?? null;
      if ((end ?? start) < from) continue;
      const allDay = Boolean((instance as { isFullDay?: boolean }).isFullDay);
      const summary = typeof instance.summary === "string" ? instance.summary : (instance.summary as { val?: string } | undefined)?.val;
      events.push({
        id: `${label}:${event.uid}:${start.toISOString()}`,
        title: summary?.trim() || "(No title)",
        start: allDay ? localDateOnly(start) : start.toISOString(),
        end: end ? (allDay ? localDateOnly(end) : end.toISOString()) : null,
        allDay,
        calendar: label,
      });
    }
  }
  calendarCache.set(url, { at: Date.now(), events });
  return events;
}

export async function getKioskCalendar(
  sources: Array<{ label: string; url: string }>,
  days = 14,
): Promise<{ events: KioskCalendarEvent[]; errors: string[] }> {
  const from = new Date(Date.now() - 24 * 60 * 60_000);
  const to = new Date(Date.now() + days * 24 * 60 * 60_000);
  const results = await Promise.allSettled(sources.map(source => fetchCalendarEvents(source.label, source.url, from, to)));
  const events: KioskCalendarEvent[] = [];
  const errors: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") events.push(...result.value);
    else errors.push(sources[index].label);
  });
  events.sort((a, b) => a.start.localeCompare(b.start));
  return { events, errors };
}

/**
 * Open-Meteo's daily code reports "cloudy" (3) if any single hour was, so a
 * mostly sunny day gets a cloud icon. For dry days, pick the icon from the
 * day's average cloud cover instead; keep rain, snow, fog and storm codes.
 */
export function dayIconCode(dailyCode: number, cloudMeanPct: number | null | undefined): number {
  if (dailyCode >= 45 || cloudMeanPct === null || cloudMeanPct === undefined) return dailyCode;
  if (cloudMeanPct < 25) return 0;
  if (cloudMeanPct < 50) return 1;
  if (cloudMeanPct < 75) return 2;
  return 3;
}

export async function getKioskWeather(latitude: number, longitude: number): Promise<KioskWeather | null> {
  const key = `${latitude},${longitude}`;
  if (weatherCache && weatherCache.key === key && Date.now() - weatherCache.at < 15 * 60_000) return weatherCache.value;
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
    url.searchParams.set("current", "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day");
    url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,cloud_cover_mean,sunrise,sunset");
    url.searchParams.set("temperature_unit", "fahrenheit");
    url.searchParams.set("wind_speed_unit", "mph");
    url.searchParams.set("timezone", "auto");
    url.searchParams.set("forecast_days", "5");
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return weatherCache?.key === key ? weatherCache.value : null;
    const data = await response.json() as {
      current: {
        temperature_2m: number; apparent_temperature: number; relative_humidity_2m: number;
        wind_speed_10m: number; weather_code: number; is_day: number;
      };
      daily: {
        time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[];
        precipitation_probability_max: Array<number | null>; cloud_cover_mean: Array<number | null>;
        sunrise: string[]; sunset: string[];
      };
    };
    const forecast = data.daily.time.map((date, index) => ({
      date,
      highF: Math.round(data.daily.temperature_2m_max[index]),
      lowF: Math.round(data.daily.temperature_2m_min[index]),
      code: dayIconCode(data.daily.weather_code[index], data.daily.cloud_cover_mean[index]),
      rainChancePct: Math.round(data.daily.precipitation_probability_max[index] ?? 0),
    }));
    const value: KioskWeather = {
      temperatureF: Math.round(data.current.temperature_2m),
      feelsLikeF: Math.round(data.current.apparent_temperature),
      windMph: Math.round(data.current.wind_speed_10m),
      humidityPct: Math.round(data.current.relative_humidity_2m),
      code: data.current.weather_code,
      isDay: data.current.is_day === 1,
      highF: forecast[0]?.highF ?? Math.round(data.current.temperature_2m),
      lowF: forecast[0]?.lowF ?? Math.round(data.current.temperature_2m),
      rainChancePct: forecast[0]?.rainChancePct ?? 0,
      sunrise: data.daily.sunrise[0] ?? null,
      sunset: data.daily.sunset[0] ?? null,
      forecast,
    };
    weatherCache = { at: Date.now(), key, value };
    return value;
  } catch {
    return weatherCache?.key === key ? weatherCache.value : null;
  }
}
