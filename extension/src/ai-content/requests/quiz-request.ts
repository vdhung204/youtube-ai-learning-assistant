import type { GenerationRequest, SourceContext } from "../types.ts";
import { assertRequestBase, assertRequestedCount, assertRequestSize } from "./common.ts";

export function buildQuizRequest(
  context: SourceContext,
  requestedCount = 5,
  language = "vi",
): GenerationRequest {
  assertRequestBase(context, language);
  assertRequestedCount(requestedCount);
  return assertRequestSize({ context, language, requestedCount, task: "questions" });
}
