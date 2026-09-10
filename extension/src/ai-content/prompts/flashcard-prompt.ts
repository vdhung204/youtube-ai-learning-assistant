import type { SourceContext } from "../types.ts";
import { makePrompt } from "./common.ts";
export const buildFlashcardPrompt = (context: SourceContext, count = 5, language = "vi") =>
  makePrompt("flashcards", context, count, language);
