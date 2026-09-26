import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateFlashcards,
  generateQuiz,
  type GenerateContent,
} from "../integrations/learning/pipeline";
import { useLearningContentCache } from "../sidebar/hooks/useLearningContentCache";
import type { Question } from "../types/api";
import type { CurrentVideo } from "../types/learning";

vi.mock("../integrations/learning/pipeline", async (importOriginal) => {
  const original = await importOriginal<typeof import("../integrations/learning/pipeline")>();
  return {
    ...original,
    generateFlashcards: vi.fn(),
    generateQuiz: vi.fn(),
  };
});

const video: CurrentVideo = {
  channel: "Test",
  currentTimeSec: 0,
  dataSource: "youtube",
  durationSec: 120,
  language: "vi",
  thumbnailLabel: "YOUTUBE",
  title: "Cached video",
  videoId: "dQw4w9WgXcQ",
};

const savedQuiz: Question[] = [{
  correctAnswer: 0,
  explanation: "Grounded explanation",
  options: ["A", "B", "C", "D"],
  question: "Saved question?",
  questionId: "saved-question",
  sourceTimestamp: { chunkId: "chunk-1", endSec: 20, startSec: 10 },
  topic: "Cache",
}];

const generateQuizMock = vi.mocked(generateQuiz);

beforeEach(() => {
  localStorage.clear();
  generateQuizMock.mockReset();
  vi.mocked(generateFlashcards).mockReset();
});

afterEach(() => {
  cleanup();
});

describe("useLearningContentCache", () => {
  it("restores the last good quiz after a failed regeneration", async () => {
    const failure = new Error("quota exhausted");
    generateQuizMock
      .mockResolvedValueOnce(savedQuiz)
      .mockRejectedValueOnce(failure);
    const generateContent = vi.fn() as GenerateContent;
    const { result } = renderHook(() => useLearningContentCache(generateContent));

    await expect(result.current.loadQuiz(video)).resolves.toEqual(savedQuiz);

    await act(async () => {
      await expect(
        result.current.loadQuiz(video, { regenerate: true }),
      ).rejects.toBe(failure);
    });

    await expect(result.current.loadQuiz(video)).resolves.toEqual(savedQuiz);
    expect(generateQuizMock).toHaveBeenCalledTimes(2);
  });
});
