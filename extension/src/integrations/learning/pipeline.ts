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

export { FLASHCARD_GENERATION_COUNT, QUIZ_GENERATION_COUNT } from "./config";
export type { GenerateContent } from "./types";

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
): Promise<Question[]> {
  return measureLearning("pipeline_total", "quiz", async () => {
    onStage?.("retrieving");
    const context = await retrieveContext(
      video,
      `Các khái niệm, luận điểm và kiến thức quan trọng trong video ${video.title}`,
      "quiz",
      signal,
    );
    onStage?.("generating");
    const request = buildQuizRequest(context, QUIZ_GENERATION_COUNT, video.language || "vi");
    const validated = await measureLearning("gateway_total", "quiz", () => generateContent(request, {
      ...LEARNING_GENERATION_OPTIONS.quiz,
      signal,
      validate: (raw) => measureValidation("quiz", () => {
        const result = validateQuiz(raw, context);
        if (result.status === "ok" && result.items.length !== QUIZ_GENERATION_COUNT) {
          throw new AIContentError("AI_ITEM_COUNT_INVALID");
        }
        return result;
      }),
    }));
    const questions = mapQuiz(validated, context);
    if (questions.length !== QUIZ_GENERATION_COUNT) {
      throw new LearningPipelineError("INSUFFICIENT_CONTEXT");
    }
    return questions;
  });
}

export async function generateFlashcards(
  video: CurrentVideo,
  generateContent: GenerateContent,
  signal?: AbortSignal,
  onStage?: (stage: LearningLoadStage) => void,
): Promise<Flashcard[]> {
  return measureLearning("pipeline_total", "flashcard", async () => {
    onStage?.("retrieving");
    const context = await retrieveContext(
      video,
      `Các thuật ngữ, định nghĩa và kiến thức cần ghi nhớ trong video ${video.title}`,
      "flashcard",
      signal,
    );
    onStage?.("generating");
    const request = buildFlashcardRequest(context, FLASHCARD_GENERATION_COUNT, video.language || "vi");
    const validated = await measureLearning("gateway_total", "flashcard", () => generateContent(request, {
      ...LEARNING_GENERATION_OPTIONS.flashcard,
      signal,
      validate: (raw) => measureValidation("flashcard", () => {
        const result = validateFlashcards(raw, context);
        if (result.status === "ok" && result.items.length !== FLASHCARD_GENERATION_COUNT) {
          throw new AIContentError("AI_ITEM_COUNT_INVALID");
        }
        return result;
      }),
    }));
    const cards = mapFlashcards(validated, context);
    if (cards.length !== FLASHCARD_GENERATION_COUNT) {
      throw new LearningPipelineError("INSUFFICIENT_CONTEXT");
    }
    return cards.map(toLearningFlashcard);
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
