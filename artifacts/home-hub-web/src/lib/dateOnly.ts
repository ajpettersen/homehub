import { format, parseISO } from "date-fns";

/**
 * Returns the user's local calendar day in the API's date-only format.
 * Do not use Date#toISOString() here: it converts the local day to UTC.
 */
export function getLocalDateOnly(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Returns the browser's resolved IANA timezone. UTC keeps date-only API calls
 * deterministic in runtimes that do not expose Intl timezone information.
 */
export function getResolvedTimeZone(): string {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof timeZone === "string" && timeZone ? timeZone : "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Formats an API YYYY-MM-DD value as a calendar day, without UTC conversion.
 */
export function formatDateOnly(dateOnly: string, pattern: string): string {
  return format(parseISO(dateOnly), pattern);
}