import type {
  GenerationRequest,
  LearningAssessment,
  SourceContext,
  Validated,
} from "../types.ts";
import { assertRequestBase, assertRequestSize } from "./common.ts";

export function buildAssessmentRequest(
  context: SourceContext,
  assessment: Validated<LearningAssessment>,
  language = "vi",
): GenerationRequest {
  assertRequestBase(context, language);
  return assertRequestSize({ assessment, context, language, task: "feedback" });
}
