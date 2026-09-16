export interface SourceTimestamp { chunkId: string; startSec: number; endSec: number }
export interface RetrievedChunk extends SourceTimestamp {
  videoId: string; text: string; position: number; score: number;
}
export interface SourceContext { videoId: string; durationSec: number; chunks: readonly RetrievedChunk[] }
export interface Question {
  questionId: string; question: string; options: string[]; correctAnswer: number;
  explanation: string; topic: string; sourceTimestamp: SourceTimestamp;
}
export interface Flashcard {
  cardId: string; front: string; back: string; topic: string; sourceTimestamp: SourceTimestamp;
}
export interface QuestionResult {
  questionId: string; correct: boolean; correctAnswer: number; selectedAnswer: number | null;
}
export interface ReviewTimestamp extends SourceTimestamp { topic: string; reason: string }
export interface LearningAssessment {
  score: number; correctCount: number; totalCount: number; questionResults: QuestionResult[];
  strongTopics: string[]; weakTopics: string[]; reviewTimestamps: ReviewTimestamp[];
}
export interface GroundedItem { sourceChunkId: string; evidence: string; topic: string }
export interface QuizItem extends GroundedItem {
  question: string; options: string[]; correctAnswer: number; explanation: string;
}
export interface FlashcardItem extends GroundedItem { front: string; back: string }
export interface FeedbackItem extends GroundedItem { comment: string }
export interface ChatAnswerItem extends GroundedItem { answer: string }
export type AIResult<T> = { status: "ok"; items: T[] } | { status: "insufficient_context"; items: [] };

declare const validated: unique symbol;
export type Validated<T> = T & { readonly [validated]: true };
export interface PromptRequest {
  promptVersion: string; systemInstruction: string; userContent: string;
  responseSchema: Record<string, unknown>;
}
