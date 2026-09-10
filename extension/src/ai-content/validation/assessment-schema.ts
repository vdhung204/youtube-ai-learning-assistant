import type { AIResult, FeedbackItem, LearningAssessment, SourceContext, Validated } from "../types.ts";
import { exactKeys, fail, grounding, integer, number, object, parseRaw, sourceMap, text, validateItems } from "./common.ts";

/** Validate the local service response. The service verifies source IDs against its active index.
 * Additional review chunks need not belong to the original quiz's retrieval context.
 * Generated AI feedback is separately subject to strict source membership below. */
export function validateLearningAssessment(raw: unknown, context: SourceContext): Validated<LearningAssessment> {
  const data = parseRaw(raw), sources = sourceMap(context);
  exactKeys(data, ["score", "correctCount", "totalCount", "questionResults", "strongTopics", "weakTopics", "reviewTimestamps"]);
  const totalCount = integer(data.totalCount, 1, 100), correctCount = integer(data.correctCount, 0, totalCount);
  const score = number(data.score);
  if (Math.abs(score - correctCount / totalCount * 100) > 0.011) fail();
  if (!Array.isArray(data.questionResults) || data.questionResults.length !== totalCount) fail();
  const questionResults = data.questionResults.map(rawResult => {
    const r = object(rawResult);
    exactKeys(r, ["questionId", "correct", "correctAnswer", "selectedAnswer"]);
    const correctAnswer = integer(r.correctAnswer, 0, 9);
    const selectedAnswer = r.selectedAnswer === null ? null : integer(r.selectedAnswer, 0, 9);
    if (typeof r.correct !== "boolean" || r.correct !== (selectedAnswer === correctAnswer)) fail();
    return { questionId: text(r.questionId), correct: r.correct, correctAnswer, selectedAnswer };
  });
  if (new Set(questionResults.map(r => r.questionId)).size !== totalCount
    || questionResults.filter(r => r.correct).length !== correctCount) fail();
  const topics = (value: unknown): string[] => {
    if (!Array.isArray(value)) fail();
    const labels = value.map(t => text(t, 200));
    if (new Set(labels.map(t => t.toLocaleLowerCase())).size !== labels.length) fail();
    return labels;
  };
  const strongTopics = topics(data.strongTopics), weakTopics = topics(data.weakTopics);
  const strong = new Set(strongTopics.map(t => t.toLocaleLowerCase()));
  if (weakTopics.some(t => strong.has(t.toLocaleLowerCase()))) fail();
  const knownTopics = new Set([...strongTopics, ...weakTopics].map(t => t.toLocaleLowerCase()));
  if (!Array.isArray(data.reviewTimestamps)) fail();
  const reviewTimestamps = data.reviewTimestamps.map(rawReview => {
    const r = object(rawReview);
    exactKeys(r, ["topic", "reason", "chunkId", "startSec", "endSec"]);
    const chunkId = text(r.chunkId), chunk = sources.get(chunkId);
    const startSec = number(r.startSec), endSec = number(r.endSec), topic = text(r.topic);
    if (startSec < 0 || endSec > context.durationSec || startSec > endSec
      || (chunk && (startSec < chunk.startSec || endSec > chunk.endSec))
      || !knownTopics.has(topic.toLocaleLowerCase())) fail("AI_SOURCE_INVALID");
    return { chunkId, startSec, endSec, topic, reason: text(r.reason) };
  });
  return { score, totalCount, correctCount, questionResults, strongTopics, weakTopics, reviewTimestamps } as Validated<LearningAssessment>;
}

export function validateAssessmentFeedback(raw: unknown, context: SourceContext,
  assessment: Validated<LearningAssessment>): Validated<AIResult<FeedbackItem>> {
  const topics = new Set([...assessment.strongTopics, ...assessment.weakTopics].map(t => t.toLocaleLowerCase()));
  return validateItems(raw, "feedback", context, (item, sources) => {
    exactKeys(item, ["topic", "comment", "sourceChunkId", "evidence"]);
    const grounded = grounding(item, sources);
    if (!topics.has(grounded.topic.toLocaleLowerCase())) fail("AI_TOPIC_INVALID");
    return { ...grounded, comment: text(item.comment) };
  }, item => item.topic);
}
