import type { AIResult, GroundedItem, RetrievedChunk, SourceContext, Validated } from "../types.ts";

export class AIContentError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  constructor(code: string, retryable = true) {
    super(code); this.name = "AIContentError"; this.code = code; this.retryable = retryable;
  }
}
export const cleanText = (value: string): string => value.normalize("NFC").replace(/\s+/gu, " ").trim();
export function fail(code = "AI_SCHEMA_INVALID"): never { throw new AIContentError(code); }
export function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail();
  return value as Record<string, unknown>;
}
export function exactKeys(value: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) fail();
}
export function text(value: unknown, max = 10000): string {
  if (typeof value !== "string") fail();
  const normalized = cleanText(value);
  if (!normalized || normalized.length > max) fail();
  return normalized;
}
export function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail();
  return value;
}
export function integer(value: unknown, min: number, max: number): number {
  const n = number(value);
  if (!Number.isInteger(n) || n < min || n > max) fail();
  return n;
}
export function parseRaw(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    if (raw.length > 500000) fail("AI_RESPONSE_TOO_LARGE");
    try { return object(JSON.parse(raw)); } catch (error) {
      if (error instanceof AIContentError) throw error;
      fail("AI_JSON_INVALID");
    }
  }
  return object(raw);
}
export function sourceMap(context: SourceContext): Map<string, RetrievedChunk> {
  if (!/^[A-Za-z0-9_-]{11}$/u.test(context.videoId) || !Number.isFinite(context.durationSec) || context.durationSec <= 0) {
    throw new AIContentError("SOURCE_CONTEXT_INVALID", false);
  }
  const sources = new Map<string, RetrievedChunk>();
  for (const chunk of context.chunks) {
    if (chunk.videoId !== context.videoId || !chunk.chunkId || sources.has(chunk.chunkId)
      || typeof chunk.text !== "string" || !cleanText(chunk.text)
      || !Number.isFinite(chunk.startSec) || !Number.isFinite(chunk.endSec)
      || chunk.startSec < 0 || chunk.startSec > chunk.endSec || chunk.endSec > context.durationSec
      || !Number.isInteger(chunk.position) || chunk.position < 0 || !Number.isFinite(chunk.score)) {
      throw new AIContentError("SOURCE_CONTEXT_INVALID", false);
    }
    sources.set(chunk.chunkId, chunk);
  }
  return sources;
}
export function grounding(item: Record<string, unknown>, sources: Map<string, RetrievedChunk>): GroundedItem {
  const sourceChunkId = text(item.sourceChunkId);
  const evidence = text(item.evidence);
  const source = sources.get(sourceChunkId);
  if (!source || !cleanText(source.text).includes(evidence)) fail("AI_SOURCE_INVALID");
  return { sourceChunkId, evidence, topic: text(item.topic, 200) };
}
export function validateItems<T>(raw: unknown, key: string, context: SourceContext,
  parse: (item: Record<string, unknown>, sources: Map<string, RetrievedChunk>) => T,
  unique: (item: T) => string): Validated<AIResult<T>> {
  const sources = sourceMap(context);
  const data = parseRaw(raw);
  exactKeys(data, ["status", key]);
  if (!Array.isArray(data[key])) fail();
  const list = data[key] as unknown[];
  if (data.status === "insufficient_context") {
    if (list.length) fail();
    return { status: "insufficient_context", items: [] } as Validated<AIResult<T>>;
  }
  if (data.status !== "ok" || !list.length || list.length > 100 || !sources.size) fail();
  const seen = new Set<string>();
  const items = list.map(item => {
    const parsed = parse(object(item), sources);
    const identity = cleanText(unique(parsed)).toLocaleLowerCase();
    if (seen.has(identity)) fail("AI_DUPLICATE_CONTENT");
    seen.add(identity);
    return parsed;
  });
  return { status: "ok", items } as Validated<AIResult<T>>;
}
