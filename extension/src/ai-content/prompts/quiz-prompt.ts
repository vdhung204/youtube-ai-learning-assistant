import type { SourceContext } from "../types.ts";
import { makePrompt } from "./common.ts";
export const buildQuizPrompt = (context: SourceContext, count = 5, language = "vi") =>
  makePrompt("questions", context, count, language);
