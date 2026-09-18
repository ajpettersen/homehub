import { isValidDateOnly } from "./dateOnly";

export type BulkCategory = "seasonal" | "appliance" | "water" | "filter" | "yard" | "cleaning" | "other";

export interface ParsedBulkTask {
  line: number;
  title: string;
  scheduleType: "recurring" | "one-time";
  frequencyDays: number | null;
  frequencyAssumed: boolean;
  dueDate: string | null;
  category: BulkCategory;
  error: string | null;
}

export const MAX_BULK_MAINTENANCE_TASKS = 100;

const CATEGORY_KEYWORDS: Array<[BulkCategory, RegExp]> = [
  ["filter", /\bfilters?\b/i],
  ["seasonal", /\b(winteri[sz](e|ing)|summeri[sz](e|ing)|(open|opening|close|closing) up|shut ?down)\b/i],
  ["water", /\b(well|septic|water|softener|sump|pipe|plumbing|faucet|hose|spigot|sprinkler|irrigation|pool|dock)\b/i],
  ["yard", /\b(gutters?|lawn|mow|yard|trees?|leaf|leaves|snow|decks?|fences?|garden|driveway|mulch|weed|shrubs?|hedges?|roof|siding|stain|seal)\b/i],
  ["appliance", /\b(furnace|boiler|hvac|a\/c|ac unit|heat pump|fireplace|chimney|generator|dryer|dishwasher|fridge|refrigerator|stove|oven|water heater|smoke|co detector|carbon monoxide|garage door|radiator)\b/i],
  ["cleaning", /\b(clean|vacuum|wash|dust|declutter|scrub|wipe|disinfect)\b/i],
  ["seasonal", /\b(winteri[sz]e|summeri[sz]e|open|close|shut|spring|fall|winter|summer)\b/i],
];

export function inferBulkCategory(title: string): BulkCategory {
  for (const [category, pattern] of CATEGORY_KEYWORDS) {
    if (pattern.test(title)) return category;
  }
  return "other";
}

const NAMED_FREQUENCIES: Array<[RegExp, number]> = [
  [/^(daily|every day)$/, 1],
  [/^(weekly|every week)$/, 7],
  [/^(biweekly|bi-weekly|every other week|every 2 weeks)$/, 14],
  [/^(monthly|every month)$/, 30],
  [/^(bimonthly|every other month)$/, 60],
  [/^(quarterly|every quarter)$/, 90],
  [/^(semiannual|semi-annual|semiannually|twice a year|twice yearly|biannual)$/, 180],
  [/^(yearly|annual|annually|every year|once a year)$/, 365],
];

/** Days for a phrase like "monthly" or "every 6 months"; months are 30 days and a year 365, matching the app's other repeat shortcuts. */
export function parseFrequencyDays(raw: string): number | null {
  const text = raw.trim().toLowerCase().replace(/\s+/g, " ");
  for (const [pattern, days] of NAMED_FREQUENCIES) {
    if (pattern.test(text)) return days;
  }
  const match = /^(?:every )?(\d+) ?(day|days|week|weeks|month|months|year|years|yr|yrs|mo|d|w|wk|wks)$/.exec(text);
  if (!match) return null;
  const count = Number(match[1]);
  const unit = match[2];
  let days: number;
  if (unit.startsWith("d")) days = count;
  else if (unit.startsWith("w")) days = count * 7;
  else if (unit.startsWith("y")) days = count * 365;
  else days = count === 12 ? 365 : count * 30;
  return Number.isInteger(days) && days >= 1 && days <= 3650 ? days : null;
}

function parseDate(raw: string): string | null {
  const text = raw.trim();
  if (isValidDateOnly(text)) return text;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (us) {
    const iso = `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
    return isValidDateOnly(iso) ? iso : null;
  }
  return null;
}

const ONE_TIME = /^(once|one-time|one time|onetime)$/i;

/**
 * One task per line: `Title | how often | first due date`. Everything after the
 * title is optional and may come in either order. "once" makes a one-time
 * task, which needs a date. A missing repeat defaults to yearly.
 */
export function parseBulkMaintenance(input: string): ParsedBulkTask[] {
  const tasks: ParsedBulkTask[] = [];
  input.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim();
    if (!line) return;
    const [rawTitle, ...rest] = line.split("|").map(part => part.trim());
    const task: ParsedBulkTask = {
      line: index + 1,
      title: rawTitle,
      scheduleType: "recurring",
      frequencyDays: null,
      frequencyAssumed: false,
      dueDate: null,
      category: inferBulkCategory(rawTitle),
      error: null,
    };

    let oneTime = false;
    const unrecognized: string[] = [];
    for (const part of rest.filter(Boolean)) {
      const date = parseDate(part);
      if (date) { task.dueDate = date; continue; }
      if (ONE_TIME.test(part)) { oneTime = true; continue; }
      const days = parseFrequencyDays(part);
      if (days !== null) { task.frequencyDays = days; continue; }
      unrecognized.push(part);
    }

    if (!rawTitle) task.error = "Missing a task name";
    else if (rawTitle.length > 200) task.error = "Task name is too long";
    else if (unrecognized.length > 0) task.error = `Couldn't read "${unrecognized[0]}" as a repeat or a date`;
    else if (oneTime && !task.dueDate) task.error = "One-time tasks need a date";

    if (oneTime) {
      task.scheduleType = "one-time";
      task.frequencyDays = null;
    } else if (task.frequencyDays === null) {
      task.frequencyDays = 365;
      task.frequencyAssumed = true;
    }
    tasks.push(task);
  });
  return tasks;
}

export function describeFrequency(days: number): string {
  if (days === 365) return "Yearly";
  if (days === 180) return "Every 6 months";
  if (days === 90) return "Every 3 months";
  if (days === 30) return "Monthly";
  if (days === 14) return "Every 2 weeks";
  if (days === 7) return "Weekly";
  if (days === 1) return "Daily";
  return `Every ${days} days`;
}

/** Days from today for a task with no date, so 50 new tasks don't all come due at once. */
export function spreadOffsetDays(index: number): number {
  return 1 + ((index * 2) % 56);
}
