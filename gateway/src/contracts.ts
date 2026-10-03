export type Task = "questions" | "flashcards" | "answers" | "feedback";

export interface RetrievedChunk {
  chunkId: string;
  videoId: string;
  text: string;
  startSec: number;
  endSec: number;
  position: number;
  score: number;
}

export interface SourceContext {
  videoId: string;
  durationSec: number;
  chunks: RetrievedChunk[];
}

export interface QuestionResult {
  questionId: string;
  correct: boolean;
  correctAnswer: number;
  selectedAnswer: number | null;
}

export interface ReviewTimestamp {
  chunkId: string;
  startSec: number;
  endSec: number;
  topic: string;
  reason: string;
}

export interface LearningAssessment {
  score: number;
  correctCount: number;
  totalCount: number;
  questionResults: QuestionResult[];
  strongTopics: string[];
  weakTopics: string[];
  reviewTimestamps: ReviewTimestamp[];
}

interface RequestBase {
  language: string;
  context: SourceContext;
}

export interface QuestionsRequest extends RequestBase {
  task: "questions";
  requestedCount: number;
}

export interface FlashcardsRequest extends RequestBase {
  task: "flashcards";
  requestedCount: number;
}

export interface AnswersRequest extends RequestBase {
  task: "answers";
  question: string;
}

export interface FeedbackRequest extends RequestBase {
  task: "feedback";
  assessment: LearningAssessment;
}

export type GenerateRequest =
  | QuestionsRequest
  | FlashcardsRequest
  | AnswersRequest
  | FeedbackRequest;

export interface GroundedItem {
  sourceChunkId: string;
  evidence: string;
  topic: string;
}

export interface QuestionItem extends GroundedItem {
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

export interface FlashcardItem extends GroundedItem {
  front: string;
  back: string;
}

export interface AnswerItem extends GroundedItem {
  answer: string;
}

export interface FeedbackItem extends GroundedItem {
  comment: string;
}

export type GeneratedItem = QuestionItem | FlashcardItem | AnswerItem | FeedbackItem;

export type GeneratedData =
  | { status: "ok"; items: GeneratedItem[] }
  | { status: "insufficient_context"; items: [] };

export interface SuccessEnvelope {
  data: GeneratedData;
  meta: {
    requestId: string;
  };
}

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    retryable: boolean;
    requestId: string;
  };
}
