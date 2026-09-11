import OpenAI from "openai";

// The OpenAI integration is optional: the app's core AI runs on Claude, and
// only voice (speech) and image-generation features use OpenAI. Constructing
// the client lazily lets the server boot without OpenAI credentials.
export function isOpenAiConfigured(): boolean {
  return Boolean(
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL &&
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  );
}

let lazyOpenAi: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!isOpenAiConfigured()) {
    throw new Error(
      "The OpenAI integration is not configured; voice and image features are unavailable.",
    );
  }
  return (lazyOpenAi ??= new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  }));
}

export const openai: OpenAI = new Proxy({} as OpenAI, {
  get: (_target, prop) => (getOpenAI() as unknown as Record<string | symbol, unknown>)[prop],
});
