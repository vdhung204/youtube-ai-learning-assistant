import {
  AIContentError,
  buildChatRequest,
  buildFlashcardRequest,
  buildQuizRequest,
  mapFlashcards,
  mapQuiz,
  validateChat,
  validateFlashcards,
  validateQuiz,
  type ChatAnswerItem,
  type Flashcard as MappedFlashcard,
  type SourceContext,
} from "../../ai-content/index.ts";
import type { Question, RetrievalPurpose } from "../../types/api";
import type { CurrentVideo, Flashcard, VideoSource } from "../../types/learning";
import { retrieve } from "../local-service/client";
import {
  FLASHCARD_GENERATION_COUNT,
  LEARNING_GENERATION_OPTIONS,
  QUIZ_GENERATION_COUNT,
  RETRIEVAL_MAX_RESULTS,
} from "./config";
import type { GenerateContent, LearningLoadStage } from "./types";
import { learningScopeKey } from "./sections";

export { FLASHCARD_GENERATION_COUNT, QUIZ_GENERATION_COUNT } from "./config";
export type { GenerateContent } from "./types";

// Keep completed pages during this extension session so a retry after a later
// page fails does not pay to regenerate the successful pages.

async function cachedPage<T>(cache: Map<string, Promise<T[]>>, key: string,
  regenerate: boolean, generate: () => Promise<T[]>): Promise<T[]> {
  if (!regenerate && cache.has(key)) return cache.get(key)!;
  const request = generate();
  cache.set(key, request);
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  try { return await request; } catch (error) {
    if (cache.get(key) === request) cache.delete(key);
    throw error;
  }
}

async function* chapterContexts(video: CurrentVideo, purpose: "quiz" | "flashcard",
  signal?: AbortSignal, onStage?: (stage: LearningLoadStage) => void): AsyncGenerator<SourceContext> {
  let afterPosition: number | undefined;
  do {
    signal?.throwIfAborted();
    onStage?.("retrieving");
    const result = await retrieve(video.videoId, {
      query: video.learningSection?.title.slice(0, 150) || "Nội dung phần học",
      purpose, maxResults: 12,
      startSec: video.learningSection?.startSec ?? 0,
      endSec: video.learningSection?.endSec ?? video.durationSec,
      ...(afterPosition === undefined ? {} : {afterPosition}),
    }, {signal});
    if (result.videoId !== video.videoId || result.chunks.some(c => c.videoId !== video.videoId)) {
      throw new LearningPipelineError("NO_CONTEXT");
    }
    if (result.nextPosition !== undefined && (!result.chunks.length || result.nextPosition <= (afterPosition ?? -1)
      || result.nextPosition !== result.chunks[result.chunks.length - 1].position)) {
      throw new Error("Không thể đọc tiếp nội dung phần học. Hãy thử lại.");
    }
    if (result.chunks.length) yield {videoId: video.videoId, durationSec: video.durationSec, chunks: result.chunks};
    afterPosition = result.nextPosition;
  } while (afterPosition !== undefined);
}

function pageKey(video: CurrentVideo, context: SourceContext): string {
  return `${learningScopeKey(video)}:${video.language}:${context.chunks.map(c => c.chunkId).join(",")}`;
}

function distinctItems<T>(items: T[], text: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = text(item).normalize("NFC").toLocaleLowerCase().replace(/[\p{P}\p{Z}\s]+/gu, " ").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

type LearningLatencyStage =
  | "gateway_total"
  | "parse_validate"
  | "pipeline_total"
  | "retrieval_context";

function logLearningLatency(
  stage: LearningLatencyStage,
  purpose: RetrievalPurpose,
  startedAt: number,
  outcome: "error" | "ok",
  details: Record<string, number> = {},
): void {
  // Do not add transcript text, prompts, questions, or credentials here.
  console.info("yala_learning_latency", {
    ...details,
    durationMs: Date.now() - startedAt,
    outcome,
    purpose,
    stage,
  });
}

async function measureLearning<T>(
  stage: LearningLatencyStage,
  purpose: RetrievalPurpose,
  operation: () => Promise<T>,
  details?: (result: T) => Record<string, number>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await operation();
    logLearningLatency(stage, purpose, startedAt, "ok", details?.(result));
    return result;
  } catch (error) {
    logLearningLatency(stage, purpose, startedAt, "error");
    throw error;
  }
}

function measureValidation<T>(purpose: RetrievalPurpose, operation: () => T): T {
  const startedAt = Date.now();
  try {
    const result = operation();
    logLearningLatency("parse_validate", purpose, startedAt, "ok");
    return result;
  } catch (error) {
    logLearningLatency("parse_validate", purpose, startedAt, "error");
    throw error;
  }
}

export class LearningPipelineError extends Error {
  readonly code: "NO_CONTEXT" | "INSUFFICIENT_CONTEXT";

  constructor(code: "NO_CONTEXT" | "INSUFFICIENT_CONTEXT") {
    super(code === "NO_CONTEXT" ? "Không tìm thấy đoạn transcript liên quan." : "Ngữ cảnh chưa đủ để tạo nội dung.");
    this.name = "LearningPipelineError";
    this.code = code;
  }
}

async function retrieveContext(
  video: CurrentVideo,
  query: string,
  purpose: RetrievalPurpose,
  signal?: AbortSignal,
): Promise<SourceContext> {
  const result = await measureLearning(
    "retrieval_context",
    purpose,
    () => retrieve(
      video.videoId,
      { query, purpose, maxResults: RETRIEVAL_MAX_RESULTS },
      { signal },
    ),
    (retrieved) => ({ chunkCount: retrieved.chunks.length }),
  );
  if (result.videoId !== video.videoId || result.chunks.length === 0) {
    throw new LearningPipelineError("NO_CONTEXT");
  }
  return {
    videoId: video.videoId,
    durationSec: video.durationSec,
    chunks: result.chunks,
  };
}

export async function generateQuiz(
  video: CurrentVideo,
  generateContent: GenerateContent,
  signal?: AbortSignal,
  onStage?: (stage: LearningLoadStage) => void,
  regenerate = false,
  quizPages = new Map<string, Promise<Question[]>>(),
): Promise<Question[]> {
  return measureLearning("pipeline_total", "quiz", async () => {
    const questions: Question[] = [];
    for await (const context of chapterContexts(video, "quiz", signal, onStage)) {
      onStage?.("generating");
      questions.push(...await cachedPage(quizPages, pageKey(video, context), regenerate, async () => {
        const request = buildQuizRequest(context, QUIZ_GENERATION_COUNT, video.language || "vi");
        const validated = await measureLearning("gateway_total", "quiz", () => generateContent(request, {
          ...LEARNING_GENERATION_OPTIONS.quiz,
          signal,
          validate: (raw) => measureValidation("quiz", () => {
            const result = validateQuiz(raw, context);
            if (result.items.length > QUIZ_GENERATION_COUNT) {
              throw new AIContentError("AI_ITEM_COUNT_INVALID");
            }
            return result;
          }),
        }));
        return mapQuiz(validated, context);
      }));
    }
    return distinctItems(questions, q => q.question).map((q, index) => ({...q,
      questionId: `${learningScopeKey(video)}:q:${index}`}));
  });
}

export async function generateFlashcards(
  video: CurrentVideo,
  generateContent: GenerateContent,
  signal?: AbortSignal,
  onStage?: (stage: LearningLoadStage) => void,
  regenerate = false,
  flashcardPages = new Map<string, Promise<Flashcard[]>>(),
): Promise<Flashcard[]> {
  return measureLearning("pipeline_total", "flashcard", async () => {
    const cards: Flashcard[] = [];
    for await (const context of chapterContexts(video, "flashcard", signal, onStage)) {
      onStage?.("generating");
      cards.push(...await cachedPage(flashcardPages, pageKey(video, context), regenerate, async () => {
        const request = buildFlashcardRequest(context, FLASHCARD_GENERATION_COUNT, video.language || "vi");
        const validated = await measureLearning("gateway_total", "flashcard", () => generateContent(request, {
          ...LEARNING_GENERATION_OPTIONS.flashcard,
          signal,
          validate: (raw) => measureValidation("flashcard", () => {
            const result = validateFlashcards(raw, context);
            if (result.items.length > FLASHCARD_GENERATION_COUNT) {
              throw new AIContentError("AI_ITEM_COUNT_INVALID");
            }
            return result;
          }),
        }));
        return mapFlashcards(validated, context).map(toLearningFlashcard);
      }));
    }
    return distinctItems(cards, c => c.front).map((c, index) => ({...c,
      flashcardId: `${learningScopeKey(video)}:f:${index}`}));
  });
}

function toLearningFlashcard(card: MappedFlashcard): Flashcard {
  return {
    flashcardId: card.cardId,
    front: card.front,
    back: card.back,
    hint: card.topic,
    topic: card.topic,
    sourceTimestamp: card.sourceTimestamp,
  };
}

export interface AssistantAnswer {
  paragraphs: string[];
  sources: VideoSource[];
}

export async function answerVideoQuestion(
  video: CurrentVideo,
  question: string,
  generateContent: GenerateContent,
  signal?: AbortSignal,
): Promise<AssistantAnswer> {
  return measureLearning("pipeline_total", "review", async () => {
    const context = await retrieveContext(video, question, "review", signal);
    const result = await measureLearning("gateway_total", "review", () => generateContent(
      buildChatRequest(context, question, video.language || "vi"),
      {
        ...LEARNING_GENERATION_OPTIONS.review,
        signal,
        validate: (raw) => measureValidation("review", () => validateChat(raw, context)),
      },
    ));
    if (result.status === "insufficient_context" || result.items.length === 0) {
      throw new LearningPipelineError("INSUFFICIENT_CONTEXT");
    }

    return {
      paragraphs: result.items.map((item) => item.answer),
      sources: collectAnswerSources(result.items, context),
    };
  });
}

function collectAnswerSources(items: ChatAnswerItem[], context: SourceContext): VideoSource[] {
  const chunks = new Map(context.chunks.map((chunk) => [chunk.chunkId, chunk]));
  const sources = new Map<string, VideoSource>();
  for (const item of items) {
    const chunk = chunks.get(item.sourceChunkId);
    if (chunk && !sources.has(chunk.chunkId)) {
      sources.set(chunk.chunkId, {
        chunkId: chunk.chunkId,
        startSec: chunk.startSec,
        endSec: chunk.endSec,
        label: `${item.topic}: ${item.evidence}`,
      });
    }
  }
  return [...sources.values()];
}
