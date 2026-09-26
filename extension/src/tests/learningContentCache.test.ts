import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadCachedContent, type LearningContentCache } from "../integrations/learning/cache";

const storagePrefix = "test:learning-cache:";
const videoId = "video-1";
const storageKey = `${storagePrefix}${videoId}`;

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("learning content cache", () => {
  it("shares in-flight generation for the same video and persists the result", async () => {
    const cache: LearningContentCache<string> = new Map();
    const generate = vi.fn().mockResolvedValue(["content"]);
    const request = { cache, storagePrefix, videoId, generate };

    const first = loadCachedContent(request);
    const second = loadCachedContent(request);

    expect(second).toBe(first);
    await expect(first).resolves.toEqual(["content"]);
    expect(localStorage.getItem(storageKey)).toBe('["content"]');
    expect(generate).toHaveBeenCalledOnce();
  });

  it("restores stored arrays without generating, including an empty stored array", async () => {
    const generate = vi.fn();
    for (const stored of [["saved"], []]) {
      localStorage.setItem(storageKey, JSON.stringify(stored));
      const cache: LearningContentCache<string> = new Map();

      await expect(loadCachedContent({ cache, storagePrefix, videoId, generate })).resolves.toEqual(stored);
      expect(cache.has(videoId)).toBe(true);
    }
    expect(generate).not.toHaveBeenCalled();
  });

  it.each(["not-json", '{"invalid":"object"}'])("replaces invalid stored content: %s", async (stored) => {
    localStorage.setItem(storageKey, stored);
    const cache: LearningContentCache<string> = new Map();
    const generate = vi.fn().mockResolvedValue(["fresh"]);

    await expect(loadCachedContent({ cache, storagePrefix, videoId, generate })).resolves.toEqual(["fresh"]);

    expect(generate).toHaveBeenCalledOnce();
    expect(localStorage.getItem(storageKey)).toBe('["fresh"]');
  });

  it("keeps memory caching when persistent storage is unavailable", async () => {
    for (const method of ["getItem", "setItem", "removeItem"] as const) {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => { throw new Error("Storage unavailable"); });
    }
    const cache: LearningContentCache<string> = new Map();
    const generate = vi.fn().mockResolvedValue(["memory only"]);
    const request = { cache, storagePrefix, videoId, generate };

    await expect(loadCachedContent(request)).resolves.toEqual(["memory only"]);
    await expect(loadCachedContent(request)).resolves.toEqual(["memory only"]);
    expect(generate).toHaveBeenCalledOnce();
  });

  it("removes a failed first request so a subsequent load can retry", async () => {
    const cache: LearningContentCache<string> = new Map();
    const generate = vi.fn().mockRejectedValueOnce(new Error("temporary failure")).mockResolvedValueOnce(["recovered"]);
    const request = { cache, storagePrefix, videoId, generate };

    await expect(loadCachedContent(request)).rejects.toThrow("temporary failure");
    expect(cache.has(videoId)).toBe(false);
    await expect(loadCachedContent(request)).resolves.toEqual(["recovered"]);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("does not let a stale rejection remove a newer regeneration", async () => {
    let rejectOld!: (error: Error) => void;
    const oldPromise = new Promise<string[]>((_resolve, reject) => { rejectOld = reject; });
    const cache: LearningContentCache<string> = new Map();
    const generate = vi.fn().mockReturnValueOnce(oldPromise).mockResolvedValueOnce(["new content"]);
    const request = { cache, storagePrefix, videoId, generate };
    const oldRequest = loadCachedContent(request);
    const newRequest = loadCachedContent({ ...request, regenerate: true });

    await expect(newRequest).resolves.toEqual(["new content"]);
    rejectOld(new Error("old request failed"));
    await expect(oldRequest).rejects.toThrow("old request failed");

    expect(loadCachedContent(request)).toBe(newRequest);
    expect(localStorage.getItem(storageKey)).toBe('["new content"]');
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("isolates cache entries across videos and content types", async () => {
    const quizCache: LearningContentCache<string> = new Map();
    const flashcardCache: LearningContentCache<string> = new Map();
    const quizGenerator = vi.fn().mockResolvedValue(["quiz"]);
    const flashcardGenerator = vi.fn().mockResolvedValue(["flashcard"]);

    await loadCachedContent({ cache: quizCache, storagePrefix, videoId, generate: quizGenerator });
    await loadCachedContent({ cache: quizCache, storagePrefix, videoId: "video-2", generate: quizGenerator });
    await expect(loadCachedContent({
      cache: flashcardCache, storagePrefix: "test:flashcards:", videoId, generate: flashcardGenerator,
    })).resolves.toEqual(["flashcard"]);

    expect(quizCache.size).toBe(2);
    expect(flashcardCache.size).toBe(1);
    expect(quizGenerator).toHaveBeenCalledTimes(2);
    expect(flashcardGenerator).toHaveBeenCalledOnce();
  });
});
