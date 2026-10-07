import type {
  AnswersRequest,
  FeedbackRequest,
  FlashcardsRequest,
  GenerateRequest,
  LearningAssessment,
  QuestionResult,
  QuestionsRequest,
  RetrievedChunk,
  ReviewTimestamp,
  SourceContext,
} from "./contracts.ts";
import { badRequest, GatewayError } from "./errors.ts";

export const MAX_REQUEST_BODY_BYTES = 64 * 1024;
export const MAX_TRANSCRIPT_BYTES = 20_000;
const MAX_CHUNKS = 12;
const MAX_ITEMS_PER_BATCH = 10;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/u;
const CHUNK_ID = /^[A-Za-z0-9._:-]{1,128}$/u;
const LANGUAGE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw badRequest();
  }
  return value;
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => !allowed.has(key))
  ) {
    throw badRequest();
  }
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") {
    throw badRequest();
  }
  const cleaned = value.normalize("NFC").replace(/\s+/gu, " ").trim();
  if (!cleaned || cleaned.length > maxLength) {
    throw badRequest();
  }
  return cleaned;
}

function finiteNumber(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw badRequest();
  }
  return value;
}

function integer(value: unknown, min: number, max: number): number {
  const parsed = finiteNumber(value, min, max);
  if (!Number.isInteger(parsed)) {
    throw badRequest();
  }
  return parsed;
}

function stringArray(value: unknown, maxItems = 100): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw badRequest();
  }
  const items = value.map((item) => cleanText(item, 200));
  if (new Set(items.map((item) => item.toLocaleLowerCase())).size !== items.length) {
    throw badRequest();
  }
  return items;
}

function parseQuestionResult(value: unknown): QuestionResult {
  const result = record(value);
  exactKeys(result, ["questionId", "correct", "correctAnswer", "selectedAnswer"]);
  const correctAnswer = integer(result.correctAnswer, 0, 9);
  const selectedAnswer = result.selectedAnswer === null
    ? null
    : integer(result.selectedAnswer, 0, 9);
  if (typeof result.correct !== "boolean" || result.correct !== (selectedAnswer === correctAnswer)) {
    throw badRequest();
  }
  return {
    questionId: cleanText(result.questionId, 128),
    correct: result.correct,
    correctAnswer,
    selectedAnswer,
  };
}

function parseReviewTimestamp(value: unknown, durationSec: number): ReviewTimestamp {
  const timestamp = record(value);
  exactKeys(timestamp, ["chunkId", "startSec", "endSec", "topic", "reason"]);
  const chunkId = cleanText(timestamp.chunkId, 128);
  const startSec = finiteNumber(timestamp.startSec, 0, durationSec);
  const endSec = finiteNumber(timestamp.endSec, startSec, durationSec);
  return {
    chunkId,
    startSec,
    endSec,
    topic: cleanText(timestamp.topic, 200),
    reason: cleanText(timestamp.reason, 1_000),
  };
}

function parseAssessment(value: unknown, durationSec: number): LearningAssessment {
  const assessment = record(value);
  exactKeys(assessment, [
    "score",
    "correctCount",
    "totalCount",
    "questionResults",
    "strongTopics",
    "weakTopics",
    "reviewTimestamps",
  ]);
  const totalCount = integer(assessment.totalCount, 1, 100);
  const correctCount = integer(assessment.correctCount, 0, totalCount);
  const score = finiteNumber(assessment.score, 0, 100);
  if (Math.abs(score - (correctCount / totalCount) * 100) > 0.011) {
    throw badRequest();
  }
  if (!Array.isArray(assessment.questionResults) || assessment.questionResults.length !== totalCount) {
    throw badRequest();
  }
  const questionResults = assessment.questionResults.map(parseQuestionResult);
  if (
    new Set(questionResults.map((result) => result.questionId)).size !== totalCount ||
    questionResults.filter((result) => result.correct).length !== correctCount
  ) {
    throw badRequest();
  }
  const strongTopics = stringArray(assessment.strongTopics);
  const weakTopics = stringArray(assessment.weakTopics);
  const strong = new Set(strongTopics.map((topic) => topic.toLocaleLowerCase()));
  if (weakTopics.some((topic) => strong.has(topic.toLocaleLowerCase()))) {
    throw badRequest();
  }
  const knownTopics = new Set(
    [...strongTopics, ...weakTopics].map((topic) => topic.toLocaleLowerCase()),
  );
  if (!Array.isArray(assessment.reviewTimestamps) || assessment.reviewTimestamps.length > 100) {
    throw badRequest();
  }
  const reviewTimestamps = assessment.reviewTimestamps.map((item) =>
    parseReviewTimestamp(item, durationSec));
  if (reviewTimestamps.some((item) => !knownTopics.has(item.topic.toLocaleLowerCase()))) {
    throw badRequest();
  }
  return {
    score,
    correctCount,
    totalCount,
    questionResults,
    strongTopics,
    weakTopics,
    reviewTimestamps,
  };
}

function parseChunk(value: unknown, videoId: string, durationSec: number): RetrievedChunk {
  const chunk = record(value);
  exactKeys(chunk, ["chunkId", "videoId", "text", "startSec", "endSec", "position", "score"]);
  if (chunk.videoId !== videoId || typeof chunk.chunkId !== "string" || !CHUNK_ID.test(chunk.chunkId)) {
    throw badRequest();
  }
  const startSec = finiteNumber(chunk.startSec, 0, durationSec);
  const endSec = finiteNumber(chunk.endSec, startSec, durationSec);
  return {
    chunkId: chunk.chunkId,
    videoId,
    text: cleanText(chunk.text, 5_000),
    startSec,
    endSec,
    position: integer(chunk.position, 0, 1_000_000),
    score: finiteNumber(chunk.score, -1, 1),
  };
}

function parseContext(value: unknown): SourceContext {
  const context = record(value);
  exactKeys(context, ["videoId", "durationSec", "chunks"]);
  if (typeof context.videoId !== "string" || !VIDEO_ID.test(context.videoId)) {
    throw badRequest();
  }
  const durationSec = finiteNumber(context.durationSec, 0.001, 172_800);
  if (!Array.isArray(context.chunks) || context.chunks.length < 1 || context.chunks.length > MAX_CHUNKS) {
    throw badRequest();
  }
  const chunks = context.chunks.map((chunk) => parseChunk(chunk, context.videoId as string, durationSec));
  if (new Set(chunks.map((chunk) => chunk.chunkId)).size !== chunks.length) {
    throw badRequest();
  }
  const transcriptBytes = new TextEncoder().encode(
    chunks.map((chunk) => chunk.text).join("\n"),
  ).byteLength;
  if (transcriptBytes > MAX_TRANSCRIPT_BYTES) {
    throw new GatewayError("PAYLOAD_TOO_LARGE", 413, false);
  }
  return { videoId: context.videoId, durationSec, chunks };
}

function parseLanguage(value: unknown): string {
  if (value === undefined) {
    return "en";
  }
  const language = cleanText(value, 35);
  if (!LANGUAGE.test(language)) {
    throw badRequest();
  }
  return language;
}

export function parseGenerateRequest(value: unknown): GenerateRequest {
  const input = record(value);
  const task = input.task;
  if (!(["questions", "flashcards", "answers", "feedback"] as const).includes(task as never)) {
    throw badRequest();
  }
  const language = parseLanguage(input.language);
  const context = parseContext(input.context);

  switch (task) {
    case "questions": {
      exactKeys(input, ["task", "requestedCount", "context"], ["language"]);
      const result: QuestionsRequest = {
        task,
        language,
        context,
        requestedCount: integer(input.requestedCount, 1, MAX_ITEMS_PER_BATCH),
      };
      return result;
    }
    case "flashcards": {
      exactKeys(input, ["task", "requestedCount", "context"], ["language"]);
      const result: FlashcardsRequest = {
        task,
        language,
        context,
        requestedCount: integer(input.requestedCount, 1, MAX_ITEMS_PER_BATCH),
      };
      return result;
    }
    case "answers": {
      exactKeys(input, ["task", "question", "context"], ["language"]);
      const result: AnswersRequest = {
        task,
        language,
        context,
        question: cleanText(input.question, 2_000),
      };
      return result;
    }
    case "feedback": {
      exactKeys(input, ["task", "assessment", "context"], ["language"]);
      const result: FeedbackRequest = {
        task,
        language,
        context,
        assessment: parseAssessment(input.assessment, context.durationSec),
      };
      return result;
    }
    default:
      throw badRequest();
  }
}

export function requestedItemCount(request: GenerateRequest): number {
  switch (request.task) {
    case "questions":
    case "flashcards":
      return request.requestedCount;
    case "answers":
      return 3;
    case "feedback":
      return 5;
  }
}
