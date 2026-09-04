export function isDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  return month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** UTC is the stable fallback for clients predating timezone support. */
export function resolveMaintenanceTimeZone(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return "UTC";
  if (typeof value !== "string" || value.length > 100) return null;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return value;
  } catch {
    return null;
  }
}

export function dateInMaintenanceTimeZone(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Add calendar days without involving the server's local timezone. */
export function addMaintenanceDays(dateOnly: string, days: number): string {
  const date = new Date(`${dateOnly}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Return the anchored occurrence on or after a date-only comparison day.
 * Parsing is pinned to UTC solely for integer calendar-day arithmetic.
 */
export function getNextAnchoredMaintenanceDate(
  startDate: string,
  frequencyDays: number,
  afterDate: string,
): string {
  if (startDate >= afterDate) return startDate;
  const startMs = Date.parse(`${startDate}T00:00:00Z`);
  const afterMs = Date.parse(`${afterDate}T00:00:00Z`);
  const diffDays = Math.ceil((afterMs - startMs) / 86_400_000);
  return addMaintenanceDays(startDate, Math.ceil(diffDays / frequencyDays) * frequencyDays);
}