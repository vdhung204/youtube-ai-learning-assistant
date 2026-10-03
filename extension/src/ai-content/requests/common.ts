import type { GenerationRequest, SourceContext } from "../types.ts";
import { AIContentError, sourceMap } from "../validation/common.ts";

const MAX_GENERATION_REQUEST_BYTES = 20_000;
const MAX_REQUESTED_ITEMS = 10;
const LANGUAGE_TAG_PATTERN = /^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/u;

export function assertRequestBase(context: SourceContext, language: string): void {
  sourceMap(context);
  if (!LANGUAGE_TAG_PATTERN.test(language)) {
    throw new AIContentError("GENERATION_OPTIONS_INVALID", false);
  }
}

export function assertRequestedCount(requestedCount: number): void {
  if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > MAX_REQUESTED_ITEMS) {
    throw new AIContentError("GENERATION_OPTIONS_INVALID", false);
  }
}

export function assertRequestSize(request: GenerationRequest): GenerationRequest {
  if (new TextEncoder().encode(JSON.stringify(request)).length > MAX_GENERATION_REQUEST_BYTES) {
    throw new AIContentError("GENERATION_REQUEST_TOO_LARGE", false);
  }
  return request;
}
