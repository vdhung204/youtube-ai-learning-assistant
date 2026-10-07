import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  answerVideoQuestion,
  generateFlashcards,
  generateQuiz,
} from "../integrations/learning/pipeline";
import { AiGatewayError } from "../integrations/ai-gateway/client";
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
  it("reads every page in the selected chapter, skips empty introductions, and retains unique IDs", async () => {
    const section = {id: "20-150", title: "RAG", startSec: 20, endSec: 150, source: "youtube" as const};
    retrieveMock.mockResolvedValueOnce({videoId: video.videoId, purpose: "quiz", chunks: [chunk], nextPosition: 0})
      .mockResolvedValueOnce({videoId: video.videoId, purpose: "quiz", chunks: [{...chunk, chunkId: "chunk-2", position: 1}]});
    const generate = vi.fn().mockResolvedValueOnce({status: "insufficient_context", items: []})
      .mockResolvedValueOnce({status: "ok", items: [quizQuestion(0), quizQuestion(1)].map(q => ({...q, sourceChunkId: "chunk-2"}))});
    const questions = await generateQuiz({...video, learningSection: section}, generate);
    expect(questions).toHaveLength(2);
    expect(questions[0].questionId).toContain("20-150");
    expect(new Set(questions.map(q => q.questionId)).size).toBe(2);
    expect(retrieveMock.mock.calls[1][1]).toMatchObject({startSec: 20, endSec: 150, afterPosition: 0});
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("reuses completed pages after a later page fails and deduplicates results across pages", async () => {
    const page1 = {videoId: video.videoId, purpose: "quiz" as const, chunks: [chunk], nextPosition: 0};
    const page2 = {videoId: video.videoId, purpose: "quiz" as const, chunks: [{...chunk, chunkId: "chunk-2", position: 1}]};
    retrieveMock.mockResolvedValueOnce(page1).mockResolvedValueOnce(page2)
      .mockResolvedValueOnce(page1).mockResolvedValueOnce(page2);
    const generate = vi.fn().mockResolvedValueOnce({status: "ok", items: [quizQuestion(0)]})
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce({status: "ok", items: [{...quizQuestion(0), sourceChunkId: "chunk-2"}, {...quizQuestion(1), sourceChunkId: "chunk-2"}]});
    const pages = new Map();
    await expect(generateQuiz(video, generate, undefined, undefined, false, pages)).rejects.toThrow("temporary");
    const questions = await generateQuiz(video, generate, undefined, undefined, false, pages);
    expect(questions).toHaveLength(2);
    expect(generate).toHaveBeenCalledTimes(3);
  });

  it("rejects a non-advancing cursor instead of generating forever", async () => {
    retrieveMock.mockResolvedValue({videoId: video.videoId, purpose: "quiz", chunks: [chunk], nextPosition: 0});
    const generate = vi.fn().mockResolvedValue({status: "ok", items: [quizQuestion(0)]});
    await expect(generateQuiz(video, generate)).rejects.toThrow("Không thể đọc tiếp");
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("retrieves quiz context, sends a strict gateway request, and maps validated items", async () => {
    const generate = vi.fn().mockResolvedValue({
      items: Array.from({ length: 6 }, (_, index) => quizQuestion(index)),
      status: "ok",
    });

    const questions = await generateQuiz(video, generate);

    expect(retrieveMock).toHaveBeenCalledWith(
      video.videoId,
      expect.objectContaining({ maxResults: 12, purpose: "quiz", startSec: 0, endSec: 180 }),
      { signal: undefined },
    );
    expect(questions).toHaveLength(6);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        task: "questions",
        requestedCount: 10,
        language: "vi",
        context: expect.objectContaining({ videoId: video.videoId }),
      }),
      expect.objectContaining({
        maxRetries: 0,
        timeoutMs: 35_000,
        validate: expect.any(Function),
      }),
    );
    expect(questions[0]).toMatchObject({
      questionId: `${video.videoId}:whole:q:0`,
      sourceTimestamp: { chunkId: chunk.chunkId, startSec: 42, endSec: 55 },
    });
  });

  it("does not spend a second pipeline call after a retryable gateway failure", async () => {
    const error = new AiGatewayError("SERVER_ERROR", "gateway unavailable", {
      retryable: true,
      status: 503,
    });
    const generate = vi.fn().mockRejectedValue(error);

    await expect(generateQuiz(video, generate)).rejects.toBe(error);

    expect(generate).toHaveBeenCalledOnce();
  });

  it("retrieves flashcard context and maps validated cards", async () => {
    const generate = vi.fn().mockResolvedValue({
      items: Array.from({ length: 6 }, (_, index) => ({
        back: `Truy xuất trước, sinh câu trả lời sau (${index + 1}).`,
        evidence: "RAG kết hợp truy xuất với mô hình ngôn ngữ",
        front: `RAG hoạt động thế nào? ${index + 1}`,
        sourceChunkId: chunk.chunkId,
        topic: "RAG",
      })),
      status: "ok",
    });

    const cards = await generateFlashcards(video, generate);

    expect(retrieveMock.mock.calls[0]?.[1]).toMatchObject({ purpose: "flashcard" });
    expect(cards[0]).toMatchObject({
      flashcardId: `${video.videoId}:whole:f:0`,
      sourceTimestamp: { chunkId: chunk.chunkId, startSec: 42, endSec: 55 },
    });
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ task: "flashcards", requestedCount: 10 }),
      expect.objectContaining({
        maxRetries: 0,
        timeoutMs: 35_000,
        validate: expect.any(Function),
      }),
    );
  });

  it("does not spend a second pipeline call after a flashcard gateway failure", async () => {
    const error = new AiGatewayError("SERVER_ERROR", "gateway unavailable", {
      retryable: true,
      status: 503,
    });
    const generate = vi.fn().mockRejectedValue(error);

    await expect(generateFlashcards(video, generate)).rejects.toBe(error);

    expect(generate).toHaveBeenCalledOnce();
  });

  it("accepts fewer questions when the section has fewer teachable ideas", async () => {
    const generate = vi.fn().mockResolvedValue({
      items: Array.from({ length: 5 }, (_, index) => quizQuestion(index)),
      status: "ok",
    });

    await expect(generateQuiz(video, generate)).resolves.toHaveLength(5);
    expect(generate).toHaveBeenCalledOnce();
  });

  it("uses review retrieval for AskAI and returns only grounded sources", async () => {
    const generate = vi.fn().mockResolvedValue({
      items: [{
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
      maxRetries: 0,
      timeoutMs: 35_000,
      validate: expect.any(Function),
    });
    expect(answer.paragraphs).toEqual(["RAG giúp câu trả lời bám sát nguồn đã truy xuất."]);
    expect(answer.sources).toEqual([expect.objectContaining({ chunkId: "chunk-1", startSec: 42 })]);
  });

  it("returns an empty section without calling the gateway when no transcript overlaps it", async () => {
    retrieveMock.mockResolvedValueOnce({
      chunks: [],
      purpose: "quiz",
      reason: "NO_RELEVANT_CONTEXT",
      videoId: video.videoId,
    });
    const generate = vi.fn();

    await expect(generateQuiz(video, generate)).resolves.toEqual([]);
    expect(generate).not.toHaveBeenCalled();
  });
});
