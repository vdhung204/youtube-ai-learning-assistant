import type { GenerationRequest, SourceContext } from "../types.ts";
import { AIContentError } from "../validation/common.ts";
import { assertRequestBase, assertRequestSize } from "./common.ts";

export function buildChatRequest(
  context: SourceContext,
  question: string,
  language = "vi",
): GenerationRequest {
  assertRequestBase(context, language);
  const normalizedQuestion = question.normalize("NFC").replace(/\s+/gu, " ").trim();
  if (!normalizedQuestion || normalizedQuestion.length > 2_000) {
    throw new AIContentError("CHAT_QUESTION_INVALID", false);
  }
  return assertRequestSize({
    context,
    language,
    question: normalizedQuestion,
    task: "answers",
  });
}
