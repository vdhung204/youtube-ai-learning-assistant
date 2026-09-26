import {
  buildChatPrompt,
  buildFlashcardPrompt,
  buildQuizPrompt,
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
import type { GenerateContent } from "./types";

export { FLASHCARD_GENERATION_COUNT, QUIZ_GENERATION_COUNT } from "./config";
export type { GenerateContent } from "./types";

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
  const result = await retrieve(
    video.videoId,
    { query, purpose, maxResults: RETRIEVAL_MAX_RESULTS },
    { signal },
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
): Promise<Question[]> {
  const context = await retrieveContext(
    video,
    `Các khái niệm, luận điểm và kiến thức quan trọng trong video ${video.title}`,
    "quiz",
    signal,
  );
  const prompt = buildQuizPrompt(context, QUIZ_GENERATION_COUNT, video.language || "vi");
  const raw = await generateContent(prompt, {
    ...LEARNING_GENERATION_OPTIONS.quiz,
    signal,
  });
  const questions = mapQuiz(validateQuiz(raw, context), context);
  if (questions.length !== QUIZ_GENERATION_COUNT) {
    throw new LearningPipelineError("INSUFFICIENT_CONTEXT");
  }
  return questions;
}

export async function generateFlashcards(
  video: CurrentVideo,
  generateContent: GenerateContent,
  signal?: AbortSignal,
): Promise<Flashcard[]> {
  const context = await retrieveContext(
    video,
    `Các thuật ngữ, định nghĩa và kiến thức cần ghi nhớ trong video ${video.title}`,
    "flashcard",
    signal,
  );
  const prompt = buildFlashcardPrompt(context, FLASHCARD_GENERATION_COUNT, video.language || "vi");
  const raw = await generateContent(prompt, {
    ...LEARNING_GENERATION_OPTIONS.flashcard,
    signal,
  });
  const cards = mapFlashcards(validateFlashcards(raw, context), context);
  if (cards.length === 0) {
    throw new LearningPipelineError("INSUFFICIENT_CONTEXT");
  }
  return cards.map(toLearningFlashcard);
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
  const context = await retrieveContext(video, question, "review", signal);
  const raw = await generateContent(buildChatPrompt(context, question, video.language || "vi"), {
    ...LEARNING_GENERATION_OPTIONS.review,
    signal,
  });
  const result = validateChat(raw, context);
  if (result.status === "insufficient_context" || result.items.length === 0) {
    throw new LearningPipelineError("INSUFFICIENT_CONTEXT");
  }

  return {
    paragraphs: result.items.map((item) => item.answer),
    sources: collectAnswerSources(result.items, context),
  };
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
