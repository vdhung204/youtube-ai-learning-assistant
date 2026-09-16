import { useCallback, useRef } from "react";
import {
  generateFlashcards,
  generateQuiz,
  type GenerateContent,
} from "../../integrations/learning/pipeline";
import type { Question } from "../../types/api";
import type { CurrentVideo, Flashcard } from "../../types/learning";

interface LoadOptions {
  regenerate?: boolean;
}

const QUIZ_STORAGE_PREFIX = "yala:quiz-cache:v1:";
const FLASHCARD_STORAGE_PREFIX = "yala:flashcard-cache:v1:";

function removeStored(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // The in-memory cache remains available.
  }
}

function readStoredArray<T>(key: string): T | undefined {
  try {
    const value = localStorage.getItem(key);
    if (!value) {
      return undefined;
    }
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed as T;
    }
    removeStored(key);
  } catch {
    removeStored(key);
  }
  return undefined;
}

function writeStored(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The in-memory cache still works when extension storage is unavailable/full.
  }
}

function loadCached<T>(
  cache: Map<string, Promise<T>>,
  storagePrefix: string,
  videoId: string,
  factory: () => Promise<T>,
  regenerate = false,
): Promise<T> {
  const storageKey = `${storagePrefix}${videoId}`;
  if (!regenerate) {
    const cached = cache.get(videoId);
    if (cached) {
      return cached;
    }
    const stored = readStoredArray<T>(storageKey);
    if (stored) {
      const storedRequest = Promise.resolve(stored);
      cache.set(videoId, storedRequest);
      return storedRequest;
    }
  } else {
    removeStored(storageKey);
  }

  const request = factory().then((value) => {
    writeStored(storageKey, value);
    return value;
  });
  cache.set(videoId, request);
  void request.catch(() => {
    // Failed generations are removed so an explicit retry can make a new request.
    if (cache.get(videoId) === request) {
      cache.delete(videoId);
    }
  });
  return request;
}

export function useLearningContentCache(generateContent: GenerateContent) {
  const quizCache = useRef(new Map<string, Promise<Question[]>>());
  const flashcardCache = useRef(new Map<string, Promise<Flashcard[]>>());
  const generateContentRef = useRef(generateContent);
  generateContentRef.current = generateContent;

  const loadQuiz = useCallback((video: CurrentVideo, options: LoadOptions = {}) => (
    loadCached(
      quizCache.current,
      QUIZ_STORAGE_PREFIX,
      video.videoId,
      () => generateQuiz(video, generateContentRef.current),
      options.regenerate,
    )
  ), []);

  const loadFlashcards = useCallback((video: CurrentVideo, options: LoadOptions = {}) => (
    loadCached(
      flashcardCache.current,
      FLASHCARD_STORAGE_PREFIX,
      video.videoId,
      () => generateFlashcards(video, generateContentRef.current),
      options.regenerate,
    )
  ), []);

  return { loadFlashcards, loadQuiz };
}
