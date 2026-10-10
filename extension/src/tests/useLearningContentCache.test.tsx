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
  it("replays partial flashcards to a returning view without duplicating generation", async () => {
    let finish!: (items: import("../types/learning").Flashcard[]) => void;
    const cards = [{ flashcardId: "one", front: "Front", back: "Back", hint: "Hint", topic: "Topic",
      sourceTimestamp: { chunkId: "chunk-1", startSec: 0, endSec: 1 } }];
    vi.mocked(generateFlashcards).mockImplementation((_video, _generate, _signal, _stage, _regenerate, _pages, onItems) => {
      onItems?.(cards);
      return new Promise(resolve => { finish = resolve; });
    });
    const { result } = renderHook(() => useLearningContentCache(vi.fn() as GenerateContent));
    const first = vi.fn();
    const request = result.current.loadFlashcards(video, { onItems: first });
    expect(first).toHaveBeenCalledWith(cards);
    const returning = vi.fn();
    const joined = result.current.loadFlashcards(video, { onItems: returning });
    expect(returning).toHaveBeenCalledWith(cards);
    expect(generateFlashcards).toHaveBeenCalledOnce();
    finish(cards);
    await Promise.all([request, joined]);
  });

  it("keeps chapter decks separate and only generates a chapter when selected", async () => {
    generateQuizMock.mockResolvedValueOnce(savedQuiz).mockResolvedValueOnce([{...savedQuiz[0], questionId: "chapter2"}]);
    const {result} = renderHook(() => useLearningContentCache(vi.fn() as GenerateContent));
    const first = {...video, learningSection: {id: "0-60", title: "One", startSec: 0, endSec: 60, source: "youtube" as const}};
    const second = {...video, learningSection: {id: "60-120", title: "Two", startSec: 60, endSec: 120, source: "youtube" as const}};
    await expect(result.current.loadQuiz(first)).resolves.toEqual(savedQuiz);
    expect(generateQuizMock).toHaveBeenCalledTimes(1);
    await expect(result.current.loadQuiz(second)).resolves.toMatchObject([{questionId: "chapter2"}]);
    await expect(result.current.loadQuiz(first)).resolves.toEqual(savedQuiz);
    expect(generateQuizMock).toHaveBeenCalledTimes(2);
  });
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
