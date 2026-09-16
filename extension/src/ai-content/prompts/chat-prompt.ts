import type { SourceContext } from "../types.ts";
import { AIContentError } from "../validation/common.ts";
import { makePrompt } from "./common.ts";

export const buildChatPrompt = (
  context: SourceContext,
  question: string,
  language = "vi",
) => {
  const normalizedQuestion = question.normalize("NFC").replace(/\s+/gu, " ").trim();
  if (!normalizedQuestion || normalizedQuestion.length > 2_000) {
    throw new AIContentError("CHAT_QUESTION_INVALID", false);
  }
  const prompt = makePrompt("answers", context, 3, language);
  return {
    ...prompt,
    userContent: JSON.stringify({
      ...JSON.parse(prompt.userContent) as Record<string, unknown>,
      question: normalizedQuestion,
    }),
  };
};
