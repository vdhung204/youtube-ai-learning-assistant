import type { AIResult, QuizItem, SourceContext, Validated } from "../types.ts";
import { exactKeys, fail, grounding, integer, text, validateItems } from "./common.ts";

export function validateQuiz(raw: unknown, context: SourceContext): Validated<AIResult<QuizItem>> {
  return validateItems(raw, "questions", context, (item, sources) => {
    exactKeys(item, ["question", "options", "correctAnswer", "explanation", "topic", "sourceChunkId", "evidence"]);
    if (!Array.isArray(item.options) || item.options.length < 2 || item.options.length > 10) fail();
    const options = item.options.map(o => text(o));
    if (new Set(options.map(o => o.toLocaleLowerCase())).size !== options.length) fail();
    return { ...grounding(item, sources), question: text(item.question), options,
      correctAnswer: integer(item.correctAnswer, 0, options.length - 1), explanation: text(item.explanation) };
  }, item => item.question);
}
