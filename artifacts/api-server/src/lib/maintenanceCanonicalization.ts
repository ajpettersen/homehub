/**
 * Gives common maintenance titles a deliberately narrow comparison key. This
 * is not a general semantic matcher: equipment/location nouns remain in the
 * key so independently maintained equipment can still have separate tasks.
 */
export function canonicalizeMaintenanceTitle(title: string): string {
  let tokens = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      if (token === "filters") return "filter";
      if (token === "units") return "unit";
      return token;
    });

  const replacementVerbs = new Set(["change", "replace", "swap", "renew"]);
  const articles = new Set(["a", "an", "the"]);
  while (replacementVerbs.has(tokens[0]) || articles.has(tokens[0])) {
    tokens = tokens.slice(1);
  }

  // HVAC, furnace, and air-conditioning filters are commonly described with
  // different names. Only collapse these aliases in a filter context, leaving
  // names such as "furnace inspection" and other equipment tasks distinct.
  const hasFilter = tokens.includes("filter");
  const hasHvacAlias = tokens.some((token, index) =>
    token === "hvac" ||
    token === "furnace" ||
    token === "ac" ||
    (token === "air" && ["filter", "conditioning", "conditioner", "unit"].includes(tokens[index + 1] ?? "")) ||
    (["conditioning", "conditioner"].includes(token) && tokens[index - 1] === "air"),
  );
  if (hasFilter && hasHvacAlias) {
    const hvacAliases = new Set([
      "hvac", "furnace", "air", "ac", "conditioning", "conditioner", "unit",
      "change", "replace", "swap", "renew", "replacement",
    ]);
    tokens = tokens.filter((token) => !hvacAliases.has(token));
  }

  return tokens.join(" ");
}

/** Parse the optional maintenance-history query flag without truthy coercion. */
export function parseIncludeCompletedQuery(value: unknown):
  | { ok: true; includeCompleted: boolean }
  | { ok: false } {
  if (value === undefined) return { ok: true, includeCompleted: false };
  if (value === "true") return { ok: true, includeCompleted: true };
  if (value === "false") return { ok: true, includeCompleted: false };
  return { ok: false };
}