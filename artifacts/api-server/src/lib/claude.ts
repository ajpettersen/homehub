import Anthropic from "@anthropic-ai/sdk";

export const CLAUDE_MAIN_MODEL = "claude-opus-5";
export const CLAUDE_FAST_MODEL = "claude-sonnet-5";

let client: Anthropic | null = null;

export function claude(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY must be set to use AI features.");
  }
  return (client ??= new Anthropic());
}

export function textFromResponse(response: Anthropic.Message): string {
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map(block => block.text)
    .join("");
}

const IMAGE_DATA_URL = /^data:(image\/(?:jpeg|png|webp|gif));base64,([a-z0-9+/=\r\n]+)$/i;

export function imageBlockFromDataUrl(dataUrl: string): Anthropic.ImageBlockParam {
  const match = IMAGE_DATA_URL.exec(dataUrl);
  if (!match) {
    throw new Error("Images must be base64 JPEG, PNG, WebP, or GIF data URLs");
  }
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: match[1].toLowerCase() as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
      data: match[2].replace(/\s+/g, ""),
    },
  };
}

type ClaudeCallOptions = {
  model?: string;
  maxTokens?: number;
  system?: string;
  messages: Anthropic.MessageParam[];
};

export async function claudeText(opts: ClaudeCallOptions): Promise<string> {
  const response = await claude().messages.create({
    model: opts.model ?? CLAUDE_MAIN_MODEL,
    max_tokens: opts.maxTokens ?? 8000,
    ...(opts.system ? { system: opts.system } : {}),
    messages: opts.messages,
  });
  return textFromResponse(response);
}

export async function claudeJson<T>(
  opts: ClaudeCallOptions & { schema: Record<string, unknown> },
): Promise<T> {
  const response = await claude().messages.create({
    model: opts.model ?? CLAUDE_MAIN_MODEL,
    max_tokens: opts.maxTokens ?? 8000,
    ...(opts.system ? { system: opts.system } : {}),
    messages: opts.messages,
    output_config: {
      format: {
        type: "json_schema",
        schema: opts.schema as Anthropic.Messages.JSONOutputFormat["schema"],
      },
    },
  });
  const text = textFromResponse(response);
  if (!text) throw new Error("AI returned no structured content");
  return JSON.parse(text) as T;
}
