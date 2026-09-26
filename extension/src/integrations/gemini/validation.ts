import { GeminiAccessError } from "./errors";
import type { GeminiPromptInput } from "./types";

const MAX_PROMPT_BYTES = 100_000;
const SUPPORTED_SCHEMA_KEYS = new Set([
  "type",
  "format",
  "nullable",
  "enum",
  "items",
  "properties",
  "required",
  "anyOf",
  "propertyOrdering",
  "minimum",
  "maximum",
  "minItems",
  "maxItems",
  "prefixItems",
  "title",
  "description",
]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Keep provider-only schema fields limited to Gemini's supported subset. */
export function toGeminiResponseSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(toGeminiResponseSchema);
  }
  if (!isRecord(value)) {
    return value;
  }
  const properties = isRecord(value.properties)
    ? Object.fromEntries(
        Object.entries(value.properties).map(([key, child]) => [key, toGeminiResponseSchema(child)]),
      )
    : undefined;
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) =>
      key === "properties"
        ? properties === undefined ? [] : [[key, properties]]
        : SUPPORTED_SCHEMA_KEYS.has(key) ? [[key, toGeminiResponseSchema(child)]] : [],
    ),
  );
}

function promptByteLength(prompt: GeminiPromptInput): number {
  return new TextEncoder().encode(
    `${prompt.systemInstruction}\n${prompt.userContent}\n${JSON.stringify(prompt.responseSchema)}`,
  ).length;
}

export function assertPrompt(prompt: GeminiPromptInput): void {
  if (
    !isRecord(prompt) ||
    typeof prompt.systemInstruction !== "string" ||
    !prompt.systemInstruction.trim() ||
    typeof prompt.userContent !== "string" ||
    !prompt.userContent.trim() ||
    !isRecord(prompt.responseSchema) ||
    promptByteLength(prompt) > MAX_PROMPT_BYTES
  ) {
    throw new GeminiAccessError(
      "BAD_REQUEST",
      "Prompt Gemini hoặc response schema không hợp lệ.",
      undefined,
      { retryable: false },
    );
  }
}
