import type { AIResult, Flashcard, FlashcardItem, LearningAssessment, Question, QuizItem, SourceContext, SourceTimestamp, Validated } from "../types.ts";
import { AIContentError, sourceMap } from "../validation/common.ts";

function timestamp(context: SourceContext, chunkId: string): SourceTimestamp {
  const chunk = sourceMap(context).get(chunkId);
  if (!chunk) throw new AIContentError("AI_SOURCE_INVALID");
  return { chunkId, startSec: chunk.startSec, endSec: chunk.endSec };
}
export function mapQuiz(result: Validated<AIResult<QuizItem>>, context: SourceContext): Question[] {
  return result.items.map((item, index) => ({ questionId: `${context.videoId}:q:${index}`,
    question: item.question, options: [...item.options], correctAnswer: item.correctAnswer,
    explanation: item.explanation, topic: item.topic, sourceTimestamp: timestamp(context, item.sourceChunkId) }));
}
export function mapFlashcards(result: Validated<AIResult<FlashcardItem>>, context: SourceContext): Flashcard[] {
  return result.items.map((item, index) => ({ cardId: `${context.videoId}:f:${index}`,
    front: item.front, back: item.back, topic: item.topic, sourceTimestamp: timestamp(context, item.sourceChunkId) }));
}
export function mapAssessment(result: Validated<LearningAssessment>): LearningAssessment {
  return { ...result, questionResults: result.questionResults.map(item => ({ ...item })),
    strongTopics: [...result.strongTopics], weakTopics: [...result.weakTopics],
    reviewTimestamps: result.reviewTimestamps.map(item => ({ ...item })) };
}
