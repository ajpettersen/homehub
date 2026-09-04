import assert from "node:assert/strict";

// Route modules initialize shared clients, but these helper tests never make a
// database or provider request.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ??= "https://example.invalid/v1";
process.env.AI_INTEGRATIONS_OPENAI_API_KEY ??= "test-key";

const { validateStructuredRecipeContent } = await import("../src/routes/recipes");
const { parseRecipeImage, validateReadRecipeStep } = await import("../src/routes/ai");
const { normalizeGroceryItemName } = await import("../src/routes/grocery");

assert.deepEqual(
  validateStructuredRecipeContent({
    ingredients: [{ name: "  carrots ", quantity: "2", category: "Produce" }],
    instructions: [" Peel carrots. "],
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 20,
    sourceType: "image",
  }).value,
  {
    ingredients: [{ name: "carrots", quantity: "2", category: "Produce" }],
    instructions: ["Peel carrots."],
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 20,
    sourceType: "image",
  },
);
assert.match(validateStructuredRecipeContent({ instructions: [""] }).error ?? "", /instructions/);
assert.match(validateStructuredRecipeContent({ servings: 0 }).error ?? "", /servings/);

assert.match(parseRecipeImage("not base64!").error ?? "", /base64/);
assert.match(parseRecipeImage(Buffer.from("not an image").toString("base64")).error ?? "", /supported/);
assert.equal(validateReadRecipeStep({ text: "Stir for two minutes.", stepNumber: 2 }).value?.stepNumber, 2);
assert.match(validateReadRecipeStep({ text: "x".repeat(2001) }).error ?? "", /2000/);
assert.equal(normalizeGroceryItemName("  Whole Milk  "), "whole milk");

console.log("Recipe validation helper tests passed");