import type {
  AnswerItem,
  FeedbackItem,
  FlashcardItem,
  GenerateRequest,
  GeneratedData,
  GroundedItem,
  QuestionItem,
  RetrievedChunk,
} from "./contracts.ts";
import { GatewayError } from "./errors.ts";
import { isRecord, requestedItemCount } from "./input-validation.ts";
import { outputKey } from "./prompts.ts";

function invalid(cause?: unknown): never {
  throw new GatewayError("UPSTREAM_INVALID_RESPONSE", 502, true, { cause });
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
  if (
    Object.keys(value).length !== expected.length ||
    expected.some((key) => !Object.hasOwn(value, key))
  ) {
    invalid();
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    invalid();
  }
  return value;
}

function text(value: unknown, maxLength: number): string {
  if (typeof value !== "string") {
    invalid();
  }
  const cleaned = value.normalize("NFC").replace(/\s+/gu, " ").trim();
  if (!cleaned || cleaned.length > maxLength) {
    invalid();
  }
  return cleaned;
}

function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    invalid();
  }
  return value;
}

function parseGrounding(
  item: Record<string, unknown>,
  sources: ReadonlyMap<string, RetrievedChunk>,
): GroundedItem {
  const sourceChunkId = text(item.sourceChunkId, 128);
  const evidence = text(item.evidence, 240);
  const source = sources.get(sourceChunkId);
  const normalizedSource = source?.text.normalize("NFC").replace(/\s+/gu, " ").trim();
  if (!source || !normalizedSource?.includes(evidence)) {
    invalid();
  }
  return {
    sourceChunkId,
    evidence,
    topic: text(item.topic, 80),
  };
}

function parseQuestion(
  value: unknown,
  sources: ReadonlyMap<string, RetrievedChunk>,
): QuestionItem {
  const item = record(value);
  exactKeys(item, [
    "question",
    "options",
    "correctAnswer",
    "explanation",
    "topic",
    "sourceChunkId",
    "evidence",
  ]);
  if (!Array.isArray(item.options) || item.options.length !== 4) {
    invalid();
  }
  const options = item.options.map((option) => text(option, 120));
  if (new Set(options.map((option) => option.toLocaleLowerCase())).size !== options.length) {
    invalid();
  }
  return {
    ...parseGrounding(item, sources),
    question: text(item.question, 200),
    options,
    correctAnswer: integer(item.correctAnswer, 0, 3),
    explanation: text(item.explanation, 700),
  };
}

function parseFlashcard(
  value: unknown,
  sources: ReadonlyMap<string, RetrievedChunk>,
): FlashcardItem {
  const item = record(value);
  exactKeys(item, ["front", "back", "topic", "sourceChunkId", "evidence"]);
  return {
    ...parseGrounding(item, sources),
    front: text(item.front, 160),
    back: text(item.back, 320),
  };
}

function parseAnswer(
  value: unknown,
  sources: ReadonlyMap<string, RetrievedChunk>,
): AnswerItem {
  const item = record(value);
  exactKeys(item, ["answer", "topic", "sourceChunkId", "evidence"]);
  return {
    ...parseGrounding(item, sources),
    answer: text(item.answer, 4_000),
  };
}

function parseFeedback(
  value: unknown,
  sources: ReadonlyMap<string, RetrievedChunk>,
  allowedTopics: ReadonlySet<string>,
): FeedbackItem {
  const item = record(value);
  exactKeys(item, ["comment", "topic", "sourceChunkId", "evidence"]);
  const grounded = parseGrounding(item, sources);
  if (!allowedTopics.has(grounded.topic.toLocaleLowerCase())) {
    invalid();
  }
  return {
    ...grounded,
    comment: text(item.comment, 1_000),
  };
}

export function validateGeneratedOutput(raw: unknown, request: GenerateRequest): GeneratedData {
  const result = record(raw);
  const key = outputKey(request.task);
  exactKeys(result, ["status", key]);
  const rawItems = result[key];
  if (!Array.isArray(rawItems)) {
    invalid();
  }
  if (result.status === "insufficient_context") {
    if (rawItems.length !== 0) {
      invalid();
    }
    return { status: "insufficient_context", items: [] };
  }
  if (result.status !== "ok") {
    invalid();
  }
  const count = requestedItemCount(request);
  if (
    rawItems.length < 1 ||
    rawItems.length > count ||
    ((request.task === "questions" || request.task === "flashcards") && rawItems.length !== count)
  ) {
    invalid();
  }

  const sources = new Map(request.context.chunks.map((chunk) => [chunk.chunkId, chunk]));
  const allowedTopics = request.task === "feedback"
    ? new Set(
      [...request.assessment.strongTopics, ...request.assessment.weakTopics]
        .map((topic) => topic.toLocaleLowerCase()),
    )
    : new Set<string>();
  const items = rawItems.map((item) => {
    switch (request.task) {
      case "questions":
        return parseQuestion(item, sources);
      case "flashcards":
        return parseFlashcard(item, sources);
      case "answers":
        return parseAnswer(item, sources);
      case "feedback":
        return parseFeedback(item, sources, allowedTopics);
    }
  });
  const identities = items.map((item) => {
    if ("question" in item) return item.question;
    if ("front" in item) return item.front;
    if ("answer" in item) return item.answer;
    return item.topic;
  }).map((identity) => identity.toLocaleLowerCase());
  if (new Set(identities).size !== identities.length) {
    invalid();
  }
  return { status: "ok", items };
}
