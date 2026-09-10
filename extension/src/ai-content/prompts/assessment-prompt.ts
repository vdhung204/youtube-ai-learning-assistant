import type { LearningAssessment, SourceContext, Validated } from "../types.ts";
import { makePrompt } from "./common.ts";
export const buildAssessmentPrompt = (context: SourceContext, assessment: Validated<LearningAssessment>, language = "vi") =>
  makePrompt("feedback", context, 5, language, assessment);
