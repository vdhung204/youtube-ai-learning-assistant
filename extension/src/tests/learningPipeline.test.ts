import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  answerVideoQuestion,
  generateFlashcards,
  generateQuiz,
  LearningPipelineError,
} from "../integrations/learning/pipeline";
import { GeminiAccessError } from "../integrations/gemini/client";
import { retrieve } from "../integrations/local-service/client";
import type { CurrentVideo } from "../types/learning";

vi.mock("../integrations/local-service/client", () => ({
  retrieve: vi.fn(),
}));

const video: CurrentVideo = {
  channel: "Kênh kiểm thử",
  currentTimeSec: 0,
  dataSource: "youtube",
  durationSec: 180,
  language: "vi",
  thumbnailLabel: "YOUTUBE",
  title: "RAG căn bản",
  videoId: "dQw4w9WgXcQ",
};

const chunk = {
  chunkId: "chunk-1",
  endSec: 55,
  position: 0,
  score: 0.94,
  startSec: 42,
  text: "RAG kết hợp truy xuất với mô hình ngôn ngữ để câu trả lời bám sát nguồn.",
  videoId: video.videoId,
};

const retrieveMock = vi.mocked(retrieve);

function quizQuestion(index: number) {
  return {
    correctAnswer: 0,
    evidence: "RAG kết hợp truy xuất với mô hình ngôn ngữ",
    explanation: `Transcript cho thấy RAG gồm bước truy xuất và mô hình ngôn ngữ. Vì vậy lựa chọn đầu tiên đúng, còn các lựa chọn khác đã bỏ sót hoặc thay sai một thành phần. Giải thích ${index + 1}.`,
    options: [
      "Truy xuất và mô hình ngôn ngữ",
      "Chỉ mô hình ngôn ngữ",
      "Chỉ cơ sở dữ liệu quan hệ",
      "Truy xuất và trình biên dịch",
    ],
    question: `Câu ${index + 1}: RAG kết hợp những thành phần nào?`,
    sourceChunkId: chunk.chunkId,
    topic: "RAG",
  };
}

beforeEach(() => {
  retrieveMock.mockReset();
  retrieveMock.mockImplementation(async (_videoId, request) => ({
    chunks: [chunk],
    purpose: request.purpose,
    videoId: video.videoId,
  }));
});

describe("learning generation pipeline", () => {
  it("retrieves quiz context, validates Gemini JSON, and maps the source timestamp", async () => {
    const generate = vi.fn().mockResolvedValue({
      questions: Array.from({ length: 6 }, (_, index) => quizQuestion(index)),
      status: "ok",
    });

    const questions = await generateQuiz(video, generate);

    expect(retrieveMock).toHaveBeenCalledWith(
      video.videoId,
      expect.objectContaining({ maxResults: 6, purpose: "quiz" }),
      { signal: undefined },
    );
    expect(questions).toHaveLength(6);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ responseSchema: expect.any(Object) }),
      expect.objectContaining({
        maxOutputTokens: 6_144,
        maxRetries: 1,
        temperature: 0.1,
        thinkingLevel: "LOW",
      }),
    );
    expect(questions[0]).toMatchObject({
      questionId: `${video.videoId}:q:0`,
      sourceTimestamp: { chunkId: chunk.chunkId, startSec: 42, endSec: 55 },
    });
  });

  it("does not spend a second generation call after a truncated quiz response", async () => {
    const error = new GeminiAccessError("OUTPUT_TRUNCATED", "truncated", 200, {
      retryable: true,
    });
    const generate = vi.fn().mockRejectedValue(error);

    await expect(generateQuiz(video, generate)).rejects.toBe(error);

    expect(generate).toHaveBeenCalledOnce();
  });

  it("retrieves flashcard context and maps validated cards", async () => {
    const generate = vi.fn().mockResolvedValue({
      flashcards: [{
        back: "Truy xuất trước, sinh câu trả lời sau.",
        evidence: "RAG kết hợp truy xuất với mô hình ngôn ngữ",
        front: "RAG hoạt động thế nào?",
        sourceChunkId: chunk.chunkId,
        topic: "RAG",
      }],
      status: "ok",
    });

    const cards = await generateFlashcards(video, generate);

    expect(retrieveMock.mock.calls[0]?.[1]).toMatchObject({ purpose: "flashcard" });
    expect(cards[0]).toMatchObject({
      flashcardId: `${video.videoId}:f:0`,
      sourceTimestamp: { chunkId: chunk.chunkId, startSec: 42, endSec: 55 },
    });
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ responseSchema: expect.any(Object) }),
      expect.objectContaining({
        maxOutputTokens: 2_048,
        maxRetries: 1,
        temperature: 0.1,
        thinkingLevel: "LOW",
      }),
    );
  });

  it("does not spend a second generation call after a truncated flashcard response", async () => {
    const error = new GeminiAccessError("OUTPUT_TRUNCATED", "truncated", 200, {
      retryable: true,
    });
    const generate = vi.fn().mockRejectedValue(error);

    await expect(generateFlashcards(video, generate)).rejects.toBe(error);

    expect(generate).toHaveBeenCalledOnce();
  });

  it("rejects a successful quiz payload that contains fewer than six questions", async () => {
    const generate = vi.fn().mockResolvedValue({
      questions: Array.from({ length: 5 }, (_, index) => quizQuestion(index)),
      status: "ok",
    });

    await expect(generateQuiz(video, generate)).rejects.toMatchObject({
      code: "INSUFFICIENT_CONTEXT",
    });
    expect(generate).toHaveBeenCalledOnce();
  });

  it("uses review retrieval for AskAI and returns only grounded sources", async () => {
    const generate = vi.fn().mockResolvedValue({
      answers: [{
        answer: "RAG giúp câu trả lời bám sát nguồn đã truy xuất.",
        evidence: "câu trả lời bám sát nguồn",
        sourceChunkId: chunk.chunkId,
        topic: "RAG",
      }],
      status: "ok",
    });

    const answer = await answerVideoQuestion(video, "RAG có ích gì?", generate);

    expect(retrieveMock.mock.calls[0]?.[1]).toMatchObject({
      purpose: "review",
      query: "RAG có ích gì?",
    });
    expect(generate.mock.calls[0]?.[1]).toMatchObject({
      maxOutputTokens: 3_072,
      maxRetries: 1,
      thinkingLevel: "LOW",
    });
    expect(answer.paragraphs).toEqual(["RAG giúp câu trả lời bám sát nguồn đã truy xuất."]);
    expect(answer.sources).toEqual([expect.objectContaining({ chunkId: "chunk-1", startSec: 42 })]);
  });

  it("reports no-context explicitly and never calls Gemini", async () => {
    retrieveMock.mockResolvedValueOnce({
      chunks: [],
      purpose: "quiz",
      reason: "NO_RELEVANT_CONTEXT",
      videoId: video.videoId,
    });
    const generate = vi.fn();

    await expect(generateQuiz(video, generate)).rejects.toMatchObject({
      code: "NO_CONTEXT",
    } satisfies Partial<LearningPipelineError>);
    expect(generate).not.toHaveBeenCalled();
  });
});
