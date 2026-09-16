import type { AIResult, ChatAnswerItem, SourceContext, Validated } from "../types.ts";
import { exactKeys, grounding, text, validateItems } from "./common.ts";

export function validateChat(
  raw: unknown,
  context: SourceContext,
): Validated<AIResult<ChatAnswerItem>> {
  return validateItems(raw, "answers", context, (item, sources) => {
    exactKeys(item, ["answer", "topic", "sourceChunkId", "evidence"]);
    return { ...grounding(item, sources), answer: text(item.answer, 8_000) };
  }, item => item.answer);
}
