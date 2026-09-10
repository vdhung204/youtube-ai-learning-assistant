import type { AIResult, FlashcardItem, SourceContext, Validated } from "../types.ts";
import { exactKeys, grounding, text, validateItems } from "./common.ts";

export function validateFlashcards(raw: unknown, context: SourceContext): Validated<AIResult<FlashcardItem>> {
  return validateItems(raw, "flashcards", context, (item, sources) => {
    exactKeys(item, ["front", "back", "topic", "sourceChunkId", "evidence"]);
    return { ...grounding(item, sources), front: text(item.front), back: text(item.back) };
  }, item => item.front);
}
