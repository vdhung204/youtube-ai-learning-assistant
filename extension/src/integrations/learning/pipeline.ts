import {
  buildChatPrompt,
  buildFlashcardPrompt,
  buildQuizPrompt,
  mapFlashcards,
  mapQuiz,
  validateChat,
  validateFlashcards,
  validateQuiz,
  type PromptRequest,
  type SourceContext,
} from "../../ai-content/index.ts";
import type { Question } from "../../types/api";
import type { CurrentVideo, Flashcard, VideoSource } from "../../types/learning";
import { GeminiAccessError, type GeminiGenerateOptions } from "../gemini/client";
import { retrieve } from "../local-service/client";

export type GenerateContent = <T = unknown>(
  prompt: PromptRequest,
  options?: Omit<GeminiGenerateOptions<T>, "model" | "projectId">,
) => Promise<T>;

const QUIZ_OUTPUT_TOKENS = 8_192;
const QUIZ_RETRY_OUTPUT_TOKENS = 16_384;

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
  purpose: "quiz" | "flashcard" | "review",
  signal?: AbortSignal,
): Promise<SourceContext> {
  const result = await retrieve(video.videoId, { query, purpose, maxResults: 12 }, { signal });
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
  const prompt = buildQuizPrompt(context, 10, video.language || "vi");
  let raw: unknown;
  try {
    raw = await generateContent(prompt, {
      maxOutputTokens: QUIZ_OUTPUT_TOKENS,
      signal,
      temperature: 0.1,
    });
  } catch (error) {
    if (
      !(error instanceof GeminiAccessError) ||
      !["INVALID_RESPONSE", "OUTPUT_TRUNCATED"].includes(error.code)
    ) {
      throw error;
    }
    raw = await generateContent(prompt, {
      maxOutputTokens: QUIZ_RETRY_OUTPUT_TOKENS,
      signal,
      temperature: 0,
    });
  }
  const questions = mapQuiz(validateQuiz(raw, context), context);
  if (questions.length === 0) {
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
  const raw = await generateContent(buildFlashcardPrompt(context, 8, video.language || "vi"), { signal });
  const cards = mapFlashcards(validateFlashcards(raw, context), context);
  if (cards.length === 0) {
    throw new LearningPipelineError("INSUFFICIENT_CONTEXT");
  }
  return cards.map((card) => ({
    flashcardId: card.cardId,
    front: card.front,
    back: card.back,
    hint: card.topic,
    topic: card.topic,
    sourceTimestamp: card.sourceTimestamp,
  }));
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
  const raw = await generateContent(buildChatPrompt(context, question, video.language || "vi"), { signal });
  const result = validateChat(raw, context);
  if (result.status === "insufficient_context" || result.items.length === 0) {
    throw new LearningPipelineError("INSUFFICIENT_CONTEXT");
  }

  const chunks = new Map(context.chunks.map((chunk) => [chunk.chunkId, chunk]));
  const sources = new Map<string, VideoSource>();
  for (const item of result.items) {
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
  return {
    paragraphs: result.items.map((item) => item.answer),
    sources: [...sources.values()],
  };
}
